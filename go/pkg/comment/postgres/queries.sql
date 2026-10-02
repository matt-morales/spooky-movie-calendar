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

-- name: AddReaction :exec
INSERT INTO comment_reactions (comment_id, author_id, emoji, created_at)
VALUES ($1, $2, $3, $4)
ON CONFLICT DO NOTHING;

-- name: RemoveReaction :exec
DELETE FROM comment_reactions WHERE comment_id = $1 AND author_id = $2 AND emoji = $3;

-- name: ListReactions :many
SELECT * FROM comment_reactions
WHERE comment_id = ANY(sqlc.arg(ids)::bigint[])
ORDER BY created_at, comment_id, emoji, author_id;

-- name: CountVisibleByThread :many
SELECT thread_key, count(*) AS count
FROM comments
WHERE thread_key = ANY(sqlc.arg(thread_keys)::text[]) AND status = 'visible'
GROUP BY thread_key;
