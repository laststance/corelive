-- CreateTable
CREATE TABLE "Text" (
    "id" SERIAL NOT NULL,
    "text" VARCHAR(255) NOT NULL,
    "categoryId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Text_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Text_categoryId_key" ON "Text"("categoryId");

-- AddForeignKey
ALTER TABLE "Text" ADD CONSTRAINT "Text_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
