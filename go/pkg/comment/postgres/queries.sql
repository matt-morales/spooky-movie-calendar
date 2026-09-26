-- name: InsertComment :one
INSERT INTO comments (thread_key, parent_id, depth, author_id, author_name, body, status, created_at)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
RETURNING *;

-- name: GetComment :one
SELECT * FROM comments WHERE id = $1;

-- ListThread fetches one page of top-level comments (newest first, older than
-- before_id unless it is 0) plus every reply beneath them, in one query.
-- name: ListThread :many
WITH RECURSIVE thread AS (
    (SELECT r.* FROM comments r
     WHERE r.thread_key = sqlc.arg(thread_key)
       AND r.parent_id IS NULL
       AND (sqlc.arg(before_id)::bigint = 0 OR r.id < sqlc.arg(before_id)::bigint)
     ORDER BY r.id DESC
     LIMIT sqlc.arg(page_size))
    UNION ALL
    SELECT c.* FROM comments c JOIN thread t ON c.parent_id = t.id
)
SELECT * FROM thread;

-- name: CountCommentsByAuthorSince :one
SELECT count(*) FROM comments WHERE author_id = $1 AND created_at >= $2;

-- name: SetCommentStatus :execrows
UPDATE comments SET status = $2 WHERE id = $1;
