-- Education details in the student's profile (college, course, branch /
-- department, semester, year of passing), needed for a free internship.

-- AlterTable
ALTER TABLE `users` ADD COLUMN `college` VARCHAR(150) NOT NULL DEFAULT '',
    ADD COLUMN `course` VARCHAR(100) NOT NULL DEFAULT '',
    ADD COLUMN `department` VARCHAR(100) NOT NULL DEFAULT '',
    ADD COLUMN `semester` VARCHAR(16) NOT NULL DEFAULT '',
    ADD COLUMN `passingYear` INTEGER NULL;

-- A copy of it on each free-internship application, taken when the test unlocks.
-- AlterTable
ALTER TABLE `job_applications` ADD COLUMN `education` JSON NULL;
