import 'server-only'
import { Prisma, type PrismaClient } from '@/generated/prisma/client'
import { entityId } from './friend-types'
import { calculateBilateralBalance, type LedgerFavor, type LedgerSettlement } from './ledger'
import { balanceFilters, type BalanceCard, type BalanceTotals, type LedgerEntry } from './settlement-types'

type BalanceRow = { friendId: string; name: string | null; image: string | null; balance: bigint; favors: bigint; pendingSettlements: bigint; incomingSettlements: bigint; lastActive: Date | null; connected: boolean }
function integer(value: bigint | number) { const number = Number(value); if (!Number.isSafeInteger(number)) throw new Error('Ledger exceeds safe integer range'); return number }
const card = (row: BalanceRow): BalanceCard => ({ person: { id: row.friendId, name: row.name, image: row.image }, balance: integer(row.balance), favors: integer(row.favors), pendingSettlements: integer(row.pendingSettlements), lastActive: row.lastActive?.toISOString() ?? null, connected: row.connected })
const literal = (value: string) => value.replace(/[\\%_]/g, '\\$&')

// One aggregation over the actor's events, not one query per relationship.
// Includes accepted connections with no events and all historical participants.
function balancesSql(actor: string) {
  return Prisma.sql`WITH events AS (
    SELECT *, CASE WHEN "partyAId"=${actor} THEN "partyBId" ELSE "partyAId" END AS "friendId",
      CASE WHEN "partyAId"=${actor} THEN "deltaA" ELSE -"deltaA" END AS delta
    FROM "ProxyLedgerEvents" WHERE "partyAId"=${actor} OR "partyBId"=${actor}
  ), connections AS (
    SELECT CASE WHEN "requesterId"=${actor} THEN "recipientId" ELSE "requesterId" END AS "friendId"
    FROM "Friendship" WHERE status='ACCEPTED' AND ("requesterId"=${actor} OR "recipientId"=${actor})
  ), pairs AS (SELECT "friendId" FROM events UNION SELECT "friendId" FROM connections), balances AS (
    SELECT p."friendId", coalesce(sum(e.delta),0)::bigint AS balance,
      count(*) FILTER (WHERE e.kind='favor' AND e.status='CONFIRMED')::bigint AS favors,
      count(*) FILTER (WHERE e.kind='settlement' AND e.status='PENDING')::bigint AS "pendingSettlements",
      count(*) FILTER (WHERE e.kind='settlement' AND e.status='PENDING' AND e."createdById"<>${actor})::bigint AS "incomingSettlements",
      max(e."effectiveAt") AS "lastActive", EXISTS(SELECT 1 FROM connections c WHERE c."friendId"=p."friendId") AS connected
    FROM pairs p LEFT JOIN events e ON e."friendId"=p."friendId" GROUP BY p."friendId"
  ), profiles AS (SELECT b.*, u.name, u.image FROM balances b JOIN "User" u ON u.id=b."friendId")`
}
type EventRow = { entryId: string; kind: 'favor' | 'settlement'; partyAId: string; partyBId: string; createdById: string; friendId: string; name: string | null; image: string | null; deltaA: bigint; delta: bigint; signedAmount: number | null; status: string; subject: string | null; note: string | null; occurredAt: Date | null; effectiveAt: Date; createdAt: Date; running: bigint }
function eventDto(actor: string, row: EventRow): LedgerEntry {
  const utilityDelta = row.kind === 'favor'
    ? calculateBilateralBalance(actor, row.friendId, [{ providerId: row.partyAId, beneficiaryId: row.partyBId, status: row.status as LedgerFavor['status'] }])
    : calculateBilateralBalance(actor, row.friendId, [], [{ requesterId: row.partyAId, recipientId: row.partyBId, signedAmount: row.status === 'CONFIRMED' ? integer(row.deltaA) : 1, status: row.status as LedgerSettlement['status'] }])
  // Reuse the original accounting utility on bounded output to detect projection
  // drift. Full-history aggregation and running sums stay in PostgreSQL.
  if (utilityDelta !== integer(row.delta)) throw new Error('Ledger projection disagrees with accounting utility')
  const plannedDelta = row.kind === 'favor' ? calculateBilateralBalance(actor,row.friendId,[{ providerId:row.partyAId,beneficiaryId:row.partyBId,status:'CONFIRMED' }]) : calculateBilateralBalance(actor,row.friendId,[],[{ requesterId:row.partyAId,recipientId:row.partyBId,signedAmount:row.signedAmount!,status:'CONFIRMED' }])
  return { id: row.entryId, kind: row.kind, friend: { id: row.friendId, name: row.name, image: row.image }, submittedById: row.createdById, status: row.status, subject: row.subject, note: row.note, attendanceDate: row.occurredAt?.toISOString().slice(0,10) ?? null, effectiveAt: row.effectiveAt.toISOString(), createdAt: row.createdAt.toISOString(), delta: utilityDelta, plannedDelta, resultingBalance: integer(row.running) }
}
export function createLedgerService(db: PrismaClient) {
  async function totals(actor: string): Promise<BalanceTotals> {
    entityId.parse(actor)
    const [row] = await db.$queryRaw<{ owedToMe: bigint; iOwe: bigint; owesMeCount: bigint; iOweCount: bigint; settledCount: bigint; outstandingCount: bigint; relationshipCount: bigint; pendingSettlements: bigint; incomingSettlements: bigint }[]>(Prisma.sql`${balancesSql(actor)}
      SELECT coalesce(sum(balance) FILTER(WHERE balance>0),0)::bigint AS "owedToMe",
        coalesce(sum(-balance) FILTER(WHERE balance<0),0)::bigint AS "iOwe",
        count(*) FILTER(WHERE balance>0)::bigint AS "owesMeCount", count(*) FILTER(WHERE balance<0)::bigint AS "iOweCount",
        count(*) FILTER(WHERE balance=0)::bigint AS "settledCount", count(*) FILTER(WHERE balance<>0)::bigint AS "outstandingCount", count(*)::bigint AS "relationshipCount",
        coalesce(sum("pendingSettlements"),0)::bigint AS "pendingSettlements", coalesce(sum("incomingSettlements"),0)::bigint AS "incomingSettlements" FROM profiles`)
    return Object.fromEntries(Object.entries(row).map(([key,value]) => [key,integer(value)])) as BalanceTotals
  }
  async function list(actor: string, input: unknown = {}) {
    entityId.parse(actor)
    const { tab, sort, q, page } = balanceFilters.parse(input)
    const base = balancesSql(actor)
    const where = Prisma.sql`WHERE (${tab}='all' OR (${tab}='owes-me' AND balance>0) OR (${tab}='i-owe' AND balance<0) OR (${tab}='settled' AND balance=0)) AND (${q}='' OR name ILIKE ${`%${literal(q)}%`})`
    const [counts, rows] = await db.$transaction([
      db.$queryRaw<{ count: bigint }[]>(Prisma.sql`${base} SELECT count(*)::bigint AS count FROM profiles ${where}`),
      db.$queryRaw<BalanceRow[]>(Prisma.sql`${base} SELECT * FROM profiles ${where}
        ORDER BY CASE WHEN ${sort}='owed' THEN balance END DESC NULLS LAST, CASE WHEN ${sort}='owe' THEN balance END ASC NULLS LAST,
          CASE WHEN ${sort}='recent' THEN "lastActive" END DESC NULLS LAST, lower(name) ASC NULLS LAST, "friendId" ASC
        LIMIT 20 OFFSET ${(page-1)*20}`),
    ], { isolationLevel: 'RepeatableRead' })
    return { count: integer(counts[0].count), rows: rows.map(card) }
  }
  async function balancesFor(actor: string, targets: string[]) {
    entityId.parse(actor)
    if (targets.length > 20) throw new Error('Too many profiles requested')
    targets.forEach(target => entityId.parse(target))
    if (!targets.length) return []
    const rows = await db.$queryRaw<BalanceRow[]>(Prisma.sql`${balancesSql(actor)} SELECT * FROM profiles WHERE "friendId" IN (${Prisma.join(targets)})`)
    return rows.map(card)
  }
  async function pair(actor: string, friend: string) {
    entityId.parse(friend)
    return (await balancesFor(actor,[friend]))[0] ?? null
  }
  async function entries(actor: string, friend?: string, page = 1) {
    entityId.parse(actor)
    if (friend) entityId.parse(friend)
    if (!Number.isInteger(page)||page<1||page>1000) throw new Error('Invalid page')
    const scope = friend ? Prisma.sql`AND least("partyAId","partyBId")=least(${actor},${friend}) AND greatest("partyAId","partyBId")=greatest(${actor},${friend})` : Prisma.empty
    const base = Prisma.sql`WITH scoped AS (
      SELECT *,CASE WHEN "partyAId"=${actor} THEN "partyBId" ELSE "partyAId" END AS "friendId",
        CASE WHEN "partyAId"=${actor} THEN "deltaA" ELSE -"deltaA" END AS delta
      FROM "ProxyLedgerEvents" WHERE ("partyAId"=${actor} OR "partyBId"=${actor}) ${scope}
    ), running AS (SELECT *,sum(delta) OVER(PARTITION BY "friendId" ORDER BY "effectiveAt", "eventKey" ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)::bigint AS running FROM scoped)`
    const [counts, rows] = await db.$transaction([
      db.$queryRaw<{ count: bigint }[]>(Prisma.sql`${base} SELECT count(*)::bigint AS count FROM scoped`),
      db.$queryRaw<EventRow[]>(Prisma.sql`${base} SELECT r.*,u.name,u.image,s.name AS subject,st."signedAmount" FROM running r JOIN "User" u ON u.id=r."friendId" LEFT JOIN "Subject" s ON s.id=r."subjectId" LEFT JOIN "Settlement" st ON r.kind='settlement' AND st.id=r."entryId" ORDER BY r."effectiveAt" DESC,r."eventKey" DESC LIMIT 20 OFFSET ${(page-1)*20}`),
    ], { isolationLevel: 'RepeatableRead' })
    return { count: integer(counts[0].count), rows: rows.map(row=>eventDto(actor,row)) }
  }
  async function overview(actor: string) {
    // These reads share a single serverless connection. Do not queue two
    // snapshot transactions behind the totals query within the same request.
    const summary = await totals(actor)
    const preview = await list(actor,{ sort:'recent' })
    const recent = await entries(actor)
    return { summary, preview: preview.rows.slice(0,4), recent: recent.rows.slice(0,5) }
  }
  return { pair, balancesFor, list, totals, entries, overview }
}
