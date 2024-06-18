/*
  Warnings:

  - You are about to drop the column `genreId` on the `Completed` table. All the data in the column will be lost.
  - You are about to drop the `Genre` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `categoryId` to the `Completed` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "Completed" DROP CONSTRAINT "Completed_genreId_fkey";

-- AlterTable
ALTER TABLE "Completed" DROP COLUMN "genreId",
ADD COLUMN     "categoryId" INTEGER NOT NULL;

-- DropTable
DROP TABLE "Genre";

-- CreateTable
CREATE TABLE "Category" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Category_name_key" ON "Category"("name");

-- AddForeignKey
ALTER TABLE "Completed" ADD CONSTRAINT "Completed_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
