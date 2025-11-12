require('dotenv').config();
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const SESSIONS_DIR = path.resolve(__dirname, 'sessions');
if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR, { recursive: true });

const client = new Client({
  authStrategy: new LocalAuth({
    clientId: 'main-client',
    dataPath: SESSIONS_DIR,
  }),
  puppeteer: {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  }
});

function formatNumber(number) {
  if (!number) return null;
  number = number.trim();
  if (number.startsWith('+')) return number;
  if (number.startsWith('0')) number = number.substring(1);
  return '+98' + number; // Change to your target country as default
}

function getTehranUnixTime() {
  const tzOffset = 3.5 * 3600;
  return Math.floor(Date.now() / 1000) + tzOffset;
}

async function fetchContacts() {
  try {
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      port: process.env.DB_PORT || 3306,
    });

    const twentyFourHoursAgo = getTehranUnixTime() - 24 * 3600;

    const [countRows] = await connection.execute(
      "SELECT COUNT(*) as sent_count FROM broker WHERE update_at > ?",
      [twentyFourHoursAgo]
    );
    const sentLast24h = countRows[0].sent_count;

    const max_daily = 300;
    const max_each_epoch = 50;
    let limit_max = 0;
    if (sentLast24h >= max_daily) {
      console.log("Sent messages in last 24h >= " + max_daily + ". Stop script.");
      await connection.end();
      return [];
    } else if (sentLast24h > (max_daily - max_each_epoch)) {
      limit_max = max_daily - sentLast24h;
    } else {
      limit_max = max_each_epoch;
    }

    console.log(`Messages sent in last 24h: ${sentLast24h}. Fetching up to ${limit_max} new messages.`);

    if (limit_max <= 0) {
      await connection.end();
      return [];
    }

    const sql = `
      SELECT id, mobile, text, retry
      FROM broker
      WHERE status = 0
        AND retry < 3
      ORDER BY create_at ASC
      LIMIT ?
    `;
    const [rows] = await connection.execute(sql, [limit_max]);

    await connection.end();

    return rows.map(r => ({
      id: r.id,
      mobile: formatNumber(r.mobile),
      text: r.text,
    }));
  } catch (error) {
    console.error("DB Error:", error);
    return [];
  }
}

async function markAsFailed(id) {
  try {
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      port: process.env.DB_PORT || 3306
    });

    const now = getTehranUnixTime();

    await connection.execute(
      `UPDATE broker
       SET retry = retry + 1,
           update_at = ?,
           status = IF(retry + 1 >= 3, 2, status)
       WHERE id = ?`,
      [now, id]
    );

    await connection.end();
  } catch (error) {
    console.error(`Failed to increment retry for id ${id}:`, error);
  }
}

async function markAsSent(id) {
  try {
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      port: process.env.DB_PORT || 3306
    });

    const now = getTehranUnixTime();
    await connection.execute(
      "UPDATE broker SET status = 1, update_at = ? WHERE id = ?",
      [now, id]
    );

    await connection.end();
  } catch (error) {
    console.error(`Failed to update status for id ${id}:`, error);
  }
}

client.on('qr', qr => {
  console.log('QR received — scan with your phone:');
  qrcode.generate(qr, { small: true });
});

client.on('ready', async () => {
  console.log('Client is ready!');

  const contacts = await fetchContacts();
  if (!contacts.length) {
    console.log('No contacts found in DB.');
    return;
  }

  for (let i = 0; i < contacts.length; i++) {
    const contact = contacts[i];
    const chatId = contact.mobile.replace(/\D/g, '') + '@c.us';

    try {
      await client.sendMessage(chatId, contact.text);
      console.log(`Message sent to ${contact.mobile}`);

      await markAsSent(contact.id);
      
      console.log(`Status updated for id ${contact.id}`);
    }
    catch (err) {
      console.error(`Failed to send to ${contact.mobile}:`, err.message || err);
      
      await markAsFailed(contact.id);
    }

    await new Promise(r => setTimeout(r, 30 * 1000));
  }

  console.log('All messages processed.');
});

client.on('auth_failure', msg => {
  console.error('Auth failure:', msg);
});

client.on('disconnected', reason => {
  console.log('Client disconnected:', reason);
});

client.initialize();
