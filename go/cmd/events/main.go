// Command events prints saved analytics reports: site events, plus per-movie
// ratings and reviews. It only reads: every report runs in a read-only
// transaction, and it never runs migrations, so it's safe against production.
//
//	make events                       # full report for the last 7 days
//	make events REPORT=movies DAYS=30 YEAR=2025
//
//	DATABASE_URL=postgres://... go run ./cmd/events [-days 7] [-tz UTC] [-year 2026] [report]
package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log"
	"os"
	"slices"
	"strings"
	"text/tabwriter"
	"time"

	"github.com/jackc/pgx/v5"
)

type options struct {
	days int    // how far back to look
	tz   string // time zone for grouping by day and showing times
	year int    // which lineup the movies report covers
}

type report struct {
	title string
	sql   string // may use @days (how far back to look) and @year (the lineup)
	// heading overrides the default "<title>, last N days (tz)".
	heading func(o options) string
}

// human leaves out automated traffic: headless browsers (including this
// repo's own Playwright checks), bots and crawlers. Server events have no
// user agent, so they're kept.
const human = `user_agent !~* '(headless|playwright|bot|crawl|spider)'`

// window selects human events from the last @days days. Every events query
// uses it, so no report counts automated traffic.
const window = `occurred_at > now() - make_interval(days => @days) AND ` + human

