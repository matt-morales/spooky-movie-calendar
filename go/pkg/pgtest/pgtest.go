// Package pgtest runs a real Postgres for integration tests.
//
// By default it starts an embedded Postgres binary (no Docker needed). Set
// PGTEST_URL to point tests at an existing server instead, e.g. a CI service
// container or a throwaway Neon branch.
//
// Typical use from a package's TestMain:
//
//	var pg *pgtest.Server
//
//	func TestMain(m *testing.M) {
//		pg = pgtest.MustStart()
//		code := m.Run()
//		pg.Stop()
//		os.Exit(code)
//	}
//
// and then in a test: url := pg.NewDatabase(t) for an isolated, empty database.
package pgtest

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"io"
	"net"
	"net/url"
	"os"
	"path/filepath"
	"testing"

	embeddedpostgres "github.com/fergusstrange/embedded-postgres"
	"github.com/jackc/pgx/v5"
)

// Version matches the Postgres major version we run on Neon.
const Version = embeddedpostgres.V17

type Server struct {
	url      string
	embedded *embeddedpostgres.EmbeddedPostgres
	tmp      string
}

// MustStart is Start for use in TestMain.
func MustStart() *Server {
	s, err := Start()
	if err != nil {
		fmt.Fprintln(os.Stderr, "pgtest:", err)
		os.Exit(1)
	}
	return s
}

// Start connects to PGTEST_URL if set, otherwise boots an embedded Postgres
// on a free port with its own temporary data directory.
func Start() (*Server, error) {
	if u := os.Getenv("PGTEST_URL"); u != "" {
		return &Server{url: u}, nil
	}

	port, err := freePort()
	if err != nil {
		return nil, err
	}
	tmp, err := os.MkdirTemp("", "pgtest-*")
	if err != nil {
		return nil, err
	}
	cache, err := os.UserCacheDir()
	if err != nil {
		cache = tmp
	}

	cfg := embeddedpostgres.DefaultConfig().
		Version(Version).
		Port(uint32(port)).
		Username("postgres").
		Password("postgres").
		Database("postgres").
		CachePath(filepath.Join(cache, "pgtest")).
		RuntimePath(filepath.Join(tmp, "runtime")).
		BinariesPath(filepath.Join(tmp, "bin")).
		DataPath(filepath.Join(tmp, "data")).
		Logger(io.Discard)

	pg := embeddedpostgres.NewDatabase(cfg)
	if err := pg.Start(); err != nil {
		os.RemoveAll(tmp)
		return nil, fmt.Errorf("start embedded postgres: %w", err)
	}
	return &Server{
		url:      fmt.Sprintf("postgres://postgres:postgres@localhost:%d/postgres?sslmode=disable", port),
		embedded: pg,
		tmp:      tmp,
	}, nil
}

// Stop shuts down the embedded server (a no-op for PGTEST_URL).
func (s *Server) Stop() {
	if s.embedded != nil {
		_ = s.embedded.Stop()
		_ = os.RemoveAll(s.tmp)
	}
}

// NewDatabase creates an empty database for one test and drops it afterwards.
// It returns the connection URL.
func (s *Server) NewDatabase(t testing.TB) string {
	t.Helper()
	ctx := context.Background()

	name := "t_" + randomHex(8)
	admin, err := pgx.Connect(ctx, s.url)
	if err != nil {
		t.Fatalf("pgtest: connect: %v", err)
	}
	defer admin.Close(ctx)
	if _, err := admin.Exec(ctx, "CREATE DATABASE "+name); err != nil {
		t.Fatalf("pgtest: create database: %v", err)
	}

	t.Cleanup(func() {
		c, err := pgx.Connect(ctx, s.url)
		if err != nil {
			return
		}
		defer c.Close(ctx)
		_, _ = c.Exec(ctx, "DROP DATABASE IF EXISTS "+name+" WITH (FORCE)")
	})

	u, err := url.Parse(s.url)
	if err != nil {
		t.Fatalf("pgtest: parse url: %v", err)
	}
	u.Path = "/" + name
	return u.String()
}

func freePort() (int, error) {
	l, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return 0, err
	}
	defer l.Close()
	return l.Addr().(*net.TCPAddr).Port, nil
}

func randomHex(n int) string {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}
