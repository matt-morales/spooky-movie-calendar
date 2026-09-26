// Command api is the 31 Nights backend. It is the composition root: it reads
// config, builds the adapters and wires them into the use cases.
//
//	api                            serve HTTP (runs migrations first by default)
//	api migrate                    apply migrations and exit
//	api comment-status ID STATUS   moderate a comment (visible | hidden | deleted)
package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/matt-morales/spooky-movie-calendar/go/internal/adapter/httpapi"
	"github.com/matt-morales/spooky-movie-calendar/go/internal/adapter/postgres"
	"github.com/matt-morales/spooky-movie-calendar/go/internal/app"
	"github.com/matt-morales/spooky-movie-calendar/go/internal/domain"
	"github.com/matt-morales/spooky-movie-calendar/go/pkg/comment"
	commentpg "github.com/matt-morales/spooky-movie-calendar/go/pkg/comment/postgres"
	"github.com/matt-morales/spooky-movie-calendar/go/pkg/turnstile"
)

func main() {
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{ReplaceAttr: cloudLogging})))

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	if err := run(ctx, os.Args[1:]); err != nil {
		slog.Error("fatal", "err", err)
		os.Exit(1)
	}
}

func run(ctx context.Context, args []string) error {
	cfg, err := loadConfig(os.Getenv)
	if err != nil {
		return err
	}

	cmd := "serve"
	if len(args) > 0 {
		cmd = args[0]
	}
	switch cmd {
	case "migrate":
		return migrateAll(cfg.DatabaseURL)
	case "serve":
		return serve(ctx, cfg)
	case "comment-status":
		return commentStatus(ctx, cfg, args[1:])
	default:
		return fmt.Errorf("unknown command %q", cmd)
	}
}

func migrateAll(databaseURL string) error {
	if err := postgres.Migrate(databaseURL); err != nil {
		return err
	}
	return commentpg.Migrate(databaseURL)
}

func serve(ctx context.Context, cfg config) error {
	if cfg.MigrateOnStart {
		if err := migrateAll(cfg.DatabaseURL); err != nil {
			return err
		}
	}
	pool, err := pgxpool.New(ctx, cfg.DatabaseURL)
	if err != nil {
		return err
	}
	defer pool.Close()

	// Driven adapters.
	store := postgres.New(pool)
	captcha := turnstile.New(cfg.TurnstileSecret)
	verifier := comment.VerifierFunc(func(ctx context.Context, token, ip string) error {
		err := captcha.Verify(ctx, token, ip)
		if errors.Is(err, turnstile.ErrRejected) {
			return comment.ErrNotHuman
		}
		return err
	})

	// Use cases.
	now := time.Now
	analytics := app.NewAnalytics(store, now)
	comments := comment.NewService(commentpg.New(pool), verifier,
		// Movie reviews are a flat list: no replies.
		comment.WithConfig(comment.Config{MaxDepth: 1}),
		comment.WithOnPosted(func(ctx context.Context, c comment.Comment) {
			analytics.Record(ctx, "comment_posted", domain.VisitorID(c.AuthorID), map[string]any{
				"threadKey": c.ThreadKey, "commentId": int64(c.ID), "parentId": int64(c.ParentID),
			})
		}))

	// Driving adapter.
	var handler http.Handler = httpapi.NewServer(httpapi.Config{
		Catalog:       app.NewCatalog(store, store),
		Ratings:       app.NewRatings(store, store, analytics, now),
		Analytics:     analytics,
		Comments:      comments,
		VisitorSecret: cfg.VisitorSecret,
		SecureCookies: cfg.SecureCookies,
		ImagesBaseURL: cfg.ImagesBaseURL,
	})
	if cfg.ImagesDir != "" {
		mux := http.NewServeMux()
		mux.Handle("/images/", http.StripPrefix("/images/", http.FileServer(http.Dir(cfg.ImagesDir))))
		mux.Handle("/", handler)
		handler = mux
	}

	srv := &http.Server{Addr: ":" + cfg.Port, Handler: handler, ReadHeaderTimeout: 10 * time.Second}
	errc := make(chan error, 1)
	go func() { errc <- srv.ListenAndServe() }()
	slog.Info("listening", "port", cfg.Port)

	select {
	case err := <-errc:
		return err
	case <-ctx.Done():
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		return srv.Shutdown(shutdownCtx)
	}
}

func commentStatus(ctx context.Context, cfg config, args []string) error {
	if len(args) != 2 {
		return errors.New("usage: api comment-status ID visible|hidden|deleted")
	}
	id, err := strconv.ParseInt(args[0], 10, 64)
	if err != nil {
		return fmt.Errorf("bad comment id: %w", err)
	}
	pool, err := pgxpool.New(ctx, cfg.DatabaseURL)
	if err != nil {
		return err
	}
	defer pool.Close()
	svc := comment.NewService(commentpg.New(pool), nil)
	return svc.Moderate(ctx, comment.ID(id), comment.Status(args[1]))
}

// cloudLogging renames slog's keys to the ones Google Cloud Logging reads.
func cloudLogging(_ []string, a slog.Attr) slog.Attr {
	switch a.Key {
	case slog.LevelKey:
		a.Key = "severity"
	case slog.MessageKey:
		a.Key = "message"
	}
	return a
}
