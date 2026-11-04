-- Free internship roles of one domain in several durations share a `group`,
-- shown as one card with a duration switch (like Training + Internship).
ALTER TABLE `job_openings` ADD COLUMN `group` VARCHAR(191) NOT NULL DEFAULT '';
