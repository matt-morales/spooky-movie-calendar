UPDATE movies SET directors = ARRAY['Wes Craven'] WHERE id = '2025-26';
UPDATE movies SET directors = ARRAY['Jackie Strano'] WHERE id = '2025-28';
UPDATE movies SET directors = ARRAY['Hwang Dong-hyuk'] WHERE id = '2025-29';
UPDATE movies SET letterboxd_url = '', release_year = NULL WHERE year = 2025;
DROP TABLE lineups;
