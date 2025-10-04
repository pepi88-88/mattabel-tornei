// src/lib/db.ts
import { Pool } from 'pg'

// In produzione su molti hosting Postgres richiede SSL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
})

// Named export: query
export async function query(text: string, params?: any[]) {
  return pool.query(text, params)
}

// Named export: tx (transazione con la stessa connessione)
export async function tx<T>(fn: (c: any) => Promise<T>) {
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

// Named export: connect (compatibilità con codice legacy che fa db.connect())
export async function connect() {
  return pool.connect()
}

// Default export: oggetto di comodo
const db = { query, tx, connect }
export default db
