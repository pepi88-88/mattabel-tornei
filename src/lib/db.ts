// src/types/pg.d.ts
declare module 'pg' {
  export class Pool {
    constructor(config?: any)
    query(text: string, params?: any[]): Promise<any>
    connect(): Promise<any>
  }
  export type PoolClient = any
}
