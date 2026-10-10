-- (Prisma also proposes dropping the "search" default; that column is generated, so it is left alone.)
-- CreateEnum
CREATE TYPE "SupportStatus" AS ENUM ('open', 'answered', 'closed');

-- CreateEnum
CREATE TYPE "SupportAuthor" AS ENUM ('customer', 'agent');

-- CreateTable
CREATE TABLE "SupportThread" (
    "id" SERIAL NOT NULL,
    "customerId" INTEGER NOT NULL,
    "assignedToId" INTEGER,
    "subject" TEXT NOT NULL,
    "status" "SupportStatus" NOT NULL DEFAULT 'open',
    "botTranscript" TEXT,
    "customerReadMessageId" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportMessage" (
    "id" SERIAL NOT NULL,
    "threadId" INTEGER NOT NULL,
    "authorType" "SupportAuthor" NOT NULL,
    "authorId" INTEGER,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SupportThread_status_updatedAt_idx" ON "SupportThread"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "SupportThread_customerId_idx" ON "SupportThread"("customerId");

-- CreateIndex
CREATE INDEX "SupportMessage_threadId_id_idx" ON "SupportMessage"("threadId", "id");

-- AddForeignKey
ALTER TABLE "SupportThread" ADD CONSTRAINT "SupportThread_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportThread" ADD CONSTRAINT "SupportThread_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportMessage" ADD CONSTRAINT "SupportMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "SupportThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

