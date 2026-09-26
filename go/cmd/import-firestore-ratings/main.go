// Command import-firestore-ratings copies the 2025 ratings from the old
// Firebase/Firestore backend into Postgres. It's a one-off, best-effort
// migration: invalid documents are skipped and re-running it is safe.
//
// Old visitors were Firebase anonymous users, so their ratings are stored
// under "firebase:<uid>". They count toward averages, but won't show as
// "your rating" for anyone, since browsers now get new visitor IDs.
//
//	FIRESTORE_TOKEN=$(gcloud auth print-access-token) \
//	DATABASE_URL=postgres://... \
//	go run ./cmd/import-firestore-ratings -project nightsofhorror-50265
package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/matt-morales/spooky-movie-calendar/go/internal/adapter/postgres"
	"github.com/matt-morales/spooky-movie-calendar/go/internal/domain"
)

type rating struct {
	movie   domain.MovieID
	visitor domain.VisitorID
	value   domain.RatingValue
	at      time.Time
}

func main() {
	project := flag.String("project", "nightsofhorror-50265", "Firebase/GCP project ID")
	year := flag.Int("year", 2025, "lineup year the old ratings belong to")
	flag.Parse()

	token, dbURL := os.Getenv("FIRESTORE_TOKEN"), os.Getenv("DATABASE_URL")
	if token == "" || dbURL == "" {
		log.Fatal("FIRESTORE_TOKEN and DATABASE_URL are required")
	}
	ctx := context.Background()

	if err := postgres.Migrate(dbURL); err != nil {
		log.Fatal(err)
	}
	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		log.Fatal(err)
	}
	defer pool.Close()
	store := postgres.New(pool)

	imported, skipped, pageToken := 0, 0, ""
	for {
		body, err := fetchPage(ctx, *project, token, pageToken)
		if err != nil {
			log.Fatal(err)
		}
		ratings, bad, next, err := parsePage(body, *year)
		if err != nil {
			log.Fatal(err)
		}
		skipped += bad
		for _, r := range ratings {
			if err := store.SaveRating(ctx, r.movie, r.visitor, r.value, r.at); err != nil {
				log.Printf("skip %s/%s: %v", r.movie, r.visitor, err)
				skipped++
				continue
			}
			imported++
		}
		if next == "" {
			break
		}
		pageToken = next
	}
	fmt.Printf("imported %d ratings, skipped %d\n", imported, skipped)
}

func fetchPage(ctx context.Context, project, token, pageToken string) ([]byte, error) {
	u := fmt.Sprintf("https://firestore.googleapis.com/v1/projects/%s/databases/(default)/documents/ratings?pageSize=300", project)
	if pageToken != "" {
		u += "&pageToken=" + url.QueryEscape(pageToken)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("firestore: %s: %s", resp.Status, body)
	}
	return body, err
}

// Firestore's REST API wraps every field in a typed value.
type value struct {
	StringValue    string `json:"stringValue"`
	IntegerValue   string `json:"integerValue"`
	TimestampValue string `json:"timestampValue"`
}

// parsePage maps one page of Firestore rating documents to ratings for the
// given lineup year. The old movie IDs were "1".."31".
func parsePage(body []byte, year int) (ratings []rating, skipped int, next string, err error) {
	var page struct {
		Documents []struct {
			Fields map[string]value `json:"fields"`
		} `json:"documents"`
		NextPageToken string `json:"nextPageToken"`
	}
	if err := json.Unmarshal(body, &page); err != nil {
		return nil, 0, "", err
	}

	for _, d := range page.Documents {
		day, err1 := strconv.Atoi(d.Fields["movieId"].StringValue)
		v, err2 := strconv.Atoi(d.Fields["value"].IntegerValue)
		movie, err3 := domain.ParseMovieID(string(domain.NewMovieID(year, day)))
		val, err4 := domain.ParseRating(v)
		user := d.Fields["userId"].StringValue
		if err1 != nil || err2 != nil || err3 != nil || err4 != nil || user == "" {
			skipped++
			continue
		}

		at := time.Now().UTC()
		for _, f := range []string{"updatedAt", "createdAt"} {
			if t, err := time.Parse(time.RFC3339Nano, d.Fields[f].TimestampValue); err == nil {
				at = t
				break
			}
		}
		ratings = append(ratings, rating{movie: movie, visitor: domain.VisitorID("firebase:" + user), value: val, at: at})
	}
	return ratings, skipped, page.NextPageToken, nil
}