var reports = map[string]report{
	// Unique visitors are browsers (the signed "vid" cookie), not people. A
	// visitor is new on the day of their first event ever, returning after.
	// The "all" row covers the whole window: new if first seen inside it.
	"visitors": {title: "Unique visitors", sql: `
		WITH first_seen AS (
		    SELECT visitor_id, min(occurred_at) AS first_at FROM events WHERE visitor_id <> '' AND ` + human + ` GROUP BY 1),
		views AS (
		    SELECT e.visitor_id, e.session_id, e.occurred_at::date AS day, f.first_at
		    FROM events e JOIN first_seen f USING (visitor_id)
		    WHERE e.type = 'page_view' AND ` + window + `)
		SELECT 'all' AS day, count(DISTINCT visitor_id) AS visitors,
		       count(DISTINCT visitor_id) FILTER (WHERE first_at > now() - make_interval(days => @days)) AS new,
		       count(DISTINCT visitor_id) FILTER (WHERE first_at <= now() - make_interval(days => @days)) AS returning,
		       count(DISTINCT session_id) AS visits, count(*) AS page_views
		FROM views
		UNION ALL
		SELECT * FROM (
		    SELECT to_char(day, 'YYYY-MM-DD'), count(DISTINCT visitor_id),
		           count(DISTINCT visitor_id) FILTER (WHERE first_at::date = day),
		           count(DISTINCT visitor_id) FILTER (WHERE first_at::date < day),
		           count(DISTINCT session_id), count(*)
		    FROM views GROUP BY day ORDER BY day DESC) per_day`},

	// How loyal visitors are: on how many different days each one came.
	"returns": {title: "Days each visitor came", sql: `
		WITH per_visitor AS (
		    SELECT visitor_id, count(DISTINCT occurred_at::date) AS days
		    FROM events WHERE type = 'page_view' AND visitor_id <> '' AND ` + window + `
		    GROUP BY 1)
		SELECT days AS days_visited, count(*) AS visitors,
		       round(100.0 * count(*) / sum(count(*)) OVER ())::int || '%' AS share
		FROM per_visitor GROUP BY 1 ORDER BY 1`},

	"types": {title: "Events by type", sql: `
		SELECT type, count(*) AS events, count(DISTINCT visitor_id) AS visitors
		FROM events WHERE ` + window + `
		GROUP BY type ORDER BY events DESC, type`},

	"daily": {title: "Per day", sql: `
		SELECT occurred_at::date AS day,
		       count(*) FILTER (WHERE type = 'page_view')                    AS page_views,
		       count(DISTINCT visitor_id) FILTER (WHERE type = 'page_view')  AS visitors,
		       count(DISTINCT session_id) FILTER (WHERE type = 'page_view')  AS sessions,
		       count(*) FILTER (WHERE type = 'rating_saved')                 AS ratings,
		       count(*) FILTER (WHERE type = 'comment_posted')               AS comments
		FROM events WHERE ` + window + `
		GROUP BY 1 ORDER BY 1 DESC`},

	"nights": {title: "Nights picked on the calendar", sql: `
		SELECT (props->>'day')::int AS night, count(*) AS clicks, count(DISTINCT visitor_id) AS visitors
		FROM events WHERE type = 'day_selected' AND ` + window + `
		GROUP BY 1 ORDER BY clicks DESC, night`},

	// Every night of the lineup. Card opens and watched marks are events in
	// the window; ratings and reviews come from their own tables (all time),
	// so they include ratings imported from the old site.
	"movies": {title: "Per movie", sql: `
		WITH opened AS (
		    SELECT props->>'movieId' AS movie_id,
		           count(*) FILTER (WHERE type = 'reviews_opened') AS card_opens,
		           count(*) FILTER (WHERE type = 'watched_toggled' AND (props->>'watched')::boolean) AS watched
		    FROM events WHERE props ? 'movieId' AND ` + window + `
		    GROUP BY 1),
		rated AS (
		    SELECT movie_id, count(*) AS ratings, avg(value) AS average FROM ratings GROUP BY 1),
		reviewed AS (
		    SELECT substring(thread_key from '^movie:(.*)$') AS movie_id, count(*) AS reviews
		    FROM comments WHERE status = 'visible' GROUP BY 1)
		SELECT m.day AS night, m.title,
		       COALESCE(o.card_opens, 0) AS card_opens, COALESCE(o.watched, 0) AS watched,
		       COALESCE(r.ratings, 0) AS ratings, to_char(r.average, 'FM90.0') AS avg_of_10,
		       COALESCE(v.reviews, 0) AS reviews
		FROM movies m
		LEFT JOIN opened o ON o.movie_id = m.id
		LEFT JOIN rated r ON r.movie_id = m.id
		LEFT JOIN reviewed v ON v.movie_id = m.id
		WHERE m.year = @year
		ORDER BY m.day`,
		heading: func(o options) string {
			return fmt.Sprintf("Per movie, %d (card opens and watched: last %d days; ratings and reviews: all time)", o.year, o.days)
		}},

	"countries": {title: "Visitors by country", sql: `
		SELECT COALESCE(NULLIF(country, ''), '?') AS country,
		       count(DISTINCT visitor_id) AS visitors,
		       round(100.0 * count(DISTINCT visitor_id) / sum(count(DISTINCT visitor_id)) OVER ())::int || '%' AS share,
		       count(*) AS page_views,
		       count(DISTINCT session_id) AS sessions
		FROM events WHERE type = 'page_view' AND ` + window + `
		GROUP BY 1 ORDER BY visitors DESC, country`},

	"referrers": {title: "Where visits came from", sql: `
		SELECT substring(referrer from '^https?://([^/]+)') AS site,
		       count(*) AS page_views, count(DISTINCT visitor_id) AS visitors
		FROM events WHERE type = 'page_view' AND referrer <> '' AND ` + window + `
		GROUP BY 1 ORDER BY page_views DESC, site LIMIT 25`},

	"latest": {title: "Latest events", sql: `
		SELECT to_char(occurred_at, 'YYYY-MM-DD HH24:MI:SS') AS at, type, path, country,
		       left(visitor_id, 8) AS visitor, props::text AS props
		FROM events WHERE ` + window + `
		ORDER BY occurred_at DESC LIMIT 50`},
}

// Reports made of several others.
var groups = map[string][]string{
	"full":    {"visitors", "returns", "types", "daily", "movies", "countries"},
	"summary": {"types", "daily"},
}

func reportNames() []string {
	names := []string{"full", "summary"}
	var single []string
	for name := range reports {
		single = append(single, name)
	}
	slices.Sort(single)
	return append(names, single...)
}

