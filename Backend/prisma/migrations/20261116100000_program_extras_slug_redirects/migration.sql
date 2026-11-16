-- Extras only some programs include.
ALTER TABLE `courses` ADD COLUMN `joiningKit` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `linkedinRecognition` BOOLEAN NOT NULL DEFAULT false;

-- Old program addresses that still open the program.
CREATE TABLE `course_slug_redirects` (
    `oldSlug` VARCHAR(191) NOT NULL,
    `courseId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `course_slug_redirects_courseId_idx`(`courseId`),
    PRIMARY KEY (`oldSlug`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `course_slug_redirects` ADD CONSTRAINT `course_slug_redirects_courseId_fkey` FOREIGN KEY (`courseId`) REFERENCES `courses`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
