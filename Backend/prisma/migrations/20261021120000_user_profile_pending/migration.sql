-- Accounts made straight from the login form start with a placeholder name
-- until the owner completes their profile. Existing accounts are complete.

-- AlterTable
ALTER TABLE `users` ADD COLUMN `profilePending` BOOLEAN NOT NULL DEFAULT false;
