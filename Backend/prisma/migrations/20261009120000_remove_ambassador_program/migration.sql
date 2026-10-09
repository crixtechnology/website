-- Remove the Campus Ambassador program.
--
-- DESTRUCTIVE: permanently deletes every ambassador profile, commission
-- (earning) and payout record, plus the two referral columns that pointed at
-- them. Back up the database first (mysqldump of `ambassadors`,
-- `ambassador_earnings`, `ambassador_payouts` and `referrals`) if any of it
-- may be needed again — for example payout records for tax/accounting.
--
-- Referrals earned through an ambassador stay as ordinary referral rows
-- (rewardAmount stays 0, so no credit is issued retroactively).

-- Programme rules stored in the key/value settings table.
DELETE FROM `settings` WHERE `key` = 'ambassador';

-- DropForeignKey
ALTER TABLE `ambassador_earnings` DROP FOREIGN KEY `ambassador_earnings_ambassadorId_fkey`;

-- DropForeignKey
ALTER TABLE `ambassador_earnings` DROP FOREIGN KEY `ambassador_earnings_payoutId_fkey`;

-- DropForeignKey
ALTER TABLE `ambassador_earnings` DROP FOREIGN KEY `ambassador_earnings_referralId_fkey`;

-- DropForeignKey
ALTER TABLE `ambassador_payouts` DROP FOREIGN KEY `ambassador_payouts_ambassadorId_fkey`;

-- DropForeignKey
ALTER TABLE `ambassadors` DROP FOREIGN KEY `ambassadors_userId_fkey`;

-- DropForeignKey
ALTER TABLE `referrals` DROP FOREIGN KEY `referrals_ambassadorId_fkey`;

-- DropIndex
DROP INDEX `referrals_ambassadorId_fkey` ON `referrals`;

-- AlterTable
ALTER TABLE `referrals` DROP COLUMN `ambassadorId`,
    DROP COLUMN `commissionPercent`;

-- DropTable
DROP TABLE `ambassador_earnings`;

-- DropTable
DROP TABLE `ambassador_payouts`;

-- DropTable
DROP TABLE `ambassadors`;

