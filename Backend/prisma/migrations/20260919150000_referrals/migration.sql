-- AlterTable
ALTER TABLE `payments` ADD COLUMN `creditApplied` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `referralDiscount` INTEGER NOT NULL DEFAULT 0;
-- AlterTable
ALTER TABLE `users` ADD COLUMN `referralCode` VARCHAR(191) NULL;
-- CreateTable
CREATE TABLE `referrals` (
    `id` VARCHAR(191) NOT NULL,
    `referrerId` VARCHAR(191) NOT NULL,
    `refereeId` VARCHAR(191) NOT NULL,
    `status` ENUM('pending', 'rewarded') NOT NULL DEFAULT 'pending',
    `refereeDiscountPercent` INTEGER NOT NULL DEFAULT 0,
    `rewardAmount` INTEGER NOT NULL DEFAULT 0,
    `qualifyingPaymentId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `rewardedAt` DATETIME(3) NULL,
    UNIQUE INDEX `referrals_refereeId_key`(`refereeId`),
    INDEX `referrals_referrerId_idx`(`referrerId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- CreateTable
CREATE TABLE `credit_entries` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `amount` INTEGER NOT NULL,
    `kind` ENUM('referral_reward', 'redeemed', 'adjustment') NOT NULL,
    `referralId` VARCHAR(191) NULL,
    `paymentId` VARCHAR(191) NULL,
    `note` VARCHAR(191) NOT NULL DEFAULT '',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX `credit_entries_userId_idx`(`userId`),
    UNIQUE INDEX `credit_entries_paymentId_kind_key`(`paymentId`, `kind`),
    UNIQUE INDEX `credit_entries_referralId_kind_key`(`referralId`, `kind`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- CreateTable
CREATE TABLE `settings` (
    `key` VARCHAR(191) NOT NULL,
    `value` JSON NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,
    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- CreateIndex
CREATE UNIQUE INDEX `users_referralCode_key` ON `users`(`referralCode`);
-- AddForeignKey
ALTER TABLE `referrals` ADD CONSTRAINT `referrals_referrerId_fkey` FOREIGN KEY (`referrerId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE `referrals` ADD CONSTRAINT `referrals_refereeId_fkey` FOREIGN KEY (`refereeId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE `credit_entries` ADD CONSTRAINT `credit_entries_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE `credit_entries` ADD CONSTRAINT `credit_entries_referralId_fkey` FOREIGN KEY (`referralId`) REFERENCES `referrals`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
