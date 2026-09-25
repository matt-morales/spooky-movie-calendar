package httpapi_test

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/matt-morales/spooky-movie-calendar/go/internal/adapter/httpapi"
	"github.com/matt-morales/spooky-movie-calendar/go/internal/domain"
)

func echoVisitor(w http.ResponseWriter, r *http.Request) {
	id, _ := httpapi.VisitorFrom(r.Context())
	w.Write([]byte(id))
}

func TestNewVisitorGetsSignedCookie(t *testing.T) {
	h := httpapi.VisitorMiddleware([]byte("secret"), true)(http.HandlerFunc(echoVisitor))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest("GET", "/api/movies", nil))

	cookies := rec.Result().Cookies()
	if len(cookies) != 1 {
		t.Fatalf("got %d cookies", len(cookies))
	}
	c := cookies[0]
	if c.Name != httpapi.VisitorCookie || !c.HttpOnly || !c.Secure || c.SameSite != http.SameSiteLaxMode || c.Path != "/" || c.MaxAge <= 0 {
		t.Errorf("cookie attributes wrong: %+v", c)
	}
	if rec.Body.Len() < 16 || !strings.HasPrefix(c.Value, rec.Body.String()+".") {
		t.Errorf("handler saw %q, cookie is %q", rec.Body, c.Value)
	}
}

func TestReturningVisitorKeepsTheirID(t *testing.T) {
	h := httpapi.VisitorMiddleware([]byte("secret"), false)(http.HandlerFunc(echoVisitor))

	first := httptest.NewRecorder()
	h.ServeHTTP(first, httptest.NewRequest("GET", "/", nil))
	cookie := first.Result().Cookies()[0]

	req := httptest.NewRequest("GET", "/", nil)
	req.AddCookie(cookie)
	second := httptest.NewRecorder()
	h.ServeHTTP(second, req)

	if second.Body.String() != first.Body.String() {
		t.Errorf("visitor changed: %q -> %q", first.Body, second.Body)
	}

	// Sliding expiry: every visit pushes the expiry out again, so the cookie
	// lasts 400 days from the last visit, not the first.
	refreshed := second.Result().Cookies()
	if len(refreshed) != 1 {
		t.Fatalf("got %d cookies, want the existing cookie re-sent", len(refreshed))
	}
	r := refreshed[0]
	if r.Value != cookie.Value || r.MaxAge != cookie.MaxAge || !r.HttpOnly || r.SameSite != http.SameSiteLaxMode || r.Path != "/" {
		t.Errorf("refreshed cookie = %+v, want same value and attributes as %+v", r, cookie)
	}
}

func TestForgedCookieIsReplaced(t *testing.T) {
	h := httpapi.VisitorMiddleware([]byte("secret"), false)(http.HandlerFunc(echoVisitor))
	req := httptest.NewRequest("GET", "/", nil)
	req.AddCookie(&http.Cookie{Name: httpapi.VisitorCookie, Value: "someone-else.bad-signature"})
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Body.String() == "someone-else" || domain.VisitorID(rec.Body.String()) == "" {
		t.Errorf("forged identity accepted: %q", rec.Body)
	}
	if len(rec.Result().Cookies()) != 1 {
		t.Errorf("forged cookie should be replaced")
	}
}
