-- Age confirmations: at sign-up (18+ or a parent's/guardian's permission), and
-- the 18+ confirmation the aptitude test needs. New nullable columns only.

-- AlterTable
ALTER TABLE `users` ADD COLUMN `ageConfirmedAt` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `job_applications` ADD COLUMN `adultConfirmedAt` DATETIME(3) NULL;
