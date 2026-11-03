-- An admin can stop wallet credit, offer codes and the referral discount coming off a
-- payment request (when its amount is already reduced). Existing requests keep them on.
ALTER TABLE `payment_requests` ADD COLUMN `allowDiscounts` BOOLEAN NOT NULL DEFAULT true;
