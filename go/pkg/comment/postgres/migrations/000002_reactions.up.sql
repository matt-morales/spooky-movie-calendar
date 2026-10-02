-- Emoji reactions on comments: one row per person per emoji per comment.
CREATE TABLE comment_reactions (
    comment_id bigint      NOT NULL REFERENCES comments (id),
    author_id  text        NOT NULL,
    emoji      text        NOT NULL CHECK (octet_length(emoji) BETWEEN 1 AND 64),
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (comment_id, author_id, emoji)
);

-- Counting a lineup's visible comments per thread, for "3 reviews".
CREATE INDEX comments_thread_visible ON comments (thread_key) WHERE status = 'visible';
