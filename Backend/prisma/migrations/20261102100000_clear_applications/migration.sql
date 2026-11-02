-- A candidate can clear an ended application from My Applications (hidden from them only).
ALTER TABLE `job_applications` ADD COLUMN `clearedAt` DATETIME(3) NULL;
