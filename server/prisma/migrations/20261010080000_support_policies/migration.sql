-- AlterEnum
ALTER TYPE "AdminRole" ADD VALUE 'support';

-- CreateTable
-- "search" is generated from "searchText" (already folded to lowercase, accent-free text by the app),
-- so the application never writes it.
CREATE TABLE "PolicyChunk" (
    "id" SERIAL NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "searchText" TEXT NOT NULL,
    "search" tsvector GENERATED ALWAYS AS (to_tsvector('simple', "searchText")) STORED,

    CONSTRAINT "PolicyChunk_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PolicyChunk_slug_key" ON "PolicyChunk"("slug");

-- CreateIndex
CREATE INDEX "PolicyChunk_search_idx" ON "PolicyChunk" USING GIN ("search");
