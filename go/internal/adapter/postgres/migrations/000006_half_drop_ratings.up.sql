-- Half blood drops: ratings are now any whole number from 1 to 10
-- (shown as ½–5 drops), not just the even ones.
ALTER TABLE ratings DROP CONSTRAINT ratings_value_check;
ALTER TABLE ratings ADD CONSTRAINT ratings_value_check CHECK (value BETWEEN 1 AND 10);
