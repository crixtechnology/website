-- A record of every deleted account (DPDP Act 2023 erasure requests), with no
-- personal data in it. New table only.

-- CreateTable
CREATE TABLE `account_deletions` (
    `id` VARCHAR(191) NOT NULL,
    `formerUserId` VARCHAR(191) NOT NULL,
    `emailHash` VARCHAR(64) NOT NULL,
    `requestedBy` VARCHAR(10) NOT NULL,
    `adminId` VARCHAR(191) NULL,
    `retainedNote` VARCHAR(500) NOT NULL DEFAULT '',
    `deletedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `account_deletions_emailHash_idx`(`emailHash`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
