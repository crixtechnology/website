-- Careers page + aptitude test: job openings, the question bank, applications,
-- test attempts (answers, violations, webcam snapshots) and dashboard notifications.
-- Also: three new wallet entry kinds and an optional expiry on wallet credit,
-- and a link from a payment to the job application whose test fee it paid.
-- Additive only: no existing column or row is changed or removed.

-- AlterTable
ALTER TABLE `credit_entries` ADD COLUMN `expiresAt` DATETIME(3) NULL,
    MODIFY `kind` ENUM('referral_reward', 'redeemed', 'adjustment', 'signup_bonus', 'test_fee_credit', 'expired') NOT NULL;

-- AlterTable
ALTER TABLE `payments` ADD COLUMN `jobApplicationId` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `job_openings` (
    `id` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `summary` TEXT NOT NULL,
    `techCategory` VARCHAR(191) NOT NULL DEFAULT 'web',
    `skills` JSON NOT NULL,
    `responsibilities` JSON NOT NULL,
    `eligibility` JSON NOT NULL,
    `stipend` VARCHAR(191) NOT NULL DEFAULT '',
    `experience` VARCHAR(191) NOT NULL DEFAULT '',
    `duration` VARCHAR(191) NOT NULL DEFAULT '',
    `mode` VARCHAR(191) NOT NULL DEFAULT '',
    `status` ENUM('open', 'closed') NOT NULL DEFAULT 'open',
    `order` INTEGER NOT NULL DEFAULT 0,
    `durationMinutes` INTEGER NOT NULL DEFAULT 45,
    `questionCounts` JSON NOT NULL,
    `marksPerQuestion` DOUBLE NOT NULL DEFAULT 1,
    `negativeMarks` DOUBLE NOT NULL DEFAULT 0.25,
    `cutoffScore` DOUBLE NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `job_openings_slug_key`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `test_questions` (
    `id` VARCHAR(191) NOT NULL,
    `category` VARCHAR(32) NOT NULL,
    `text` TEXT NOT NULL,
    `options` JSON NOT NULL,
    `correctIndex` INTEGER NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `test_questions_category_active_idx`(`category`, `active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `job_applications` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `openingId` VARCHAR(191) NOT NULL,
    `status` ENUM('payment_pending', 'test_pending', 'submitted', 'shortlisted', 'not_shortlisted', 'interview_scheduled', 'selected', 'rejected') NOT NULL DEFAULT 'payment_pending',
    `paymentId` VARCHAR(191) NULL,
    `paidAt` DATETIME(3) NULL,
    `interviewAt` DATETIME(3) NULL,
    `interviewLink` VARCHAR(500) NOT NULL DEFAULT '',
    `adminNote` VARCHAR(500) NOT NULL DEFAULT '',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `job_applications_userId_idx`(`userId`),
    INDEX `job_applications_openingId_status_idx`(`openingId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `test_attempts` (
    `id` VARCHAR(191) NOT NULL,
    `applicationId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `status` ENUM('in_progress', 'submitted') NOT NULL DEFAULT 'in_progress',
    `startedAt` DATETIME(3) NOT NULL,
    `endsAt` DATETIME(3) NOT NULL,
    `submittedAt` DATETIME(3) NULL,
    `submitReason` VARCHAR(191) NOT NULL DEFAULT '',
    `settings` JSON NOT NULL,
    `paper` JSON NOT NULL,
    `score` DOUBLE NULL,
    `maxScore` DOUBLE NULL,
    `correctCount` INTEGER NULL,
    `wrongCount` INTEGER NULL,
    `categoryScores` JSON NULL,
    `passed` BOOLEAN NULL,
    `violationCount` INTEGER NOT NULL DEFAULT 0,
    `sessionId` VARCHAR(191) NULL,
    `sessionSeenAt` DATETIME(3) NULL,
    `webcamConsent` BOOLEAN NOT NULL DEFAULT false,
    `ip` VARCHAR(191) NOT NULL DEFAULT '',
    `userAgent` VARCHAR(500) NOT NULL DEFAULT '',
    `device` VARCHAR(191) NOT NULL DEFAULT '',
    `browser` VARCHAR(191) NOT NULL DEFAULT '',
    `viaDesktopApp` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `test_attempts_applicationId_key`(`applicationId`),
    INDEX `test_attempts_status_endsAt_idx`(`status`, `endsAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `test_answers` (
    `id` VARCHAR(191) NOT NULL,
    `attemptId` VARCHAR(191) NOT NULL,
    `questionId` VARCHAR(191) NOT NULL,
    `selected` INTEGER NULL,
    `marked` BOOLEAN NOT NULL DEFAULT false,
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `test_answers_attemptId_questionId_key`(`attemptId`, `questionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `test_violations` (
    `id` VARCHAR(191) NOT NULL,
    `attemptId` VARCHAR(191) NOT NULL,
    `type` VARCHAR(40) NOT NULL,
    `detail` VARCHAR(191) NOT NULL DEFAULT '',
    `counted` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `test_violations_attemptId_createdAt_idx`(`attemptId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `test_snapshots` (
    `id` VARCHAR(191) NOT NULL,
    `attemptId` VARCHAR(191) NOT NULL,
    `storageKey` VARCHAR(300) NOT NULL,
    `flag` VARCHAR(20) NOT NULL DEFAULT '',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `test_snapshots_attemptId_createdAt_idx`(`attemptId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `notifications` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `body` TEXT NOT NULL,
    `link` VARCHAR(191) NOT NULL DEFAULT '',
    `readAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `notifications_userId_createdAt_idx`(`userId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `payments` ADD CONSTRAINT `payments_jobApplicationId_fkey` FOREIGN KEY (`jobApplicationId`) REFERENCES `job_applications`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `job_applications` ADD CONSTRAINT `job_applications_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `job_applications` ADD CONSTRAINT `job_applications_openingId_fkey` FOREIGN KEY (`openingId`) REFERENCES `job_openings`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `test_attempts` ADD CONSTRAINT `test_attempts_applicationId_fkey` FOREIGN KEY (`applicationId`) REFERENCES `job_applications`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `test_answers` ADD CONSTRAINT `test_answers_attemptId_fkey` FOREIGN KEY (`attemptId`) REFERENCES `test_attempts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `test_violations` ADD CONSTRAINT `test_violations_attemptId_fkey` FOREIGN KEY (`attemptId`) REFERENCES `test_attempts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `test_snapshots` ADD CONSTRAINT `test_snapshots_attemptId_fkey` FOREIGN KEY (`attemptId`) REFERENCES `test_attempts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

