/*
  Warnings:

  - Added the required column `category` to the `UserNotification` table without a default value. This is not possible if the table is not empty.
  - Changed the type of `notificationType` on the `UserNotification` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('SUPPORT_TICKET_REPLY', 'SUPPORT_TICKET_STATUS_CHANGED', 'SUPPORT_TICKET_USER_REPLIED', 'SUPPORT_TICKET_ASSIGNED', 'RECORD_APPROVAL_FULLY_COMPLETED', 'RECORD_FINANCE_ASSIGNED', 'RECORD_PAYMENT_STATUS_CHANGED');

-- CreateEnum
CREATE TYPE "NotificationCategory" AS ENUM ('SECURITY', 'BILLING', 'WORKFLOW', 'FINANCE', 'SOCIAL');

-- AlterTable
ALTER TABLE "UserNotification" ADD COLUMN     "category" "NotificationCategory" NOT NULL,
DROP COLUMN "notificationType",
ADD COLUMN     "notificationType" "NotificationType" NOT NULL;

-- CreateIndex
CREATE INDEX "UserNotification_userId_category_readAt_idx" ON "UserNotification"("userId", "category", "readAt");
