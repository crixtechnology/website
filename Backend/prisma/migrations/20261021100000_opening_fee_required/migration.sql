-- Free roles: a job opening can skip the aptitude-test registration fee.
-- Existing roles keep the fee (default true).

-- AlterTable
ALTER TABLE `job_openings` ADD COLUMN `feeRequired` BOOLEAN NOT NULL DEFAULT true;
