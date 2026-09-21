-- CreateTable
CREATE TABLE `coupons` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NOT NULL DEFAULT '',
    `discountType` ENUM('percent', 'fixed') NOT NULL,
    `discountValue` INTEGER NOT NULL,
    `maxDiscount` INTEGER NULL,
    `appliesTo` ENUM('all', 'course', 'internship', 'selected') NOT NULL DEFAULT 'all',
    `courseIds` JSON NOT NULL,
    `startsAt` DATETIME(3) NULL,
    `expiresAt` DATETIME(3) NULL,
    `maxUses` INTEGER NULL,
    `perUserLimit` INTEGER NOT NULL DEFAULT 1,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    UNIQUE INDEX `coupons_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- AlterTable
ALTER TABLE `payments` ADD COLUMN `couponId` VARCHAR(191) NULL,
    ADD COLUMN `couponCode` VARCHAR(191) NOT NULL DEFAULT '',
    ADD COLUMN `couponDiscount` INTEGER NOT NULL DEFAULT 0;
-- AddForeignKey
ALTER TABLE `payments` ADD CONSTRAINT `payments_couponId_fkey` FOREIGN KEY (`couponId`) REFERENCES `coupons`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
