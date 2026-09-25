-- Threaded comments stored as an adjacency list: each row points at its parent.
CREATE TABLE comments (
    id          bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    thread_key  text        NOT NULL CHECK (thread_key ~ '^[a-z0-9][a-z0-9:._-]{0,127}$'),
    parent_id   bigint      REFERENCES comments (id),
    depth       smallint    NOT NULL DEFAULT 0 CHECK (depth >= 0),
    author_id   text        NOT NULL,
    author_name text        NOT NULL DEFAULT '' CHECK (char_length(author_name) <= 40),
    body        text        NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
    status      text        NOT NULL DEFAULT 'visible' CHECK (status IN ('visible', 'hidden', 'deleted')),
    created_at  timestamptz NOT NULL DEFAULT now(),
    CHECK ((parent_id IS NULL) = (depth = 0))
);

-- Page through a thread's top-level comments, newest first.
CREATE INDEX comments_thread_roots ON comments (thread_key, id DESC) WHERE parent_id IS NULL;
-- Walk down from a comment to its replies.
CREATE INDEX comments_parent ON comments (parent_id) WHERE parent_id IS NOT NULL;
-- Per-author rate limiting.
CREATE INDEX comments_author_recent ON comments (author_id, created_at DESC);
