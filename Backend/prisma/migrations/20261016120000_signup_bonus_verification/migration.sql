-- Signup bonus credit is held until the student verifies their email address.
-- New column with a default: existing accounts are unaffected.

-- AlterTable
ALTER TABLE `users` ADD COLUMN `signupBonusPending` BOOLEAN NOT NULL DEFAULT false;
