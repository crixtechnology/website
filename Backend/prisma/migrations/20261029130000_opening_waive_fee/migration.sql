-- A free internship can skip the test processing fee, role by role (false = charge it, as before).
ALTER TABLE `job_openings` ADD COLUMN `waiveFee` BOOLEAN NOT NULL DEFAULT false;
