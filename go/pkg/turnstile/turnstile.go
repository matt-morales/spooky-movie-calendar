// Package turnstile verifies Cloudflare Turnstile tokens (Cloudflare's
// privacy-friendly CAPTCHA replacement). It is independent of any feature;
// callers map ErrRejected onto their own domain error.
//
// For local development use Cloudflare's test secret
// "1x0000000000000000000000000000000AA", which always passes.
package turnstile

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// ErrRejected means Cloudflare judged the token invalid (likely a bot).
var ErrRejected = errors.New("turnstile: token rejected")

const DefaultEndpoint = "https://challenges.cloudflare.com/turnstile/v0/siteverify"

type Verifier struct {
	secret   string
	endpoint string
	client   *http.Client
}

type Option func(*Verifier)

func WithEndpoint(u string) Option { return func(v *Verifier) { v.endpoint = u } }

func New(secret string, opts ...Option) *Verifier {
	v := &Verifier{
		secret:   secret,
		endpoint: DefaultEndpoint,
		client:   &http.Client{Timeout: 5 * time.Second},
	}
	for _, o := range opts {
		o(v)
	}
	return v
}

// Verify returns ErrRejected when the token is missing or rejected, and a
// different error when Cloudflare can't be reached.
func (v *Verifier) Verify(ctx context.Context, token, remoteIP string) error {
	if token == "" {
		return ErrRejected
	}
	form := url.Values{"secret": {v.secret}, "response": {token}}
	if remoteIP != "" {
		form.Set("remoteip", remoteIP)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, v.endpoint, strings.NewReader(form.Encode()))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := v.client.Do(req)
	if err != nil {
		return fmt.Errorf("turnstile: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("turnstile: unexpected status %d", resp.StatusCode)
	}

	var out struct {
		Success bool `json:"success"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return fmt.Errorf("turnstile: decode: %w", err)
	}
	if !out.Success {
		return ErrRejected
	}
	return nil
}
