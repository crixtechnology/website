-- Courses and paid internships get the same details a free internship shows:
-- skills, responsibilities, eligibility (lists), stipend, experience, mode, and
-- how many places they have (null = not stated). The JSON lists are added
-- NULLable, filled with an empty list, then made NOT NULL (MySQL JSON columns
-- can't take a plain default), as in 20260921140000_course_rich_content.
ALTER TABLE `courses`
    ADD COLUMN `skills` JSON NULL,
    ADD COLUMN `responsibilities` JSON NULL,
    ADD COLUMN `eligibility` JSON NULL,
    ADD COLUMN `stipend` VARCHAR(191) NOT NULL DEFAULT '',
    ADD COLUMN `experience` VARCHAR(191) NOT NULL DEFAULT '',
    ADD COLUMN `mode` VARCHAR(191) NOT NULL DEFAULT '',
    ADD COLUMN `positions` INTEGER NULL;
UPDATE `courses` SET `skills` = JSON_ARRAY(), `responsibilities` = JSON_ARRAY(), `eligibility` = JSON_ARRAY();
ALTER TABLE `courses`
    MODIFY `skills` JSON NOT NULL,
    MODIFY `responsibilities` JSON NOT NULL,
    MODIFY `eligibility` JSON NOT NULL;
