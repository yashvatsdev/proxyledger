-- AlterEnum
ALTER TYPE "SettlementStatus" ADD VALUE 'CANCELED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'SETTLEMENT_REQUEST_RECEIVED';
ALTER TYPE "NotificationType" ADD VALUE 'SETTLEMENT_REJECTED';
ALTER TYPE "NotificationType" ADD VALUE 'SETTLEMENT_CANCELED';

-- AlterTable
ALTER TABLE "Settlement" ADD COLUMN     "resolvedAt" TIMESTAMPTZ(3),
ADD COLUMN     "submissionKey" TEXT;

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "settlementId" TEXT;

-- CreateIndex
CREATE INDEX "Favor_providerId_status_confirmedAt_idx" ON "Favor"("providerId", "status", "confirmedAt");

-- CreateIndex
CREATE INDEX "Favor_beneficiaryId_status_confirmedAt_idx" ON "Favor"("beneficiaryId", "status", "confirmedAt");

-- CreateIndex
CREATE INDEX "Settlement_requesterId_status_confirmedAt_idx" ON "Settlement"("requesterId", "status", "confirmedAt");

-- CreateIndex
CREATE INDEX "Settlement_recipientId_status_confirmedAt_idx" ON "Settlement"("recipientId", "status", "confirmedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Settlement_requesterId_submissionKey_key" ON "Settlement"("requesterId", "submissionKey");

-- CreateIndex
CREATE INDEX "Notification_settlementId_idx" ON "Notification"("settlementId");

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "Settlement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- New enum values are compared as text inside the migration transaction.
ALTER TABLE "Settlement" DROP CONSTRAINT "Settlement_confirmation_timestamp";
ALTER TABLE "Settlement" ADD CONSTRAINT "Settlement_confirmation_timestamp" CHECK (
  ("status"::text='CONFIRMED' AND "confirmedAt" IS NOT NULL)
  OR ("status"::text IN ('PENDING','REJECTED','CANCELED') AND "confirmedAt" IS NULL)
);

ALTER TABLE "Settlement" ENABLE ROW LEVEL SECURITY;

-- This non-materialized projection is rebuildable from immutable confirmed
-- source records. Unconfirmed activity is retained with zero accounting effect.
CREATE VIEW "ProxyLedgerEvents" WITH (security_invoker=true) AS
SELECT 'favor:' || "id" AS "eventKey", "id" AS "entryId", 'favor'::text AS "kind",
  "providerId" AS "partyAId", "beneficiaryId" AS "partyBId", "createdById",
  CASE WHEN "status"::text='CONFIRMED' THEN 1 ELSE 0 END::bigint AS "deltaA",
  "status"::text AS "status", "subjectId", "note", "occurredAt", "createdAt",
  coalesce("confirmedAt","resolvedAt","createdAt") AS "effectiveAt"
FROM "Favor"
UNION ALL
SELECT 'settlement:' || "id", "id", 'settlement'::text,
  "requesterId", "recipientId", "requesterId",
  CASE WHEN "status"::text='CONFIRMED' THEN "signedAmount" ELSE 0 END::bigint,
  "status"::text, NULL::text, "reason", NULL::timestamptz, "createdAt",
  coalesce("confirmedAt","resolvedAt","createdAt")
FROM "Settlement";

CREATE FUNCTION "proxy_lock_pair"(a text,b text) RETURNS void
LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path=public,pg_temp AS $$
  SELECT pg_advisory_xact_lock(hashtextextended(jsonb_build_array(least(a,b),greatest(a,b))::text,0));
$$;

CREATE FUNCTION "proxy_pair_balance"(a text,b text) RETURNS bigint
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public,pg_temp AS $$
  SELECT coalesce(sum(CASE WHEN "partyAId"=a THEN "deltaA" ELSE -"deltaA" END),0)::bigint
  FROM "ProxyLedgerEvents"
  WHERE ("partyAId"=a AND "partyBId"=b) OR ("partyAId"=b AND "partyBId"=a);
$$;

CREATE FUNCTION "serialize_favor_ledger"() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
BEGIN
  IF TG_OP='DELETE' THEN
    IF OLD."status"::text='CONFIRMED' THEN PERFORM "proxy_lock_pair"(OLD."providerId",OLD."beneficiaryId"); END IF;
    RETURN OLD;
  END IF;
  IF NEW."status"::text='CONFIRMED' THEN PERFORM "proxy_lock_pair"(NEW."providerId",NEW."beneficiaryId"); END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "Favor_serializes_ledger" BEFORE INSERT OR UPDATE OR DELETE ON "Favor"
FOR EACH ROW EXECUTE FUNCTION "serialize_favor_ledger"();

CREATE FUNCTION "guard_settlement_ledger"() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE current_balance bigint;
BEGIN
  IF TG_OP='DELETE' THEN
    PERFORM "proxy_lock_pair"(OLD."requesterId",OLD."recipientId");
    RETURN OLD;
  END IF;
  PERFORM "proxy_lock_pair"(NEW."requesterId",NEW."recipientId");
  IF TG_OP='UPDATE' THEN
    IF ROW(NEW."requesterId",NEW."recipientId",NEW."signedAmount",NEW."reason",NEW."submissionKey",NEW."createdAt")
      IS DISTINCT FROM ROW(OLD."requesterId",OLD."recipientId",OLD."signedAmount",OLD."reason",OLD."submissionKey",OLD."createdAt") THEN
      RAISE EXCEPTION 'Settlement content is immutable' USING ERRCODE='23514';
    END IF;
    IF OLD."status"::text<>'PENDING' OR NEW."status"::text NOT IN ('CONFIRMED','REJECTED','CANCELED') OR NEW."resolvedAt" IS NULL THEN
      RAISE EXCEPTION 'Invalid settlement transition' USING ERRCODE='23514';
    END IF;
  ELSIF NEW."submissionKey" IS NOT NULL AND (NEW."status"::text<>'PENDING' OR NEW."confirmedAt" IS NOT NULL OR NEW."resolvedAt" IS NOT NULL) THEN
    RAISE EXCEPTION 'A settlement request starts pending' USING ERRCODE='23514';
  END IF;
  IF NEW."status"::text='CONFIRMED' THEN
    current_balance := "proxy_pair_balance"(NEW."requesterId",NEW."recipientId");
    IF current_balance=0
      OR (current_balance>0 AND (NEW."signedAmount">=0 OR -NEW."signedAmount"::bigint>current_balance))
      OR (current_balance<0 AND (NEW."signedAmount"<=0 OR NEW."signedAmount"::bigint>-current_balance)) THEN
      RAISE EXCEPTION 'Settlement exceeds or contradicts current debt' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "Settlement_guards_ledger" BEFORE INSERT OR UPDATE OR DELETE ON "Settlement"
FOR EACH ROW EXECUTE FUNCTION "guard_settlement_ledger"();

-- Efficient canonical pair timelines, with deterministic ties handled by id.
CREATE INDEX "Favor_pair_effective_idx" ON "Favor"(least("providerId","beneficiaryId"),greatest("providerId","beneficiaryId"),coalesce("confirmedAt","resolvedAt","createdAt"),"id");
CREATE INDEX "Settlement_pair_effective_idx" ON "Settlement"(least("requesterId","recipientId"),greatest("requesterId","recipientId"),coalesce("confirmedAt","resolvedAt","createdAt"),"id");

REVOKE ALL ON "ProxyLedgerEvents" FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION "proxy_lock_pair"(text,text),"proxy_pair_balance"(text,text),"serialize_favor_ledger"(),"guard_settlement_ledger"() FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
    REVOKE ALL ON "Settlement","ProxyLedgerEvents" FROM anon;
  END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
    REVOKE ALL ON "Settlement","ProxyLedgerEvents" FROM authenticated;
  END IF;
END $$;
