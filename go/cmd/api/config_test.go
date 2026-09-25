package main

import (
	"strings"
	"testing"
)

func env(m map[string]string) func(string) string {
	return func(k string) string { return m[k] }
}

var required = map[string]string{
	"DATABASE_URL":     "postgres://localhost/db",
	"VISITOR_SECRET":   strings.Repeat("s", 32),
	"TURNSTILE_SECRET": "1x0000000000000000000000000000000AA",
}

func TestLoadConfigDefaults(t *testing.T) {
	cfg, err := loadConfig(env(required))
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Port != "8080" || !cfg.SecureCookies || !cfg.MigrateOnStart || cfg.ImagesBaseURL != "https://images.31nightsofhorror.com" {
		t.Errorf("defaults = %+v", cfg)
	}
}

func TestLoadConfigOverrides(t *testing.T) {
	m := map[string]string{"PORT": "9000", "SECURE_COOKIES": "false", "MIGRATE_ON_START": "false", "IMAGES_BASE_URL": "/images", "IMAGES_DIR": "../assets"}
	for k, v := range required {
		m[k] = v
	}
	cfg, err := loadConfig(env(m))
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Port != "9000" || cfg.SecureCookies || cfg.MigrateOnStart || cfg.ImagesBaseURL != "/images" || cfg.ImagesDir != "../assets" {
		t.Errorf("overrides not applied: %+v", cfg)
	}
}

func TestLoadConfigRequiresSecrets(t *testing.T) {
	for key := range required {
		m := map[string]string{}
		for k, v := range required {
			if k != key {
				m[k] = v
			}
		}
		if _, err := loadConfig(env(m)); err == nil || !strings.Contains(err.Error(), key) {
			t.Errorf("missing %s: err = %v", key, err)
		}
	}

	short := map[string]string{}
	for k, v := range required {
		short[k] = v
	}
	short["VISITOR_SECRET"] = "too-short"
	if _, err := loadConfig(env(short)); err == nil {
		t.Error("short VISITOR_SECRET accepted")
	}
}
