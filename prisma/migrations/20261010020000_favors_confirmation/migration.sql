-- AlterEnum
ALTER TYPE "FavorStatus" ADD VALUE 'CANCELED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'FAVOR_REQUEST_RECEIVED';
ALTER TYPE "NotificationType" ADD VALUE 'FAVOR_REJECTED';
ALTER TYPE "NotificationType" ADD VALUE 'FAVOR_CANCELED';

-- DropForeignKey
ALTER TABLE "Favor" DROP CONSTRAINT "Favor_subjectId_fkey";

-- AlterTable
ALTER TABLE "Favor" ADD COLUMN     "resolvedAt" TIMESTAMPTZ(3),
ADD COLUMN     "submissionKey" TEXT;

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "favorId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Favor_createdById_submissionKey_key" ON "Favor"("createdById", "submissionKey");

-- CreateIndex
CREATE INDEX "Notification_favorId_idx" ON "Notification"("favorId");

-- AddForeignKey
ALTER TABLE "Favor" ADD CONSTRAINT "Favor_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_favorId_fkey" FOREIGN KEY ("favorId") REFERENCES "Favor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Include cancellation in the original timestamp invariant. No original columns
-- or records are rewritten. Text comparisons avoid PostgreSQL's restriction on
-- referencing new enum literals inside the same migration transaction.
ALTER TABLE "Favor" DROP CONSTRAINT "Favor_confirmation_timestamp";
ALTER TABLE "Favor" ADD CONSTRAINT "Favor_confirmation_timestamp" CHECK (
  ("status"::text IN ('CONFIRMED', 'REVERSED') AND "confirmedAt" IS NOT NULL)
  OR ("status"::text IN ('PENDING', 'REJECTED', 'CANCELED') AND "confirmedAt" IS NULL)
);

ALTER TABLE "Subject" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Favor" ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE "Subject", "Favor" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE "Subject", "Favor" FROM authenticated;
  END IF;
END $$;

-- Defense in depth: participants and recorded content are immutable, including
-- confirmed history. Application authorization still verifies the Auth.js actor.
CREATE FUNCTION "guard_favor_history"() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
BEGIN
  IF ROW(NEW."providerId", NEW."beneficiaryId", NEW."createdById", NEW."subjectId", NEW."occurredAt", NEW."note", NEW."submissionKey", NEW."createdAt")
    IS DISTINCT FROM ROW(OLD."providerId", OLD."beneficiaryId", OLD."createdById", OLD."subjectId", OLD."occurredAt", OLD."note", OLD."submissionKey", OLD."createdAt") THEN
    RAISE EXCEPTION 'Favor content is immutable' USING ERRCODE = '23514';
  END IF;
  IF OLD."status"::text <> 'PENDING' OR NEW."status"::text NOT IN ('CONFIRMED', 'REJECTED', 'CANCELED') OR NEW."resolvedAt" IS NULL THEN
    RAISE EXCEPTION 'Invalid favor transition' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "Favor_preserves_history" BEFORE UPDATE ON "Favor"
FOR EACH ROW EXECUTE FUNCTION "guard_favor_history"();
