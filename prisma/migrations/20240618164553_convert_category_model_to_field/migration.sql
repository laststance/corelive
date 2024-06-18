/*
  Warnings:

  - You are about to drop the column `categoryId` on the `Editor` table. All the data in the column will be lost.
  - You are about to drop the `Category` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `category` to the `Editor` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "Category" DROP CONSTRAINT "Category_userId_fkey";

-- DropForeignKey
ALTER TABLE "Completed" DROP CONSTRAINT "Completed_categoryId_fkey";

-- DropForeignKey
ALTER TABLE "Editor" DROP CONSTRAINT "Editor_categoryId_fkey";

-- DropIndex
DROP INDEX "Editor_categoryId_key";

-- AlterTable
ALTER TABLE "Editor" DROP COLUMN "categoryId",
ADD COLUMN     "category" VARCHAR(255) NOT NULL;

-- DropTable
DROP TABLE "Category";
