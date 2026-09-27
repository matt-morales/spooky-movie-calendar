// Command events prints saved analytics reports from the events table. It
// only reads: every report runs in a read-only transaction, and it never
// runs migrations, so it's safe to point at production.
//
//	make events                       # summary of the last 7 days
//	make events REPORT=movies DAYS=30
//
//	DATABASE_URL=postgres://... go run ./cmd/events [-days 7] [-tz UTC] [report]
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
}

type report struct {
	title string
	sql   string // $1 is the number of days to look back
}

const window = `occurred_at > now() - make_interval(days => $1)`

// movieID is the movie an event is about: ratings, reviews and "watched"
// carry a movieId; comments carry their thread key, "movie:<id>".
const movieID = `COALESCE(e.props->>'movieId', substring(e.props->>'threadKey' from '^movie:(.*)$'))`

var reports = map[string]report{
	"types": {"Events by type", `
		SELECT type, count(*) AS events, count(DISTINCT visitor_id) AS visitors
		FROM events WHERE ` + window + `
		GROUP BY type ORDER BY events DESC, type`},

	"daily": {"Per day", `
		SELECT occurred_at::date AS day,
		       count(*) FILTER (WHERE type = 'page_view')                    AS page_views,
		       count(DISTINCT visitor_id) FILTER (WHERE type = 'page_view')  AS visitors,
		       count(DISTINCT session_id) FILTER (WHERE type = 'page_view')  AS sessions,
		       count(*) FILTER (WHERE type = 'rating_saved')                 AS ratings,
		       count(*) FILTER (WHERE type = 'comment_posted')               AS comments
		FROM events WHERE ` + window + `
		GROUP BY 1 ORDER BY 1 DESC`},

	"nights": {"Nights picked on the calendar", `
		SELECT (props->>'day')::int AS night, count(*) AS clicks, count(DISTINCT visitor_id) AS visitors
		FROM events WHERE type = 'day_selected' AND ` + window + `
		GROUP BY 1 ORDER BY clicks DESC, night`},

	"movies": {"Activity per movie", `
		SELECT ` + movieID + ` AS movie, COALESCE(m.title, '') AS title,
		       count(*) FILTER (WHERE e.type = 'reviews_opened')  AS reviews_opened,
		       count(*) FILTER (WHERE e.type = 'rating_saved')    AS ratings,
		       count(*) FILTER (WHERE e.type = 'watched_toggled' AND (e.props->>'watched')::boolean) AS watched,
		       count(*) FILTER (WHERE e.type = 'comment_posted')  AS comments
		FROM events e LEFT JOIN movies m ON m.id = ` + movieID + `
		WHERE ` + movieID + ` IS NOT NULL AND e.` + window + `
		GROUP BY 1, 2 ORDER BY count(*) DESC, movie`},

	"countries": {"Visitors by country", `
		SELECT COALESCE(NULLIF(country, ''), '?') AS country,
		       count(DISTINCT visitor_id) AS visitors, count(*) AS page_views
		FROM events WHERE type = 'page_view' AND ` + window + `
		GROUP BY 1 ORDER BY visitors DESC, country`},

	"referrers": {"Where visits came from", `
		SELECT substring(referrer from '^https?://([^/]+)') AS site,
		       count(*) AS page_views, count(DISTINCT visitor_id) AS visitors
		FROM events WHERE type = 'page_view' AND referrer <> '' AND ` + window + `
		GROUP BY 1 ORDER BY page_views DESC, site LIMIT 25`},

	"latest": {"Latest events", `
		SELECT to_char(occurred_at, 'YYYY-MM-DD HH24:MI:SS') AS at, type, path, country,
		       left(visitor_id, 8) AS visitor, props::text AS props
		FROM events WHERE ` + window + `
		ORDER BY occurred_at DESC LIMIT 50`},
}

// "summary" is several reports in one.
var summary = []string{"types", "daily"}

func reportNames() []string {
	names := []string{"summary"}
	for name := range reports {
		names = append(names, name)
	}
	slices.Sort(names[1:])
	return names
}

func main() {
	var o options
	flag.IntVar(&o.days, "days", 7, "how many days back to look")
	flag.StringVar(&o.tz, "tz", "UTC", `time zone for days and times, e.g. "Asia/Singapore"`)
	flag.Usage = func() {
		fmt.Fprintf(flag.CommandLine.Output(), "usage: events [-days N] [-tz ZONE] [%s]\n", strings.Join(reportNames(), " | "))
		flag.PrintDefaults()
	}
	flag.Parse()

	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		log.Fatal("DATABASE_URL is required")
	}
	name := flag.Arg(0)
	if name == "" {
		name = "summary"
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

// run prints the named report (or each report in the summary).
func run(ctx context.Context, conn *pgx.Conn, w io.Writer, name string, o options) error {
	names := []string{name}
	if name == "summary" {
		names = summary
	} else if _, ok := reports[name]; !ok {
		return fmt.Errorf("unknown report %q; try one of: %s", name, strings.Join(reportNames(), ", "))
	}

	return readOnly(ctx, conn, o.tz, func(tx pgx.Tx) error {
		for i, n := range names {
			if i > 0 {
				fmt.Fprintln(w)
			}
			r := reports[n]
			fmt.Fprintf(w, "%s, last %d days (%s)\n", r.title, o.days, o.tz)
			rows, err := tx.Query(ctx, r.sql, o.days)
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
