BEGIN;

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "FriendshipStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "FavorStatus" AS ENUM ('PENDING', 'CONFIRMED', 'REJECTED', 'REVERSED');

-- CreateEnum
CREATE TYPE "SettlementStatus" AS ENUM ('PENDING', 'CONFIRMED', 'REJECTED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('FRIENDSHIP_REQUEST', 'FAVOR_REQUEST', 'FAVOR_CONFIRMED', 'SETTLEMENT_REQUEST', 'SETTLEMENT_CONFIRMED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "emailVerified" TIMESTAMPTZ(3),
    "image" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMPTZ(3) NOT NULL
);

-- CreateTable
CREATE TABLE "Friendship" (
    "id" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "status" "FriendshipStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Friendship_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subject" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Subject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Favor" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "beneficiaryId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "subjectId" TEXT,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL,
    "note" TEXT,
    "status" "FavorStatus" NOT NULL DEFAULT 'PENDING',
    "confirmedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Favor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Settlement" (
    "id" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "signedAmount" INTEGER NOT NULL,
    "reason" TEXT,
    "status" "SettlementStatus" NOT NULL DEFAULT 'PENDING',
    "confirmedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Settlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "readAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Account_userId_idx" ON "Account"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- CreateIndex
CREATE INDEX "Friendship_requesterId_status_idx" ON "Friendship"("requesterId", "status");

-- CreateIndex
CREATE INDEX "Friendship_recipientId_status_idx" ON "Friendship"("recipientId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Subject_ownerId_name_key" ON "Subject"("ownerId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Subject_ownerId_code_key" ON "Subject"("ownerId", "code");

-- CreateIndex
CREATE INDEX "Favor_providerId_status_occurredAt_idx" ON "Favor"("providerId", "status", "occurredAt");

-- CreateIndex
CREATE INDEX "Favor_beneficiaryId_status_occurredAt_idx" ON "Favor"("beneficiaryId", "status", "occurredAt");

-- CreateIndex
CREATE INDEX "Favor_createdById_idx" ON "Favor"("createdById");

-- CreateIndex
CREATE INDEX "Favor_subjectId_idx" ON "Favor"("subjectId");

-- CreateIndex
CREATE INDEX "Settlement_requesterId_status_createdAt_idx" ON "Settlement"("requesterId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Settlement_recipientId_status_createdAt_idx" ON "Settlement"("recipientId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_createdAt_idx" ON "Notification"("userId", "readAt", "createdAt");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Friendship" ADD CONSTRAINT "Friendship_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Friendship" ADD CONSTRAINT "Friendship_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subject" ADD CONSTRAINT "Subject_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Favor" ADD CONSTRAINT "Favor_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Favor" ADD CONSTRAINT "Favor_beneficiaryId_fkey" FOREIGN KEY ("beneficiaryId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Favor" ADD CONSTRAINT "Favor_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Favor" ADD CONSTRAINT "Favor_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Settlement" ADD CONSTRAINT "Settlement_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Settlement" ADD CONSTRAINT "Settlement_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Domain invariants that Prisma's schema language cannot express.
-- Keep request direction while enforcing one canonical unordered pair.
CREATE UNIQUE INDEX "Friendship_unordered_pair_key" ON "Friendship" (
    LEAST("requesterId", "recipientId"),
    GREATEST("requesterId", "recipientId")
);

ALTER TABLE "Friendship" ADD CONSTRAINT "Friendship_distinct_participants"
    CHECK ("requesterId" <> "recipientId");

ALTER TABLE "Favor" ADD CONSTRAINT "Favor_distinct_participants"
    CHECK ("providerId" <> "beneficiaryId");
ALTER TABLE "Favor" ADD CONSTRAINT "Favor_creator_is_participant"
    CHECK ("createdById" IN ("providerId", "beneficiaryId"));
ALTER TABLE "Favor" ADD CONSTRAINT "Favor_confirmation_timestamp"
    CHECK (
        ("status" IN ('CONFIRMED', 'REVERSED') AND "confirmedAt" IS NOT NULL)
        OR ("status" IN ('PENDING', 'REJECTED') AND "confirmedAt" IS NULL)
    );

ALTER TABLE "Settlement" ADD CONSTRAINT "Settlement_distinct_participants"
    CHECK ("requesterId" <> "recipientId");
ALTER TABLE "Settlement" ADD CONSTRAINT "Settlement_nonzero_amount"
    CHECK ("signedAmount" <> 0);
ALTER TABLE "Settlement" ADD CONSTRAINT "Settlement_confirmation_timestamp"
    CHECK (
        ("status" = 'CONFIRMED' AND "confirmedAt" IS NOT NULL)
        OR ("status" IN ('PENDING', 'REJECTED') AND "confirmedAt" IS NULL)
    );

COMMIT;
