-- The unlinked internships page is now open to students of every field, not
-- only BCA: its roles' audience is renamed "bca" -> "free" (/free-internships).
UPDATE `job_openings` SET `audience` = 'free' WHERE `audience` = 'bca';
