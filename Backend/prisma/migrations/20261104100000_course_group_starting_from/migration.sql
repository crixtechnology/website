-- Training + Internship: tracks of one domain in several durations share a `group`
-- (shown as one card with a duration switch), and an optional "Starting from" tag.
ALTER TABLE `courses` ADD COLUMN `group` VARCHAR(191) NOT NULL DEFAULT '',
    ADD COLUMN `startingFrom` VARCHAR(191) NOT NULL DEFAULT '';
