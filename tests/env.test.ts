import { expect, it } from 'vitest'
import { getDatabaseEnv } from '../lib/env'

it('validates PostgreSQL runtime and optional direct URLs', () => {
  expect(getDatabaseEnv({ DATABASE_URL: 'postgresql://demo:demo@localhost:5432/ledger' }).DATABASE_URL).toContain('postgresql:')
  expect(() => getDatabaseEnv({})).toThrow('Invalid database environment')
  expect(() => getDatabaseEnv({ DATABASE_URL: 'https://example.com' })).toThrow('PostgreSQL')
  expect(() => getDatabaseEnv({ DATABASE_URL: 'postgresql://localhost/ledger', DIRECT_DATABASE_URL: 'invalid' })).toThrow()
})
