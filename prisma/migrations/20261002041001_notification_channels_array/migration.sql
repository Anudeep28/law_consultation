/*
  Warnings:

  - You are about to drop the column `channel` on the `Notification` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Notification" DROP COLUMN "channel",
ADD COLUMN     "channels" "NotificationChannel"[];
