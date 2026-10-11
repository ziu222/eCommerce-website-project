-- CreateEnum
CREATE TYPE "ModerationLayer" AS ENUM ('rules', 'ai', 'fallback', 'admin');

-- CreateEnum
CREATE TYPE "FlagSource" AS ENUM ('rules', 'ai', 'report', 'fallback');

-- CreateEnum
CREATE TYPE "FlagStatus" AS ENUM ('open', 'dismissed', 'minor', 'violation', 'severe');

-- CreateEnum
CREATE TYPE "ReportReason" AS ENUM ('counterfeit', 'prohibited', 'misleading', 'offplatform', 'other');

-- CreateEnum
CREATE TYPE "KeywordSeverity" AS ENUM ('block', 'flag');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ProductStatus" ADD VALUE 'limited';
ALTER TYPE "ProductStatus" ADD VALUE 'review';

-- DropIndex
DROP INDEX "Product_adminStatus_category_idx";

-- AlterTable

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "moderationReasons" JSONB,
ADD COLUMN     "provisional" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "rankPenalty" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "ModerationJob" (
    "productId" INTEGER NOT NULL,
    "trigger" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedUntil" TIMESTAMP(3),
    "firstQueuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModerationJob_pkey" PRIMARY KEY ("productId")
);

-- CreateTable
CREATE TABLE "ModerationCheck" (
    "id" SERIAL NOT NULL,
    "productId" INTEGER NOT NULL,
    "layer" "ModerationLayer" NOT NULL,
    "outcome" TEXT NOT NULL,
    "reasons" JSONB NOT NULL,
    "model" TEXT,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "costMicros" INTEGER,
    "latencyMs" INTEGER,
    "decidedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModerationCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductFlag" (
    "id" SERIAL NOT NULL,
    "productId" INTEGER NOT NULL,
    "source" "FlagSource" NOT NULL,
    "reasons" JSONB NOT NULL,
    "status" "FlagStatus" NOT NULL DEFAULT 'open',
    "note" TEXT NOT NULL DEFAULT '',
    "decidedBy" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductFlag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductReport" (
    "id" SERIAL NOT NULL,
    "productId" INTEGER NOT NULL,
    "reporterId" INTEGER NOT NULL,
    "reason" "ReportReason" NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BannedKeyword" (
    "id" SERIAL NOT NULL,
    "phrase" TEXT NOT NULL,
    "severity" "KeywordSeverity" NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BannedKeyword_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModerationSetting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModerationSetting_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "ModerationJob_nextAttemptAt_idx" ON "ModerationJob"("nextAttemptAt");

-- CreateIndex
CREATE INDEX "ModerationCheck_productId_idx" ON "ModerationCheck"("productId");

-- CreateIndex
CREATE INDEX "ModerationCheck_layer_createdAt_idx" ON "ModerationCheck"("layer", "createdAt");

-- CreateIndex
CREATE INDEX "ProductFlag_status_createdAt_idx" ON "ProductFlag"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProductReport_productId_reporterId_key" ON "ProductReport"("productId", "reporterId");

-- CreateIndex
CREATE UNIQUE INDEX "BannedKeyword_phrase_key" ON "BannedKeyword"("phrase");

-- CreateIndex
CREATE INDEX "Product_adminStatus_category_rankPenalty_idx" ON "Product"("adminStatus", "category", "rankPenalty");

-- AddForeignKey
ALTER TABLE "ModerationJob" ADD CONSTRAINT "ModerationJob_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModerationCheck" ADD CONSTRAINT "ModerationCheck_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductFlag" ADD CONSTRAINT "ProductFlag_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductReport" ADD CONSTRAINT "ProductReport_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductReport" ADD CONSTRAINT "ProductReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- one open flag per product
CREATE UNIQUE INDEX "ProductFlag_one_open" ON "ProductFlag"("productId") WHERE status = 'open';
