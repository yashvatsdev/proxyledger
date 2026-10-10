import { expect, it } from 'vitest'
import { testDatabaseUrl } from './helpers/test-database'

const isolated = { TEST_DATABASE_ISOLATED: '1', TEST_DATABASE_URL: 'postgresql://test:test@localhost:5432/ledger_test' }
it('requires an explicit isolated test target without a runtime fallback', () => {
  for (const env of [{}, { DATABASE_URL: isolated.TEST_DATABASE_URL }, { TEST_DATABASE_URL: isolated.TEST_DATABASE_URL }, { ...isolated, NODE_ENV: 'production' }, { ...isolated, TEST_DATABASE_URL: 'https://example.com/test' }]) expect(() => testDatabaseUrl(env)).toThrow('Integration tests require')
  expect(testDatabaseUrl(isolated)).toBe(isolated.TEST_DATABASE_URL)
})
it('rejects the application or migration DB even with different credentials and pooler ports', () => {
  for (const key of ['DATABASE_URL', 'DIRECT_DATABASE_URL']) expect(() => testDatabaseUrl({ ...isolated, [key]: 'postgres://other:secret@localhost:6543/ledger_test' })).toThrow('Integration tests require')
})
it('allows a separate database on the local server and sanitizes malformed connection errors', () => {
  expect(testDatabaseUrl({ ...isolated, DATABASE_URL: 'postgresql://app:secret@localhost:5432/ledger' })).toBe(isolated.TEST_DATABASE_URL)
  try { testDatabaseUrl({ ...isolated, TEST_DATABASE_URL: 'credential-secret' }) } catch (error) { expect(String(error)).not.toContain('credential-secret') }
})
