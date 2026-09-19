-- AlterTable
ALTER TABLE `payments` ADD COLUMN `fromTier` ENUM('basic', 'plus', 'pro') NULL;
