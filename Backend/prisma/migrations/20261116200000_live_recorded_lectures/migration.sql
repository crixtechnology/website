-- Whether a program offers both live and recorded lectures (shown on its card and page). On by default.
ALTER TABLE `courses` ADD COLUMN `liveRecordedLectures` BOOLEAN NOT NULL DEFAULT true;
