/*
  Warnings:

  - You are about to drop the column `amount` on the `Record` table. All the data in the column will be lost.
  - You are about to drop the column `currency` on the `Record` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Record" DROP COLUMN "amount",
DROP COLUMN "currency";
