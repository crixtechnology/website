-- BCA internships: roles listed only on the unlinked /bca-internships page, and
-- the CV a candidate uploads when applying for one. Existing roles stay "general".

-- AlterTable
ALTER TABLE `job_openings` ADD COLUMN `audience` VARCHAR(16) NOT NULL DEFAULT 'general';

-- AlterTable
ALTER TABLE `job_applications` ADD COLUMN `cvKey` VARCHAR(255) NOT NULL DEFAULT '',
    ADD COLUMN `cvFileName` VARCHAR(190) NOT NULL DEFAULT '',
    ADD COLUMN `cvUploadedAt` DATETIME(3) NULL;
