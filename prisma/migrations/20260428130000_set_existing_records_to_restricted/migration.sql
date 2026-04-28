-- Data migration: legacy WORKSPACE visibility no longer grants tenant-wide list access;
-- align stored rows with RESTRICTED default.
UPDATE "Record" SET "visibility" = 'RESTRICTED' WHERE "visibility" = 'WORKSPACE';
