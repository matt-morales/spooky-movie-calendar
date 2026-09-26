-- One row per year: the lineup as a whole. Its nights are in movies.
CREATE TABLE lineups (
    year                int  PRIMARY KEY,
    letterboxd_list_url text NOT NULL DEFAULT ''
);

INSERT INTO lineups (year, letterboxd_list_url)
VALUES (2025, 'https://letterboxd.com/snowkempm/list/31-nights-of-halloween-whore-movies/');

-- Letterboxd links and release years for the 2025 lineup, matched by title
-- against the Letterboxd list (and by director for the nights not on it).
UPDATE movies m
SET letterboxd_url = v.url, release_year = v.release_year
FROM (VALUES
    ('2025-01', 'https://letterboxd.com/film/christine-1983/', 1983),
    ('2025-02', 'https://letterboxd.com/film/the-grudge/', 2004),
    ('2025-03', 'https://letterboxd.com/film/eraserhead/', 1977),
    ('2025-04', 'https://letterboxd.com/film/the-babadook/', 2014),
    ('2025-05', 'https://letterboxd.com/film/shutter-2008/', 2008),
    ('2025-06', 'https://letterboxd.com/film/silent-hill/', 2006),
    ('2025-07', 'https://letterboxd.com/film/practical-magic/', 1998),
    ('2025-08', 'https://letterboxd.com/film/the-thing/', 1982),
    ('2025-09', 'https://letterboxd.com/film/the-omen/', 1976),
    ('2025-10', 'https://letterboxd.com/film/mirrors/', 2008),
    ('2025-11', 'https://letterboxd.com/film/weapons-2025/', 2025),
    ('2025-12', 'https://letterboxd.com/film/a-nightmare-on-elm-street/', 1984),
    ('2025-13', 'https://letterboxd.com/film/friday-the-13th-the-final-chapter/', 1984),
    ('2025-14', 'https://letterboxd.com/film/incantation-2022/', 2022),
    ('2025-15', 'https://letterboxd.com/film/as-above-so-below-2014/', 2014),
    ('2025-16', 'https://letterboxd.com/film/30-days-of-night/', 2007),
    ('2025-17', 'https://letterboxd.com/film/lights-out-2016/', 2016),
    ('2025-18', 'https://letterboxd.com/film/terrifier-3/', 2024),
    ('2025-19', 'https://letterboxd.com/film/the-craft/', 1996),
    ('2025-20', 'https://letterboxd.com/film/battle-royale/', 2000),
    ('2025-21', 'https://letterboxd.com/film/the-ring-2002/', 2002),
    ('2025-22', 'https://letterboxd.com/film/the-texas-chain-saw-massacre/', 1974),
    ('2025-23', 'https://letterboxd.com/film/what-lies-beneath/', 2000),
    ('2025-24', 'https://letterboxd.com/film/thanksgiving-2023/', 2023),
    ('2025-25', 'https://letterboxd.com/film/the-village/', 2004),
    ('2025-26', 'https://letterboxd.com/film/the-hills-have-eyes-2006/', 2006),
    ('2025-27', 'https://letterboxd.com/film/the-others/', 2001),
    ('2025-28', 'https://letterboxd.com/film/blue-eyes-of-the-broken-doll/', 1974),
    ('2025-29', 'https://letterboxd.com/film/gonjiam-haunted-asylum/', 2018),
    ('2025-30', 'https://letterboxd.com/film/afflicted/', 2013),
    ('2025-31', 'https://letterboxd.com/film/night-of-the-living-dead/', 1968)
) AS v (id, url, release_year)
WHERE m.id = v.id;

-- These directors didn't match the film the poster shows: the 2006 remake of
-- The Hills Have Eyes, and the 1974 House of Psychotic Women.
UPDATE movies SET directors = ARRAY['Alexandre Aja'] WHERE id = '2025-26';
UPDATE movies SET directors = ARRAY['Carlos Aured'] WHERE id = '2025-28';
UPDATE movies SET directors = ARRAY['Jung Bum-shik'] WHERE id = '2025-29';
