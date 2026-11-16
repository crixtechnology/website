-- How many opening months of a program are training with no stipend (0 = stipend from the start).
ALTER TABLE `courses` ADD COLUMN `stipendTrainingMonths` INTEGER NOT NULL DEFAULT 0;
