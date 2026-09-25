package httpapi

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"net/http"
	"strings"
	"time"

	"github.com/matt-morales/spooky-movie-calendar/go/internal/domain"
)

// Visitors are anonymous. The first API request from a browser (normally the
// page_view analytics event) mints a random visitor ID and stores it in an
// HttpOnly cookie signed with HMAC, so it can't be read by scripts or forged.
// Every response re-sends the cookie, so it expires 400 days after the
// visitor's last visit rather than their first (a sliding expiry).

const (
	VisitorCookie = "vid"
	visitorMaxAge = 400 * 24 * time.Hour // the longest browsers allow
)

type visitorKey struct{}

func VisitorFrom(ctx context.Context) (domain.VisitorID, bool) {
	v, ok := ctx.Value(visitorKey{}).(domain.VisitorID)
	return v, ok && v != ""
}

func VisitorMiddleware(secret []byte, secure bool) func(http.Handler) http.Handler {
	sign := func(id string) string {
		mac := hmac.New(sha256.New, secret)
		mac.Write([]byte(id))
		return base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
	}

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			id := ""
			if c, err := r.Cookie(VisitorCookie); err == nil {
				if v, sig, ok := strings.Cut(c.Value, "."); ok && hmac.Equal([]byte(sig), []byte(sign(v))) {
					id = v
				}
			}
			if id == "" {
				id = newVisitorID()
			}
			http.SetCookie(w, &http.Cookie{
				Name:     VisitorCookie,
				Value:    id + "." + sign(id),
				Path:     "/",
				MaxAge:   int(visitorMaxAge.Seconds()),
				HttpOnly: true,
				Secure:   secure,
				SameSite: http.SameSiteLaxMode,
			})
			ctx := context.WithValue(r.Context(), visitorKey{}, domain.VisitorID(id))
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

func newVisitorID() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}
