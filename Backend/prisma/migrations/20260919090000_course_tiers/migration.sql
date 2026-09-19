-- Course/internship pricing moves from one price (courses.price +
-- courses.discountPercent) to up to three plans per item: basic / plus / pro.
-- Order matters here: the new table and columns are created first, the old
-- single price is copied into a Basic tier row (and existing sales are
-- labelled Basic), and only then are the old columns dropped.

-- CreateTable
CREATE TABLE `course_tiers` (
    `id` VARCHAR(191) NOT NULL,
    `courseId` VARCHAR(191) NOT NULL,
    `tier` ENUM('basic', 'plus', 'pro') NOT NULL,
    `price` DOUBLE NOT NULL,
    `discountPercent` INTEGER NOT NULL DEFAULT 0,
    `features` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `course_tiers_courseId_tier_key`(`courseId`, `tier`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `course_tiers` ADD CONSTRAINT `course_tiers_courseId_fkey` FOREIGN KEY (`courseId`) REFERENCES `courses`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE `applications` ADD COLUMN `tier` ENUM('basic', 'plus', 'pro') NULL;

-- AlterTable
ALTER TABLE `enrollments` ADD COLUMN `tier` ENUM('basic', 'plus', 'pro') NULL;

-- AlterTable
ALTER TABLE `payments` ADD COLUMN `tier` ENUM('basic', 'plus', 'pro') NULL;

-- Data: every already-priced course/internship keeps its price as its Basic plan.
INSERT INTO `course_tiers` (`id`, `courseId`, `tier`, `price`, `discountPercent`, `features`, `createdAt`, `updatedAt`)
SELECT UUID(), `id`, 'basic', `price`, `discountPercent`, JSON_ARRAY(), CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
FROM `courses`
WHERE `price` IS NOT NULL;

-- Data: everything sold or granted so far was the single (now "Basic") offer.
UPDATE `enrollments` SET `tier` = 'basic';
UPDATE `payments` SET `tier` = 'basic';
UPDATE `applications` SET `tier` = 'basic' WHERE `paymentId` IS NOT NULL;

-- AlterTable
ALTER TABLE `courses` DROP COLUMN `discountPercent`,
    DROP COLUMN `price`;
