-- Answers admins teach the help agent, on the questions visitors asked.
-- New columns only; existing rows have no answer.

-- AlterTable
ALTER TABLE `bot_questions` ADD COLUMN `answer` TEXT NULL,
    ADD COLUMN `keywords` VARCHAR(300) NOT NULL DEFAULT '',
    ADD COLUMN `linkTo` VARCHAR(120) NOT NULL DEFAULT '',
    ADD COLUMN `linkLabel` VARCHAR(60) NOT NULL DEFAULT '',
    ADD COLUMN `dept` VARCHAR(10) NOT NULL DEFAULT '',
    ADD COLUMN `answeredAt` DATETIME(3) NULL;
