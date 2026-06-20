declare module 'pg' {
  export type QueryResultRow = Record<string, unknown>;

  export interface QueryResult<T = QueryResultRow> {
    rows: T[];
    rowCount: number | null;
  }

  export interface PoolClient {
    query<T = QueryResultRow>(text: string, values?: unknown[]): Promise<QueryResult<T>>;
    release(): void;
  }

  export interface Pool {
    query<T = QueryResultRow>(text: string, values?: unknown[]): Promise<QueryResult<T>>;
    connect(): Promise<PoolClient>;
  }

  const pg: {
    Pool: new (options?: Record<string, unknown>) => Pool;
  };

  export default pg;
}
