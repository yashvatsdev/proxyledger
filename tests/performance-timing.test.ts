import { afterEach, expect, it, vi } from 'vitest'
import { recordTiming, timeOperation } from '../lib/performance-timing'
import { classifyTimingRoute, registerHttpTiming } from '../lib/http-performance'
import { createServer } from 'node:http'
afterEach(()=>{vi.unstubAllEnvs();vi.restoreAllMocks()})
it('is disabled by default',async()=>{
  vi.stubEnv('PERFORMANCE_TIMING','0')
  const log=vi.spyOn(console,'info').mockImplementation(()=>{})
  expect(await timeOperation('business-logic',async()=>42)).toBe(42)
  recordTiming('request',5,'ok','dashboard')
  expect(log).not.toHaveBeenCalled()
})
it('records only safe timing fields and rethrows without logging private errors',async()=>{
  vi.stubEnv('PERFORMANCE_TIMING','1')
  const log=vi.spyOn(console,'info').mockImplementation(()=>{})
  const error=new Error('private token and user@example.invalid')
  await expect(timeOperation('authentication',async()=>{throw error})).rejects.toBe(error)
  const row=JSON.parse(log.mock.calls[0][0])
  expect(Object.keys(row).sort()).toEqual(['durationMs','event','outcome','phase'])
  expect(row.outcome).toBe('error')
  expect(log.mock.calls[0][0]).not.toContain('private')
})
it('redacts query strings and dynamic path identifiers into closed route labels',()=>{
  expect(classifyTimingRoute('/dashboard/friends/private-user-id?q=private-email')).toBe('friends')
  expect(classifyTimingRoute('/api/auth/callback/google?code=secret')).toBe('auth')
  expect(classifyTimingRoute('/secret-route')).toBeUndefined()
})
it('measures complete Node HTTP responses without serializing the request',async()=>{
  vi.stubEnv('PERFORMANCE_TIMING','1')
  const log=vi.spyOn(console,'info').mockImplementation(()=>{})
  registerHttpTiming()
  const server=createServer((_request,response)=>response.end('private ledger contents'))
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve))
  try {
    const address=server.address() as {port:number}
    await (await fetch(`http://127.0.0.1:${address.port}/dashboard?private-query=secret`)).text()
    const events=log.mock.calls.map(([line])=>JSON.parse(line))
    expect(events).toContainEqual(expect.objectContaining({phase:'request',route:'dashboard',outcome:'ok'}))
    expect(JSON.stringify(events)).not.toMatch(/secret|private|cookie/)
  } finally {await new Promise<void>(resolve=>server.close(()=>resolve()))}
})
