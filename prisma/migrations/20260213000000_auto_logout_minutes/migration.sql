-- AlterTable: replace autoLogoutHours (hours) with autoLogoutMinutes for granularity (15, 30, 60, 300, 480)
ALTER TABLE "UserSecurity" ADD COLUMN "autoLogoutMinutes" INTEGER;

UPDATE "UserSecurity" SET "autoLogoutMinutes" = "autoLogoutHours" * 60 WHERE "autoLogoutHours" IS NOT NULL;

-- Default for new rows and any nulls
UPDATE "UserSecurity" SET "autoLogoutMinutes" = 300 WHERE "autoLogoutMinutes" IS NULL;
ALTER TABLE "UserSecurity" ALTER COLUMN "autoLogoutMinutes" SET NOT NULL;
ALTER TABLE "UserSecurity" ALTER COLUMN "autoLogoutMinutes" SET DEFAULT 300;

ALTER TABLE "UserSecurity" DROP COLUMN "autoLogoutHours";
