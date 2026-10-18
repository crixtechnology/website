-- When a job application reached a final status, so its aptitude-test webcam
-- photos can be deleted 6 months later. New nullable column only.

-- AlterTable
ALTER TABLE `job_applications` ADD COLUMN `closedAt` DATETIME(3) NULL;
