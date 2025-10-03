import { Pool, PoolClient } from 'pg'

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
})

// Query semplice
async function query(text: string, params?: any[]) {
  return pool.query(text, params)
}

// Transazione garantendo la stessa connessione
async function tx<T>(fn: (c: PoolClient) => Promise<T>) {
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

export const db = { query, tx }
