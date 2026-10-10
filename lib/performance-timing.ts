import 'server-only'
import { AsyncLocalStorage } from 'node:async_hooks'
import { performance } from 'node:perf_hooks'

// Closed labels only. Never accept request URLs, IDs, SQL, parameters or errors.
export type TimingPhase = 'request' | 'authentication' | 'connection-acquisition' | 'database-query' | 'transaction-start' | 'dashboard-data' | 'business-logic'
export type TimingRoute = 'landing' | 'dashboard' | 'friends' | 'balances' | 'transactions' | 'auth' | 'other-dashboard'
const queryScope = new AsyncLocalStorage<{ acquisitionMs: number }>()
export const timingEnabled = () => process.env.PERFORMANCE_TIMING === '1'
export function recordTiming(phase: TimingPhase, durationMs: number, outcome: 'ok' | 'error', route?: TimingRoute) {
  if (!timingEnabled() || !Number.isFinite(durationMs)) return
  // Only values constructed here are serialized, never an error or input payload.
  console.info(JSON.stringify({ event: 'performance', phase, durationMs: Math.round(Math.max(0,durationMs)*100)/100, outcome, ...(route ? { route } : {}) }))
}
export async function timeOperation<T>(phase: TimingPhase, work: () => Promise<T>): Promise<T> {
  if (!timingEnabled()) return work()
  const start = performance.now()
  let outcome: 'ok' | 'error' = 'ok'
  try { return await work() } catch (error) { outcome = 'error'; throw error }
  finally { recordTiming(phase, performance.now()-start, outcome) }
}
export function recordAcquisition(start: number, failed: boolean) {
  const duration = performance.now()-start
  const scope = queryScope.getStore()
  if (scope) scope.acquisitionMs += duration
  recordTiming('connection-acquisition',duration,failed ? 'error' : 'ok')
}
export async function timeDatabaseQuery<T>(work: () => Promise<T>): Promise<T> {
  if (!timingEnabled()) return work()
  return queryScope.run({ acquisitionMs:0 },async()=>{
    const start=performance.now()
    let outcome: 'ok' | 'error' = 'ok'
    try { return await work() } catch(error) { outcome='error';throw error }
    finally {
      // Driver/network/SQL duration excluding measured pool acquisition.
      recordTiming('database-query',performance.now()-start-queryScope.getStore()!.acquisitionMs,outcome)
    }
  })
}
