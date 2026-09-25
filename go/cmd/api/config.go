package main

import (
	"errors"
	"fmt"
)

type config struct {
	Port            string
	DatabaseURL     string
	VisitorSecret   []byte
	TurnstileSecret string
	ImagesBaseURL   string
	ImagesDir       string // local dev only: serve /images/ from this directory
	SecureCookies   bool
	MigrateOnStart  bool
}

// loadConfig reads settings from the environment (getenv is os.Getenv outside tests).
func loadConfig(getenv func(string) string) (config, error) {
	get := func(key, fallback string) string {
		if v := getenv(key); v != "" {
			return v
		}
		return fallback
	}
	cfg := config{
		Port:            get("PORT", "8080"),
		DatabaseURL:     getenv("DATABASE_URL"),
		VisitorSecret:   []byte(getenv("VISITOR_SECRET")),
		TurnstileSecret: getenv("TURNSTILE_SECRET"),
		ImagesBaseURL:   get("IMAGES_BASE_URL", "https://images.31nightsofhorror.com"),
		ImagesDir:       getenv("IMAGES_DIR"),
		SecureCookies:   get("SECURE_COOKIES", "true") != "false",
		MigrateOnStart:  get("MIGRATE_ON_START", "true") != "false",
	}

	var errs []error
	for key, v := range map[string]string{
		"DATABASE_URL":     cfg.DatabaseURL,
		"VISITOR_SECRET":   string(cfg.VisitorSecret),
		"TURNSTILE_SECRET": cfg.TurnstileSecret,
	} {
		if v == "" {
			errs = append(errs, fmt.Errorf("%s is required", key))
		}
	}
	if n := len(cfg.VisitorSecret); n > 0 && n < 32 {
		errs = append(errs, errors.New("VISITOR_SECRET must be at least 32 characters"))
	}
	return cfg, errors.Join(errs...)
}
