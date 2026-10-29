-- How many people a job opening takes (null = not stated).
ALTER TABLE `job_openings` ADD COLUMN `positions` INTEGER NULL;
