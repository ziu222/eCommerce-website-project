-- CreateEnum
CREATE TYPE "AppealStatus" AS ENUM ('open', 'accepted', 'refused');

-- AlterTable

-- CreateTable
CREATE TABLE "ShopPenalty" (
    "id" SERIAL NOT NULL,
    "shopId" INTEGER NOT NULL,
    "points" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "flagId" INTEGER,
    "productId" INTEGER,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "revokeNote" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "ShopPenalty_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PenaltyAppeal" (
    "id" SERIAL NOT NULL,
    "penaltyId" INTEGER NOT NULL,
    "message" TEXT NOT NULL,
    "status" "AppealStatus" NOT NULL DEFAULT 'open',
    "note" TEXT NOT NULL DEFAULT '',
    "decidedBy" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PenaltyAppeal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ShopPenalty_shopId_expiresAt_idx" ON "ShopPenalty"("shopId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "PenaltyAppeal_penaltyId_key" ON "PenaltyAppeal"("penaltyId");

-- CreateIndex
CREATE INDEX "PenaltyAppeal_status_createdAt_idx" ON "PenaltyAppeal"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "ShopPenalty" ADD CONSTRAINT "ShopPenalty_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PenaltyAppeal" ADD CONSTRAINT "PenaltyAppeal_penaltyId_fkey" FOREIGN KEY ("penaltyId") REFERENCES "ShopPenalty"("id") ON DELETE CASCADE ON UPDATE CASCADE;

