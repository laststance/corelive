-- CreateTable
CREATE TABLE "ElectronSettings" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "hideAppIcon" BOOLEAN NOT NULL DEFAULT false,
    "showInMenuBar" BOOLEAN NOT NULL DEFAULT true,
    "startAtLogin" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ElectronSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ElectronSettings_userId_key" ON "ElectronSettings"("userId");

-- AddForeignKey
ALTER TABLE "ElectronSettings" ADD CONSTRAINT "ElectronSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
