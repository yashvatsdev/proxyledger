import 'server-only'
import { Pool, type PoolClient } from 'pg'
import { PrismaPg } from '@prisma/adapter-pg'
import { recordAcquisition, timeDatabaseQuery, timeOperation, timingEnabled } from './performance-timing'

type ConnectCallback = (error: Error | undefined, client: PoolClient | undefined, done: (error?: Error | boolean) => void) => void
export class TimedPool extends Pool {
  connect(): Promise<PoolClient>
  connect(callback: ConnectCallback): void
  connect(callback?: ConnectCallback): Promise<PoolClient> | void {
    if (!timingEnabled()) return callback ? super.connect(callback) : super.connect()
    const start=performance.now()
    if (callback) {
      return super.connect((error,client,done)=>{
        recordAcquisition(start,Boolean(error))
        callback(error,client,done)
      })
    }
    return super.connect().then(client=>{recordAcquisition(start,false);return client},error=>{recordAcquisition(start,true);throw error})
  }
}
type Adapter = Awaited<ReturnType<PrismaPg['connect']>>
type Queryable = Pick<Adapter,'queryRaw' | 'executeRaw'>
function timeQueryable<T extends Queryable>(connection: T): T {
  const query=connection.queryRaw.bind(connection)
  const execute=connection.executeRaw.bind(connection)
  connection.queryRaw = input => timeDatabaseQuery(()=>query(input))
  connection.executeRaw = input => timeDatabaseQuery(()=>execute(input))
  return connection
}
export class TimedPrismaPg extends PrismaPg {
  async connect() {
    const adapter = await super.connect()
    if (!timingEnabled()) return adapter
    timeQueryable(adapter)
    const start = adapter.startTransaction.bind(adapter)
    adapter.startTransaction = isolation => timeOperation('transaction-start',async()=>timeQueryable(await start(isolation)))
    return adapter
  }
}
