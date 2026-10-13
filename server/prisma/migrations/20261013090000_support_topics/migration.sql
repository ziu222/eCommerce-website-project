-- CreateEnum
CREATE TYPE "SupportTopic" AS ENUM ('orders', 'returns', 'payments', 'products', 'account', 'other');

-- AlterTable
ALTER TABLE "SupportThread" ADD COLUMN     "topic" "SupportTopic" NOT NULL DEFAULT 'other';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "supportTopics" "SupportTopic"[] DEFAULT ARRAY[]::"SupportTopic"[];

-- CreateIndex
CREATE INDEX "SupportThread_topic_status_idx" ON "SupportThread"("topic", "status");

