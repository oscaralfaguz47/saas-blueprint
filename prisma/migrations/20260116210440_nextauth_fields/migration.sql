/*
  Warnings:

  - You are about to drop the column `createdAt` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `User` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "Account_userId_idx";

-- DropIndex
DROP INDEX "Session_userId_idx";

-- AlterTable
ALTER TABLE "User" DROP COLUMN "createdAt",
DROP COLUMN "updatedAt",
ADD COLUMN     "emailVerified" TIMESTAMP(3),
ALTER COLUMN "email" DROP NOT NULL;
