// Prisma 7's pg adapter can expose a commit-time PostgreSQL serialization or
// deadlock error directly, instead of wrapping it in Prisma's P2034 error.
export function dbErrorCode(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null
  if ('code' in error && typeof error.code === 'string') return error.code
  if ('name' in error && error.name === 'DriverAdapterError' && 'cause' in error && typeof error.cause === 'object' && error.cause !== null) {
    const cause = error.cause
    if (('kind' in cause && cause.kind === 'TransactionWriteConflict') || ('originalCode' in cause && (cause.originalCode === '40001' || cause.originalCode === '40P01'))) return 'P2034'
    if ('originalCode' in cause && cause.originalCode === '23505') return 'P2002'
  }
  return null
}
