-- CreateTable
CREATE TABLE "AiBreaker" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "failures" INTEGER NOT NULL DEFAULT 0,
    "openUntil" TIMESTAMP(3),
    "budgetAlertDay" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiBreaker_pkey" PRIMARY KEY ("id")
);

