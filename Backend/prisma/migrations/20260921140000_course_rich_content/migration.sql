-- The richer course page: four optional lists per course. Added as NULLable first, filled
-- with an empty list for the courses that already exist, then made NOT NULL — MySQL JSON
-- columns can't take a plain default, and this ends up exactly as Prisma expects it.
ALTER TABLE `courses`
    ADD COLUMN `outcomes` JSON NULL,
    ADD COLUMN `audience` JSON NULL,
    ADD COLUMN `prerequisites` JSON NULL,
    ADD COLUMN `faqs` JSON NULL;
UPDATE `courses` SET `outcomes` = JSON_ARRAY(), `audience` = JSON_ARRAY(), `prerequisites` = JSON_ARRAY(), `faqs` = JSON_ARRAY();
ALTER TABLE `courses`
    MODIFY `outcomes` JSON NOT NULL,
    MODIFY `audience` JSON NOT NULL,
    MODIFY `prerequisites` JSON NOT NULL,
    MODIFY `faqs` JSON NOT NULL;
