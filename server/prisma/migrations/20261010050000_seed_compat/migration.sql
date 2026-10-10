-- AlterEnum
ALTER TYPE "AdminRole" ADD VALUE 'hr';

-- AlterEnum
BEGIN;
CREATE TYPE "ShopStatus_new" AS ENUM ('pending', 'active', 'suspended');
ALTER TABLE "User" ALTER COLUMN "shopStatus" TYPE "ShopStatus_new" USING ("shopStatus"::text::"ShopStatus_new");
ALTER TYPE "ShopStatus" RENAME TO "ShopStatus_old";
ALTER TYPE "ShopStatus_new" RENAME TO "ShopStatus";
DROP TYPE "public"."ShopStatus_old";
COMMIT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "shopAddress" TEXT,
ADD COLUMN     "shopAvatar" TEXT,
ADD COLUMN     "shopPhone" TEXT;

