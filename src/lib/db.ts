// src/lib/db.ts
import { Pool } from 'pg'

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
})

// Query semplice
async function query(text: string, params?: any[]) {
  return pool.query(text, params)
}

// Transazione garantendo la stessa connessione
async function tx<T>(fn: (c: any) => Promise<T>) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const res = await fn(client)
    await client.query('COMMIT')
    return res
  } catch (e) {
    try { await client.query('ROLLBACK') } catch {}
    throw e
  } finally {
    client.release()
  }
}

// Compat: per codice che fa `const client = await db.connect()`
async function connect() {
  return pool.connect()
}

export const db = { query, tx, connect }
