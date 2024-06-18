/*
  Warnings:

  - You are about to drop the column `editorId` on the `User` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[categoryId]` on the table `Editor` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `userId` to the `Category` table without a default value. This is not possible if the table is not empty.
  - Added the required column `categoryId` to the `Editor` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "Editor_userId_key";

-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "userId" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "Editor" ADD COLUMN     "categoryId" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "User" DROP COLUMN "editorId";

-- CreateIndex
CREATE UNIQUE INDEX "Editor_categoryId_key" ON "Editor"("categoryId");

-- AddForeignKey
ALTER TABLE "Editor" ADD CONSTRAINT "Editor_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
