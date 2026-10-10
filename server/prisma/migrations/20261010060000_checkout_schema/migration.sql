-- DropForeignKey
ALTER TABLE "CartItem" DROP CONSTRAINT "CartItem_productId_fkey";

-- DropForeignKey
ALTER TABLE "CartItem" DROP CONSTRAINT "CartItem_userId_fkey";

-- AlterTable
ALTER TABLE "Coupon" ALTER COLUMN "expiresAt" DROP NOT NULL;

-- DropTable
DROP TABLE "CartItem";

