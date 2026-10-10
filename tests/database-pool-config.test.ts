import { describe, expect, it } from 'vitest'
import { databasePoolConfig, databaseTransactionOptions } from '../lib/database-pool-config'
import { rootCertificates } from 'node:tls'
import { Client } from 'pg'

describe('runtime PostgreSQL pool policy', () => {
  it('allows bounded transaction acquisition without changing execution or isolation defaults', () => {
    expect(databaseTransactionOptions).toEqual({ maxWait: 10000 })
    expect(databaseTransactionOptions.maxWait).toBe(databasePoolConfig('postgresql://test:test@localhost/postgres', true).connectionTimeoutMillis)
  })
  it('preserves an explicit CA through the actual pg connection-string parser', () => {
    const ca = rootCertificates[0]
    const config = databasePoolConfig('postgresql://test:test@pool.example.invalid:6543/postgres?sslmode=require', true, ca)
    const client = new Client(config) as unknown as { connectionParameters: { ssl: unknown } }
    expect(client.connectionParameters.ssl).toEqual({ rejectUnauthorized: true, ca })
    expect(new URL(config.connectionString).searchParams.has('sslmode')).toBe(false)
  })
  it('accepts escaped PEM newlines without exposing invalid certificate values', () => {
    expect(databasePoolConfig('postgresql://test:test@pool.example.invalid/postgres', true, rootCertificates[0].replace(/\n/g, '\\n')).ssl?.ca).toBe(rootCertificates[0].trim())
    expect(() => databasePoolConfig('postgresql://test:secret@pool.example.invalid/postgres', true, 'private-secret')).toThrow('Invalid database CA certificate')
    expect(() => databasePoolConfig('postgresql://test:test@pool.example.invalid/postgres?sslrootcert=private', true, rootCertificates[0])).toThrow('Invalid or conflicting database CA configuration')
  })
  it('requires verified TLS for a remote URL without SSL options', () => {
    const config = databasePoolConfig('postgresql://test:test@pool.example.invalid:6543/postgres', true)
    expect(new URL(config.connectionString!).searchParams.get('sslmode')).toBe('verify-full')
    expect(config.ssl).toEqual({ rejectUnauthorized: true })
    expect(config.max).toBe(1)
  })
  it('does not allow remote URL options to disable certificate verification', () => {
    const config = databasePoolConfig('postgresql://test:test@pool.example.invalid/postgres?sslmode=require&uselibpqcompat=true&ssl=true')
    const url = new URL(config.connectionString!)
    expect(url.searchParams.get('sslmode')).toBe('verify-full')
    expect(url.searchParams.has('uselibpqcompat')).toBe(false)
    expect(url.searchParams.has('ssl')).toBe(false)
  })
  it.each(['sslmode=disable', 'sslmode=no-verify', 'ssl=false', 'ssl=0'])('rejects explicit insecure remote option %s without exposing credentials', option => {
    expect(() => databasePoolConfig(`postgresql://test:secret@pool.example.invalid/postgres?${option}`)).toThrow('Remote database connections require verified TLS')
  })
  it('preserves local development without requiring TLS and bounds connection timeouts', () => {
    const config = databasePoolConfig('postgresql://test:test@localhost:55438/proxy_ledger_test', false)
    expect(config.ssl).toBeUndefined()
    expect(config.max).toBe(5)
    expect(config.connectionTimeoutMillis).toBe(10000)
    expect(config.idleTimeoutMillis).toBe(30000)
  })
})
