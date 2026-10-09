import 'dotenv/config'
import { getPrisma } from '../lib/db'
import { favorInputSchema, settlementInputSchema } from '../lib/ledger'

const prisma = getPrisma()

async function main() {
  // Deterministic IDs make reruns safe. Never delete other application data.
  await prisma.$transaction(async (tx) => {
    for (const [id, name, email] of [
      ['demo-alex', 'Alex Morgan', 'alex@example.test'],
      ['demo-rahul', 'Rahul Sharma', 'rahul@example.test'],
      ['demo-aryan', 'Aryan Mehta', 'aryan@example.test'],
      ['demo-neha', 'Neha Patel', 'neha@example.test'],
    ]) await tx.user.upsert({ where: { id }, update: {}, create: { id, name, email } })

    for (const [id, recipientId, status] of [
      ['demo-friend-rahul', 'demo-rahul', 'ACCEPTED'],
      ['demo-friend-aryan', 'demo-aryan', 'ACCEPTED'],
      ['demo-friend-neha', 'demo-neha', 'PENDING'],
    ] as const) await tx.friendship.upsert({ where: { id }, update: {}, create: { id, requesterId: 'demo-alex', recipientId, status } })

    for (const [id, name, code] of [['demo-dbms', 'Database Management Systems', 'DBMS'], ['demo-java', 'Java Programming', 'JAVA']]) {
      await tx.subject.upsert({ where: { id }, update: {}, create: { id, name, code, ownerId: 'demo-alex' } })
    }
    const occurredAt = new Date('2026-10-01T10:00:00Z')
    const examples = [
      ['demo-favor-1', 'demo-rahul', 'demo-alex', 'demo-dbms', 'CONFIRMED', 'Helped with database revision'],
      ['demo-favor-2', 'demo-alex', 'demo-rahul', 'demo-java', 'CONFIRMED', 'Returned the favor with Java revision'],
      ['demo-favor-3', 'demo-alex', 'demo-aryan', 'demo-java', 'CONFIRMED', 'Covered a study session'],
      ['demo-favor-4', 'demo-alex', 'demo-aryan', 'demo-dbms', 'CONFIRMED', 'Reviewed SQL exercises'],
      ['demo-favor-5', 'demo-aryan', 'demo-alex', 'demo-dbms', 'PENDING', 'Awaiting confirmation'],
      ['demo-favor-6', 'demo-alex', 'demo-rahul', 'demo-java', 'REJECTED', 'Duplicate request declined'],
      ['demo-favor-7', 'demo-alex', 'demo-rahul', 'demo-dbms', 'REVERSED', 'Previously confirmed entry corrected'],
    ] as const
    for (const [id, providerId, beneficiaryId, subjectId, status, note] of examples) {
      const input = favorInputSchema.parse({ providerId, beneficiaryId, createdById: providerId, subjectId, occurredAt, note })
      await tx.favor.upsert({ where: { id }, update: {}, create: { id, ...input, status, confirmedAt: status === 'CONFIRMED' || status === 'REVERSED' ? occurredAt : null } })
    }
    const adjustment = settlementInputSchema.parse({ requesterId: 'demo-alex', recipientId: 'demo-aryan', signedAmount: -1, reason: 'Both agreed to waive one favor' })
    await tx.settlement.upsert({ where: { id: 'demo-settlement-1' }, update: {}, create: { id: 'demo-settlement-1', ...adjustment, status: 'CONFIRMED', confirmedAt: occurredAt } })
    await tx.notification.upsert({ where: { id: 'demo-notification-1' }, update: {}, create: { id: 'demo-notification-1', userId: 'demo-alex', type: 'FAVOR_REQUEST', title: 'Confirm Aryan’s favor', message: 'Aryan recorded a DBMS study favor for you.' } })
  })
  console.info('Demo seed complete: Alex/Rahul balance 0; Alex/Aryan balance +1.')
}

main().catch(() => {
  console.error('Seed failed. Check database connectivity and migration status. Connection details are omitted.')
  process.exitCode = 1
}).finally(async () => { await prisma.$disconnect() })
