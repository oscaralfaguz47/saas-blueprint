-- AlterTable
ALTER TABLE "UserSecurity" ADD COLUMN     "webAuthnChallenge" VARCHAR(512),
ADD COLUMN     "webAuthnChallengeExpiresAt" TIMESTAMP(3);
