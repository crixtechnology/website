-- AlterTable
ALTER TABLE `referrals` ADD COLUMN `ambassadorId` VARCHAR(191) NULL,
    ADD COLUMN `commissionPercent` INTEGER NOT NULL DEFAULT 0;
-- CreateTable
CREATE TABLE `ambassadors` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `status` ENUM('applied', 'approved', 'rejected', 'suspended') NOT NULL DEFAULT 'applied',
    `college` VARCHAR(191) NOT NULL,
    `city` VARCHAR(191) NOT NULL,
    `yearOfStudy` VARCHAR(191) NOT NULL DEFAULT '',
    `branch` VARCHAR(191) NOT NULL DEFAULT '',
    `socialHandle` VARCHAR(191) NOT NULL DEFAULT '',
    `motivation` TEXT NOT NULL,
    `commissionPercent` INTEGER NULL,
    `upiId` VARCHAR(191) NOT NULL DEFAULT '',
    `bankHolder` VARCHAR(191) NOT NULL DEFAULT '',
    `bankAccount` VARCHAR(191) NOT NULL DEFAULT '',
    `bankIfsc` VARCHAR(191) NOT NULL DEFAULT '',
    `shippingAddress` TEXT NOT NULL,
    `kitStatus` ENUM('not_sent', 'preparing', 'shipped', 'delivered') NOT NULL DEFAULT 'not_sent',
    `kitNote` VARCHAR(191) NOT NULL DEFAULT '',
    `certificateNumber` VARCHAR(191) NULL,
    `certificateIssuedAt` DATETIME(3) NULL,
    `adminNote` VARCHAR(191) NOT NULL DEFAULT '',
    `appliedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `approvedAt` DATETIME(3) NULL,
    `updatedAt` DATETIME(3) NOT NULL,
    UNIQUE INDEX `ambassadors_userId_key`(`userId`),
    UNIQUE INDEX `ambassadors_certificateNumber_key`(`certificateNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- CreateTable
CREATE TABLE `ambassador_earnings` (
    `id` VARCHAR(191) NOT NULL,
    `ambassadorId` VARCHAR(191) NOT NULL,
    `referralId` VARCHAR(191) NOT NULL,
    `paymentId` VARCHAR(191) NOT NULL,
    `baseAmount` INTEGER NOT NULL,
    `percent` INTEGER NOT NULL,
    `amount` INTEGER NOT NULL,
    `availableAt` DATETIME(3) NOT NULL,
    `void` BOOLEAN NOT NULL DEFAULT false,
    `payoutId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE INDEX `ambassador_earnings_referralId_key`(`referralId`),
    INDEX `ambassador_earnings_ambassadorId_idx`(`ambassadorId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- CreateTable
CREATE TABLE `ambassador_payouts` (
    `id` VARCHAR(191) NOT NULL,
    `ambassadorId` VARCHAR(191) NOT NULL,
    `amount` INTEGER NOT NULL,
    `status` ENUM('requested', 'paid', 'rejected') NOT NULL DEFAULT 'requested',
    `payTo` VARCHAR(191) NOT NULL,
    `reference` VARCHAR(191) NOT NULL DEFAULT '',
    `note` VARCHAR(191) NOT NULL DEFAULT '',
    `requestedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `paidAt` DATETIME(3) NULL,
    `updatedAt` DATETIME(3) NOT NULL,
    INDEX `ambassador_payouts_ambassadorId_idx`(`ambassadorId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- AddForeignKey
ALTER TABLE `referrals` ADD CONSTRAINT `referrals_ambassadorId_fkey` FOREIGN KEY (`ambassadorId`) REFERENCES `ambassadors`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE `ambassadors` ADD CONSTRAINT `ambassadors_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE `ambassador_earnings` ADD CONSTRAINT `ambassador_earnings_ambassadorId_fkey` FOREIGN KEY (`ambassadorId`) REFERENCES `ambassadors`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE `ambassador_earnings` ADD CONSTRAINT `ambassador_earnings_referralId_fkey` FOREIGN KEY (`referralId`) REFERENCES `referrals`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE `ambassador_earnings` ADD CONSTRAINT `ambassador_earnings_payoutId_fkey` FOREIGN KEY (`payoutId`) REFERENCES `ambassador_payouts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE `ambassador_payouts` ADD CONSTRAINT `ambassador_payouts_ambassadorId_fkey` FOREIGN KEY (`ambassadorId`) REFERENCES `ambassadors`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
