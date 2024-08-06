/*
  Warnings:

  - You are about to drop the `Editor` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "Editor" DROP CONSTRAINT "Editor_categoryId_fkey";

-- DropForeignKey
ALTER TABLE "Editor" DROP CONSTRAINT "Editor_userId_fkey";

-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "text" TEXT NOT NULL DEFAULT '';

-- DropTable
DROP TABLE "Editor";
