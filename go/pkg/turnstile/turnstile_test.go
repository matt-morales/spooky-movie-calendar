package turnstile_test

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/matt-morales/spooky-movie-calendar/go/pkg/turnstile"
)

func fakeSiteverify(t *testing.T, wantSecret string, success bool) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if err := r.ParseForm(); err != nil {
			t.Error(err)
		}
		if r.PostForm.Get("secret") != wantSecret {
			t.Errorf("secret = %q", r.PostForm.Get("secret"))
		}
		if r.PostForm.Get("response") != "tok" || r.PostForm.Get("remoteip") != "203.0.113.9" {
			t.Errorf("unexpected form: %v", r.PostForm)
		}
		json.NewEncoder(w).Encode(map[string]any{"success": success})
	}))
}

func TestVerifySuccess(t *testing.T) {
	srv := fakeSiteverify(t, "s3cret", true)
	defer srv.Close()

	v := turnstile.New("s3cret", turnstile.WithEndpoint(srv.URL))
	if err := v.Verify(context.Background(), "tok", "203.0.113.9"); err != nil {
		t.Fatalf("got %v", err)
	}
}

func TestVerifyFailureIsRejected(t *testing.T) {
	srv := fakeSiteverify(t, "s3cret", false)
	defer srv.Close()

	v := turnstile.New("s3cret", turnstile.WithEndpoint(srv.URL))
	if err := v.Verify(context.Background(), "tok", "203.0.113.9"); !errors.Is(err, turnstile.ErrRejected) {
		t.Fatalf("got %v, want ErrRejected", err)
	}
}

func TestVerifyEmptyTokenSkipsNetwork(t *testing.T) {
	v := turnstile.New("s3cret", turnstile.WithEndpoint("http://127.0.0.1:1"))
	if err := v.Verify(context.Background(), "", ""); !errors.Is(err, turnstile.ErrRejected) {
		t.Fatalf("got %v, want ErrRejected", err)
	}
}

func TestVerifyOutageIsNotBlamedOnUser(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadGateway)
	}))
	defer srv.Close()

	v := turnstile.New("s3cret", turnstile.WithEndpoint(srv.URL))
	err := v.Verify(context.Background(), "tok", "203.0.113.9")
	if err == nil || errors.Is(err, turnstile.ErrRejected) {
		t.Fatalf("got %v, want a non-ErrRejected error", err)
	}
}
