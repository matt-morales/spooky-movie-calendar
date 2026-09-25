package memstore_test

import (
	"testing"

	"github.com/matt-morales/spooky-movie-calendar/go/pkg/comment"
	"github.com/matt-morales/spooky-movie-calendar/go/pkg/comment/memstore"
	"github.com/matt-morales/spooky-movie-calendar/go/pkg/comment/storetest"
)

func TestContract(t *testing.T) {
	storetest.Run(t, func(t *testing.T) comment.Store { return memstore.New() })
}
