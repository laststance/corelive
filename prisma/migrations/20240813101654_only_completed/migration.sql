/*
  Warnings:

  - You are about to drop the column `categoryId` on the `Completed` table. All the data in the column will be lost.
  - You are about to drop the `Category` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `category` to the `Completed` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "Category" DROP CONSTRAINT "Category_userId_fkey";

-- DropForeignKey
ALTER TABLE "Completed" DROP CONSTRAINT "Completed_categoryId_fkey";

-- AlterTable
ALTER TABLE "Completed" DROP COLUMN "categoryId",
ADD COLUMN     "category" VARCHAR(255) NOT NULL;

-- DropTable
DROP TABLE "Category";
