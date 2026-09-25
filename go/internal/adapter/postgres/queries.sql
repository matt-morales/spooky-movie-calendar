-- name: ListMoviesByYear :many
SELECT * FROM movies WHERE year = $1 ORDER BY day;

-- name: MovieExists :one
SELECT EXISTS (SELECT 1 FROM movies WHERE id = $1);

-- name: SaveRating :exec
INSERT INTO ratings (movie_id, visitor_id, value, created_at, updated_at)
VALUES ($1, $2, $3, sqlc.arg(at), sqlc.arg(at))
ON CONFLICT (movie_id, visitor_id)
DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at;

-- name: RatingSummary :one
SELECT COALESCE(avg(value), 0)::float8                              AS average,
       count(*)                                                     AS count,
       COALESCE(max(value) FILTER (WHERE visitor_id = sqlc.arg(visitor_id)), 0)::smallint AS mine -- 0 = not rated
FROM ratings
WHERE movie_id = sqlc.arg(movie_id);

-- name: RatingSummariesByYear :many
SELECT r.movie_id,
       avg(r.value)::float8                                                    AS average,
       count(*)                                                                AS count,
       COALESCE(max(r.value) FILTER (WHERE r.visitor_id = sqlc.arg(visitor_id)), 0)::smallint AS mine -- 0 = not rated
FROM ratings r
JOIN movies m ON m.id = r.movie_id
WHERE m.year = sqlc.arg(year)
GROUP BY r.movie_id;

-- name: InsertEvents :copyfrom
INSERT INTO events (type, source, visitor_id, session_id, path, referrer, user_agent, country, props, occurred_at, received_at)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11);
