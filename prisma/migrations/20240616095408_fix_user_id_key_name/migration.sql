/*
  Warnings:

  - You are about to drop the column `authorId` on the `Completed` table. All the data in the column will be lost.
  - Added the required column `userId` to the `Completed` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "Completed" DROP CONSTRAINT "Completed_authorId_fkey";

-- AlterTable
ALTER TABLE "Completed" DROP COLUMN "authorId",
ADD COLUMN     "userId" INTEGER NOT NULL;

-- AddForeignKey
ALTER TABLE "Completed" ADD CONSTRAINT "Completed_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
