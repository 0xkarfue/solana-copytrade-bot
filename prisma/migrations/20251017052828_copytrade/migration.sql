-- CreateTable
CREATE TABLE "TargetWallet" (
    "id" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TargetWallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CopySettings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "copyPercentage" DOUBLE PRECISION NOT NULL DEFAULT 10,
    "maxTradeAmount" DOUBLE PRECISION NOT NULL DEFAULT 0.1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "CopySettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CopySettings_userId_key" ON "CopySettings"("userId");

-- AddForeignKey
ALTER TABLE "TargetWallet" ADD CONSTRAINT "TargetWallet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CopySettings" ADD CONSTRAINT "CopySettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
