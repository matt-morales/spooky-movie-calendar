// Command devdb runs a local Postgres for development without Docker. Data
// persists in .dev/pgdata at the repo root; stop it with Ctrl-C.
//
//	go run ./cmd/devdb      # postgres://postgres:postgres@localhost:5433/spooky?sslmode=disable
package main

import (
	"fmt"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"

	embeddedpostgres "github.com/fergusstrange/embedded-postgres"
	"github.com/matt-morales/spooky-movie-calendar/go/pkg/pgtest"
)

const port = 5433

func main() {
	root, err := filepath.Abs("../.dev")
	if err != nil {
		fail(err)
	}
	cache, _ := os.UserCacheDir()

	pg := embeddedpostgres.NewDatabase(embeddedpostgres.DefaultConfig().
		Version(pgtest.Version).
		Port(port).
		Database("spooky").
		RuntimePath(filepath.Join(root, "pgruntime")).
		DataPath(filepath.Join(root, "pgdata")).
		CachePath(filepath.Join(cache, "pgtest")))
	if err := pg.Start(); err != nil {
		fail(err)
	}
	fmt.Printf("Postgres ready: postgres://postgres:postgres@localhost:%d/spooky?sslmode=disable\n", port)

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)
	<-stop
	if err := pg.Stop(); err != nil {
		fail(err)
	}
}

func fail(err error) {
	fmt.Fprintln(os.Stderr, "devdb:", err)
	os.Exit(1)
}
