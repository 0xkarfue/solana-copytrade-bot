-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "tgUserId" TEXT NOT NULL,
    "privateKey" TEXT NOT NULL,
    "publicKey" TEXT NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);
