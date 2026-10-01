-- Back to whole drops only: half-drop ratings round up to the next drop.
UPDATE ratings SET value = value + 1 WHERE value % 2 = 1;
ALTER TABLE ratings DROP CONSTRAINT ratings_value_check;
ALTER TABLE ratings ADD CONSTRAINT ratings_value_check CHECK (value IN (2, 4, 6, 8, 10));
