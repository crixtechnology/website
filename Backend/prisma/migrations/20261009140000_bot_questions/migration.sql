-- Questions visitors typed into the help bot that it couldn't answer (admin review list).
-- New table only: no existing data is touched.

-- CreateTable
CREATE TABLE `bot_questions` (
    `id` VARCHAR(191) NOT NULL,
    `question` VARCHAR(191) NOT NULL,
    `timesAsked` INTEGER NOT NULL DEFAULT 1,
    `handled` BOOLEAN NOT NULL DEFAULT false,
    `firstAskedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `lastAskedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `bot_questions_question_key`(`question`),
    INDEX `bot_questions_handled_timesAsked_idx`(`handled`, `timesAsked`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

