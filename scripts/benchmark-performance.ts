// Local-only fixture benchmark. Never falls back to the application database.
import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { PrismaClient } from '../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { createLedgerService } from '../lib/ledger-service'
import { Pool } from 'pg'
import { readFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { setTimeout as delay } from 'node:timers/promises'
import { testDatabaseUrl } from '../tests/helpers/test-database'

const url = process.env.PERF_DATABASE_URL
assert(url && ['localhost', '127.0.0.1'].includes(new URL(url).hostname), 'PERF_DATABASE_URL must be a disposable loopback database')
assert(process.env.PERF_DATABASE_ISOLATED === '1', 'Explicit fixture isolation required')
testDatabaseUrl({...process.env,TEST_DATABASE_URL:url,TEST_DATABASE_ISOLATED:'1'})
const label = process.argv[2] ?? 'local'
assert(/^[a-z-]+$/.test(label), 'Use a fixed benchmark label')
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url, max: 1 }), transactionOptions: { maxWait: 10000 }, log: [{ emit: 'event', level: 'query' }] })
const ids = Array.from({ length: 11 }, () => randomUUID())
const actor = ids[0]
const token = randomBytes(32).toString('hex')
const origin = 'http://127.0.0.1:3119'
const routes = ['/', '/dashboard', '/dashboard/friends', '/dashboard/balances', '/dashboard/transactions', '/api/auth/session']
const percentile = (values: number[], p: number) => [...values].sort((a,b)=>a-b)[Math.ceil(values.length*p)-1]
const stats = (values: number[]) => ({ samples: values.length, p50: percentile(values,.5), p95: percentile(values,.95), p99: percentile(values,.99) })
let server: ReturnType<typeof spawn> | undefined
let queries = 0
let collect = false
const statements: { query:string;params:string }[]=[]
db.$on('query', event => { queries++;if(collect && event.query.trimStart().startsWith('WITH')) statements.push({query:event.query,params:event.params}) })
const phaseTimes:Record<string,number[]>={}
const bundleMetrics=new Map<string,{chunks:number;rawBytes:number;gzipBytes:number}>()
async function start() {
  server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', '3119'], {
    env: { ...process.env, DATABASE_URL: url, DIRECT_DATABASE_URL: url, AUTH_SECRET: randomBytes(32).toString('hex'), AUTH_GOOGLE_ID: 'benchmark.invalid', AUTH_GOOGLE_SECRET: 'benchmark-only', AUTH_URL: origin, AUTH_TRUST_HOST: 'true', VERCEL: '1', PERFORMANCE_TIMING: process.env.PERFORMANCE_TIMING ?? '0' },
    stdio: ['ignore','pipe','pipe'], windowsHide: true,
  })
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(()=>reject(new Error('Local server readiness timeout')),30000)
    let buffer=''
    server!.stdout!.on('data', chunk=>{
      const text=String(chunk)
      if (text.includes('Ready')) {clearTimeout(timer);resolve()}
      buffer+=text
      const lines=buffer.split('\n');buffer=lines.pop() ?? ''
      for(const line of lines) {
        if(!line.startsWith('{')) continue
        try { const timing=JSON.parse(line);if(timing.event==='performance' && typeof timing.durationMs==='number') (phaseTimes[timing.phase]??=[]).push(timing.durationMs) } catch { /* Non-timing output is not recorded. */ }
      }
    })
    server!.on('exit',()=>{clearTimeout(timer);reject(new Error('Local benchmark server stopped'))})
  })
}
async function stop() {
  if (!server) return
  const child = server
  await new Promise<void>(resolve=>{ child.once('exit',()=>resolve()); child.kill() })
  server = undefined
}
async function request(route: string) {
  const start = performance.now()
  const response = await fetch(origin+route, { headers: { cookie: `authjs.session-token=${token}` }, redirect: 'manual', signal: AbortSignal.timeout(20000) })
  const ttfb = performance.now()-start
  const body = await response.text()
  assert.equal(response.status,200, 'Expected authenticated route response')
  assert(!body.includes('Your workspace is temporarily unavailable'), 'Database read failed')
  if(route==='/api/auth/session') assert(JSON.parse(body).user.id===actor, 'Expected fixture session')
  const complete=performance.now()-start
  const chunks=[...new Set([...body.matchAll(/<script[^>]+src="(\/_next\/static\/chunks\/[^"?]+\.js)"/g)].map(match=>match[1]))]
  const key=chunks.join('|')
  if(!bundleMetrics.has(key)){
    const buffers=chunks.map(file=>readFileSync('.next/'+file.slice('/_next/'.length)))
    bundleMetrics.set(key,{chunks:chunks.length,rawBytes:buffers.reduce((sum,buffer)=>sum+buffer.length,0),gzipBytes:buffers.reduce((sum,buffer)=>sum+gzipSync(buffer).length,0)})
  }
  return { ttfb, complete, bytes: Buffer.byteLength(body), javascript:bundleMetrics.get(key)! }
}
async function main() {
  const results: Record<string, unknown> = { label, environment: 'local PostgreSQL / production Next.js / pool max=1', fixture: { friends:10, confirmedFavors:300 }, concurrency:1, coldDefinition:'First request to this route in a fresh Node process; OS/database caches remain warm', routes:{} }
  try {
    for (const [index,id] of ids.entries()) await db.user.create({data:{id,name:`Benchmark ${index}`,email:`${id}@example.invalid`}})
    await db.session.create({data:{userId:actor,sessionToken:token,expires:new Date(Date.now()+3600000)}})
    const subject = await db.subject.create({data:{ownerId:actor,name:'Synthetic benchmark subject'}})
    for (const friend of ids.slice(1)) {
      await db.friendship.create({data:{requesterId:actor,recipientId:friend,status:'ACCEPTED',connectedAt:new Date()}})
      await db.favor.createMany({data:Array.from({length:30},(_,i)=>({id:randomUUID(),providerId:actor,beneficiaryId:friend,createdById:actor,subjectId:subject.id,status:'CONFIRMED' as const,occurredAt:new Date(1700000000000+i*1000),confirmedAt:new Date(1700000000000+i*1000)}))})
    }
    const ledger=createLedgerService(db)
    collect=true
    await ledger.overview(actor)
    collect=false
    const pool=new Pool({connectionString:url,max:1})
    const plans=[]
    try {
      for(const statement of statements) {
        const plan=await pool.query('EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) '+statement.query,JSON.parse(statement.params))
        const raw=plan.rows[0]['QUERY PLAN'][0]
        // Exclude SQL and plan expressions, which can contain fixture IDs.
        const summarize=(node:Record<string,unknown>):unknown=>Object.fromEntries(Object.entries(node).filter(([key])=>['Node Type','Index Name','Actual Rows','Actual Loops','Actual Total Time','Shared Hit Blocks','Shared Read Blocks','Sort Method','Plans'].includes(key)).map(([key,value])=>[key,key==='Plans'?(value as Record<string,unknown>[]).map(summarize):value]))
        plans.push({planningMs:raw['Planning Time'],executionMs:raw['Execution Time'],plan:summarize(raw.Plan)})
      }
    } finally {await pool.end()}
    results.explain=plans
    const serviceTimes:number[]=[]
    queries=0
    for(let i=0;i<100;i++){const start=performance.now();await ledger.overview(actor);serviceTimes.push(performance.now()-start)}
    results.ledgerOverview={...stats(serviceTimes),sqlStatementsPerCall:queries/100}
    for (const route of routes) {
      const cold:number[]=[]
      for(let i=0;i<3;i++){await start();cold.push((await request(route)).complete);await stop()}
      await start()
      for(let i=0;i<5;i++) await request(route)
      await delay(50)
      for(const key of Object.keys(phaseTimes)) delete phaseTimes[key]
      const warm:number[]=[], ttfb:number[]=[]
      let bytes=0,javascript={chunks:0,rawBytes:0,gzipBytes:0}
      for(let i=0;i<100;i++){const sample=await request(route);warm.push(sample.complete);ttfb.push(sample.ttfb);bytes=sample.bytes;javascript=sample.javascript}
      await delay(50)
      ;(results.routes as Record<string,unknown>)[route]={warmCompleteMs:stats(warm),warmTtfbMs:stats(ttfb),processColdCompleteMs:stats(cold),htmlBytes:bytes,javascript,timing:Object.fromEntries(Object.entries(phaseTimes).map(([phase,values])=>[phase,{...stats(values),observationsPerRequest:values.length/100}]))}
      await stop()
    }
    await mkdir('.phase7-artifacts',{recursive:true})
    await writeFile(`.phase7-artifacts/performance-${label}.json`,JSON.stringify(results,null,2))
    console.log(JSON.stringify({label,routes:Object.fromEntries(Object.entries(results.routes as Record<string,{warmCompleteMs:unknown}>).map(([route,row])=>[route,row.warmCompleteMs])),ledgerOverview:results.ledgerOverview}))
  } finally {
    await stop()
    await db.session.deleteMany({where:{userId:{in:ids}}})
    await db.favor.deleteMany({where:{providerId:{in:ids}}})
    await db.friendship.deleteMany({where:{requesterId:{in:ids}}})
    await db.subject.deleteMany({where:{ownerId:{in:ids}}})
    await db.user.deleteMany({where:{id:{in:ids}}})
    await db.$disconnect()
  }
}
void main().catch(()=>{ console.error('Isolated performance benchmark failed; no raw error or credentials logged');process.exitCode=1 })
