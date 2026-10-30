-- Tests no longer have negative marking: a wrong answer scores 0, like a skipped one.
ALTER TABLE `job_openings` DROP COLUMN `negativeMarks`;
