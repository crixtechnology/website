-- Free Internship and Careers roles get the same optional "Starts on" text that
-- Training + Internship tracks show (an estimate, not a date).
ALTER TABLE `job_openings` ADD COLUMN `startsOn` VARCHAR(191) NOT NULL DEFAULT '';
