import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import { PrismaClient } from '../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import { createLedgerService } from '../lib/ledger-service'
import { testDatabaseUrl } from '../tests/helpers/test-database'

// The baseline is the reviewed pre-change source exported to an ignored file.
// This operator tool is intentionally not an automated production/test command.
async function main() {
  const url=process.env.PERF_DATABASE_URL
  assert(url && ['localhost','127.0.0.1'].includes(new URL(url).hostname) && process.env.PERF_DATABASE_ISOLATED==='1','Disposable loopback database required')
  testDatabaseUrl({...process.env,TEST_DATABASE_URL:url,TEST_DATABASE_ISOLATED:'1'})
  const baselineModule = '../.phase7-artifacts/ledger-before.ts'
  const {createLedgerService:beforeFactory}=await import(baselineModule)
  const db=new PrismaClient({adapter:new PrismaPg({connectionString:url,max:1}),transactionOptions:{maxWait:10000},log:[{emit:'event',level:'query'}]})
  const pool=new Pool({connectionString:url,max:1})
  const ids=Array.from({length:11},()=>randomUUID()),actor=ids[0]
  const statements:{query:string;params:string}[]=[]
  let collect=false
  db.$on('query',event=>{if(collect && event.query.trimStart().startsWith('WITH')) statements.push({query:event.query,params:event.params})})
  try {
    for(const [i,id] of ids.entries())await db.user.create({data:{id,name:`Comparison ${i}`,email:`${id}@example.invalid`}})
    const subject=await db.subject.create({data:{ownerId:actor,name:'Synthetic comparison'}})
    for(const friend of ids.slice(1)){
      await db.friendship.create({data:{requesterId:actor,recipientId:friend,status:'ACCEPTED',connectedAt:new Date()}})
      await db.favor.createMany({data:Array.from({length:30},(_,i)=>({providerId:actor,beneficiaryId:friend,createdById:actor,subjectId:subject.id,status:'CONFIRMED' as const,occurredAt:new Date(1700000000000+i*1000),confirmedAt:new Date(1700000000000+i*1000)}))})
    }
    await pool.query('ANALYZE "Favor"; ANALYZE "Friendship"; ANALYZE "User"')
    const before=beforeFactory(db),after=createLedgerService(db)
    collect=true
    const expected=await before.overview(actor)
    collect=false
    const actual=await after.overview(actor)
    assert.deepEqual({summary:actual.summary,preview:actual.preview,recent:actual.recent},expected,'Accounting and DTO parity')
    const plans=[]
    for(const statement of statements){
      const result=await pool.query('EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) '+statement.query,JSON.parse(statement.params))
      const plan=result.rows[0]['QUERY PLAN'][0]
      plans.push({planningMs:plan['Planning Time'],executionMs:plan['Execution Time'],root:plan.Plan['Node Type'],sharedHits:plan.Plan['Shared Hit Blocks'],sharedReads:plan.Plan['Shared Read Blocks']})
    }
    const times={before:[] as number[],after:[] as number[]}
    for(let i=0;i<110;i++)for(const key of i%2?['after','before'] as const:['before','after'] as const){
      const start=performance.now()
      await (key==='before'?before:after).overview(actor)
      if(i>=10)times[key].push(performance.now()-start)
    }
    const summarize=(values:number[])=>{const sorted=[...values].sort((a,b)=>a-b);return {samples:values.length,p50:sorted[49],p95:sorted[94],p99:sorted[98]}}
    const results={environment:'isolated local / same fixtures and pool / alternating order',correctness:'matching accounting and DTOs',before:summarize(times.before),after:summarize(times.after),beforeExplain:plans}
    await writeFile('.phase7-artifacts/performance-paired.json',JSON.stringify(results,null,2))
    console.log(JSON.stringify(results,null,2))
  } finally {
    await db.favor.deleteMany({where:{providerId:actor}})
    await db.friendship.deleteMany({where:{requesterId:actor}})
    await db.subject.deleteMany({where:{ownerId:actor}})
    await db.user.deleteMany({where:{id:{in:ids}}})
    await db.$disconnect();await pool.end()
  }
}
void main().catch(()=>{console.error('Isolated SQL comparison failed; raw error withheld');process.exitCode=1})
