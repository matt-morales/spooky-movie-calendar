-- One row per night of a year's lineup.
CREATE TABLE movies (
    id             text        PRIMARY KEY CHECK (id ~ '^\d{4}-\d{2}$'),
    year           int         NOT NULL,
    day            smallint    NOT NULL CHECK (day BETWEEN 1 AND 31),
    date           date        NOT NULL,
    title          text        NOT NULL CHECK (title <> ''),
    directors      text[]      NOT NULL DEFAULT '{}',
    description    text        NOT NULL DEFAULT '',
    poster_path    text        NOT NULL DEFAULT '',
    release_year   int,
    letterboxd_url text        NOT NULL DEFAULT '',
    host_rating    smallint    CHECK (host_rating BETWEEN 0 AND 10),
    UNIQUE (year, day)
);

-- One rating per visitor per movie; value is 2–10 (shown as 1–5 drops).
CREATE TABLE ratings (
    movie_id   text        NOT NULL REFERENCES movies (id),
    visitor_id text        NOT NULL,
    value      smallint    NOT NULL CHECK (value IN (2, 4, 6, 8, 10)),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (movie_id, visitor_id)
);

-- Every site event: page views and clicks from the browser, plus things the
-- server did (rating_saved, comment_posted). Append-only.
CREATE TABLE events (
    id          bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    type        text        NOT NULL,
    source      text        NOT NULL CHECK (source IN ('client', 'server')),
    visitor_id  text        NOT NULL DEFAULT '',
    session_id  text        NOT NULL DEFAULT '',
    path        text        NOT NULL DEFAULT '',
    referrer    text        NOT NULL DEFAULT '',
    user_agent  text        NOT NULL DEFAULT '',
    country     text        NOT NULL DEFAULT '',
    props       jsonb       NOT NULL DEFAULT '{}',
    occurred_at timestamptz NOT NULL,
    received_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX events_occurred_at ON events (occurred_at);
CREATE INDEX events_type_occurred_at ON events (type, occurred_at);
