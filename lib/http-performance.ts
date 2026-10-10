import 'server-only'
import { subscribe } from 'node:diagnostics_channel'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { recordTiming, type TimingRoute } from './performance-timing'

export function classifyTimingRoute(url: string): TimingRoute | undefined {
  const path = url.split('?')[0]
  if (path === '/') return 'landing'
  if (path === '/dashboard') return 'dashboard'
  if (/^\/dashboard\/friends(?:\/|$)/.test(path)) return 'friends'
  if (/^\/dashboard\/balances(?:\/|$)/.test(path)) return 'balances'
  if (/^\/dashboard\/transactions(?:\/|$)/.test(path)) return 'transactions'
  if (path.startsWith('/dashboard/')) return 'other-dashboard'
  if (path.startsWith('/api/auth/')) return 'auth'
}
export function registerHttpTiming() {
  const state = globalThis as typeof globalThis & { proxyLedgerHttpTiming?: boolean }
  if (state.proxyLedgerHttpTiming) return
  state.proxyLedgerHttpTiming=true
  const starts = new WeakMap<ServerResponse,{ start:number; route:TimingRoute }>()
  subscribe('http.server.request.start',message=>{
    const {request,response} = message as {request:IncomingMessage;response:ServerResponse}
    const route=classifyTimingRoute(request.url ?? '')
    if (route) starts.set(response,{start:performance.now(),route})
  })
  subscribe('http.server.response.finish',message=>{
    const {response} = message as {response:ServerResponse}
    const timing=starts.get(response)
    if (!timing) return
    starts.delete(response)
    recordTiming('request',performance.now()-timing.start,response.statusCode >= 500 ? 'error' : 'ok',timing.route)
  })
}
