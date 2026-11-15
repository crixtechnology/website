-- The aptitude test no longer has a fee and candidates can't unlock it
-- themselves: an admin gives test access to a specific student.
--
-- 1. The "payment_pending" status (left over from the test fee) becomes
--    "awaiting_access": applied, waiting for an admin to give test access.
ALTER TABLE `job_applications` MODIFY `status` ENUM('payment_pending', 'awaiting_access', 'test_pending', 'submitted', 'shortlisted', 'not_shortlisted', 'interview_scheduled', 'selected', 'rejected') NOT NULL DEFAULT 'awaiting_access';
UPDATE `job_applications` SET `status` = 'awaiting_access' WHERE `status` = 'payment_pending';
ALTER TABLE `job_applications` MODIFY `status` ENUM('awaiting_access', 'test_pending', 'submitted', 'shortlisted', 'not_shortlisted', 'interview_scheduled', 'selected', 'rejected') NOT NULL DEFAULT 'awaiting_access';

-- 2. When test access was given, and by which admin (user id).
ALTER TABLE `job_applications` ADD COLUMN `testAccessAt` DATETIME(3) NULL,
    ADD COLUMN `testAccessBy` VARCHAR(191) NULL;
