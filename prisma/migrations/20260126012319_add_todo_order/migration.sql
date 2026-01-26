-- DropForeignKey
ALTER TABLE "ElectronSettings" DROP CONSTRAINT "ElectronSettings_userId_fkey";

-- AlterTable
ALTER TABLE "Todo" ADD COLUMN     "order" INTEGER;

-- AddForeignKey
ALTER TABLE "ElectronSettings" ADD CONSTRAINT "ElectronSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
