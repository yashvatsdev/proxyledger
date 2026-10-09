-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'FRIEND_REQUEST_RECEIVED';
ALTER TYPE "NotificationType" ADD VALUE 'FRIEND_REQUEST_ACCEPTED';
ALTER TYPE "NotificationType" ADD VALUE 'FRIEND_REQUEST_REJECTED';

-- AlterTable
ALTER TABLE "Friendship" ADD COLUMN     "connectedAt" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "friendshipId" TEXT;

-- CreateTable
CREATE TABLE "RateLimitBucket" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "RateLimitBucket_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "Notification_friendshipId_idx" ON "Notification"("friendshipId");

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_friendshipId_fkey" FOREIGN KEY ("friendshipId") REFERENCES "Friendship"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Preserve existing connection dates; no users or ledger rows are removed.
UPDATE "Friendship" SET "connectedAt" = "updatedAt" WHERE "status" = 'ACCEPTED';
ALTER TABLE "Friendship" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Notification" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RateLimitBucket" ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE "Friendship", "Notification", "RateLimitBucket" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE "Friendship", "Notification", "RateLimitBucket" FROM authenticated;
  END IF;
END
$$;

-- Future favor inserts must lock an accepted connection. Existing history is unchanged.
-- This also prevents a remove/insert race from bypassing the connection requirement.
CREATE FUNCTION "require_accepted_favor_connection"() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM 1 FROM "Friendship"
    WHERE "status" = 'ACCEPTED'
      AND LEAST("requesterId", "recipientId") = LEAST(NEW."providerId", NEW."beneficiaryId")
      AND GREATEST("requesterId", "recipientId") = GREATEST(NEW."providerId", NEW."beneficiaryId")
    FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'An accepted friendship is required for new favors' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER "Favor_requires_accepted_friendship"
  BEFORE INSERT OR UPDATE OF "providerId", "beneficiaryId" ON "Favor"
  FOR EACH ROW EXECUTE FUNCTION "require_accepted_favor_connection"();