func main() {
	var o options
	flag.IntVar(&o.days, "days", 7, "how many days back to look")
	flag.StringVar(&o.tz, "tz", "UTC", `time zone for days and times, e.g. "Asia/Singapore"`)
	flag.IntVar(&o.year, "year", time.Now().Year(), "which year's lineup the movies report covers")
	flag.Usage = func() {
		fmt.Fprintf(flag.CommandLine.Output(), "usage: events [-days N] [-tz ZONE] [-year YYYY] [%s]\n", strings.Join(reportNames(), " | "))
		flag.PrintDefaults()
	}
	flag.Parse()

	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		log.Fatal("DATABASE_URL is required")
	}
	name := flag.Arg(0)
	if name == "" {
		name = "full"
	}

	ctx := context.Background()
	conn, err := pgx.Connect(ctx, dbURL)
	if err != nil {
		log.Fatal(err)
	}
	defer conn.Close(ctx)

	if err := run(ctx, conn, os.Stdout, name, o); err != nil {
		log.Fatal(err)
	}
}

// run prints the named report (or each report in a group).
func run(ctx context.Context, conn *pgx.Conn, w io.Writer, name string, o options) error {
	names := []string{name}
	if group, ok := groups[name]; ok {
		names = group
	} else if _, ok := reports[name]; !ok {
		return fmt.Errorf("unknown report %q; try one of: %s", name, strings.Join(reportNames(), ", "))
	}

	return readOnly(ctx, conn, o.tz, func(tx pgx.Tx) error {
		for i, n := range names {
			if i > 0 {
				fmt.Fprintln(w)
			}
			r := reports[n]
			if r.heading != nil {
				fmt.Fprintln(w, r.heading(o))
			} else {
				fmt.Fprintf(w, "%s, last %d days (%s)\n", r.title, o.days, o.tz)
			}
			rows, err := tx.Query(ctx, r.sql, pgx.NamedArgs{"days": o.days, "year": o.year})
			if err != nil {
				return fmt.Errorf("%s: %w", n, err)
			}
			if err := printTable(w, rows); err != nil {
				return fmt.Errorf("%s: %w", n, err)
			}
		}
		return nil
	})
}

// readOnly runs fn in a read-only transaction with the session time zone set
// to tz, so the database itself refuses any write.
func readOnly(ctx context.Context, conn *pgx.Conn, tz string, fn func(pgx.Tx) error) error {
	tx, err := conn.BeginTx(ctx, pgx.TxOptions{AccessMode: pgx.ReadOnly})
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if _, err := tx.Exec(ctx, `SELECT set_config('TimeZone', $1, true)`, tz); err != nil {
		return fmt.Errorf("time zone %q: %w", tz, err)
	}
	return fn(tx)
}

func printTable(w io.Writer, rows pgx.Rows) error {
	defer rows.Close()
	tw := tabwriter.NewWriter(w, 0, 0, 2, ' ', 0)

	var header, rule []string
	for _, f := range rows.FieldDescriptions() {
		header = append(header, f.Name)
		rule = append(rule, strings.Repeat("─", len(f.Name)))
	}
	fmt.Fprintln(tw, strings.Join(header, "\t"))
	fmt.Fprintln(tw, strings.Join(rule, "\t"))

	n := 0
	for rows.Next() {
		values, err := rows.Values()
		if err != nil {
			return err
		}
		cells := make([]string, len(values))
		for i, v := range values {
			cells[i] = cell(v)
		}
		fmt.Fprintln(tw, strings.Join(cells, "\t"))
		n++
	}
	if err := rows.Err(); err != nil {
		return err
	}
	if n == 0 {
		fmt.Fprintln(tw, "(none)")
	}
	return tw.Flush()
}

func cell(v any) string {
	switch v := v.(type) {
	case nil:
		return ""
	case time.Time:
		return v.Format(time.DateOnly) // dates; times are formatted in SQL
	case map[string]any:
		b, _ := json.Marshal(v)
		return string(b)
	default:
		return fmt.Sprint(v)
	}
}
