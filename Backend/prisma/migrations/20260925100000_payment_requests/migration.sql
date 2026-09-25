-- CreateTable
CREATE TABLE `payment_requests` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `courseId` VARCHAR(191) NOT NULL,
    `tier` ENUM('basic', 'plus', 'pro') NULL,
    `amount` INTEGER NOT NULL,
    `note` VARCHAR(191) NOT NULL DEFAULT '',
    `status` ENUM('pending', 'paid', 'cancelled') NOT NULL DEFAULT 'pending',
    `paidPaymentId` VARCHAR(191) NULL,
    `paidAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    INDEX `payment_requests_userId_status_idx`(`userId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- AlterTable
ALTER TABLE `payments` ADD COLUMN `paymentRequestId` VARCHAR(191) NULL;
-- AddForeignKey
ALTER TABLE `payment_requests` ADD CONSTRAINT `payment_requests_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE `payment_requests` ADD CONSTRAINT `payment_requests_courseId_fkey` FOREIGN KEY (`courseId`) REFERENCES `courses`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE `payments` ADD CONSTRAINT `payments_paymentRequestId_fkey` FOREIGN KEY (`paymentRequestId`) REFERENCES `payment_requests`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
