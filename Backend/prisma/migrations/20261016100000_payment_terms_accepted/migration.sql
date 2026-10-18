-- When the buyer agreed to the Terms & Conditions for a payment.
-- New nullable column only: existing payments keep NULL.

-- AlterTable
ALTER TABLE `payments` ADD COLUMN `termsAcceptedAt` DATETIME(3) NULL;
