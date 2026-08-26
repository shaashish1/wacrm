import { Queue } from 'bullmq';
import IORedis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const ACCOUNT_ID = process.argv[2] || '38d76928-8992-4206-9188-ec2a7cc2be4b';

const connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });
const queue = new Queue('wwebjs-messages', { connection });

const job = await queue.add('init-session', {
  accountId: ACCOUNT_ID,
  action: 'initSession',
  payload: {},
});

console.log('Enqueued init-session job:', job.id, 'for account', ACCOUNT_ID);
await connection.quit();
process.exit(0);
