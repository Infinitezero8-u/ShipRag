// Type declarations for Supabase-like client

export interface SupabaseResponse<T = any> {
  data: T[] | null;
  error: { message: string } | null;
  count?: number | null;
}

export interface SupabaseSingleResponse<T = any> {
  data: T | null;
  error: { message: string } | null;
  count?: number | null;
}

export interface QueryBuilder<T = any> {
  select(columns?: string, options?: { count?: 'exact'; head?: boolean }): QueryBuilder<T>;
  eq(column: string, value: any): QueryBuilder<T>;
  neq(column: string, value: any): QueryBuilder<T>;
  ilike(column: string, pattern: string): QueryBuilder<T>;
  like(column: string, pattern: string): QueryBuilder<T>;
  in(column: string, values: any[]): QueryBuilder<T>;
  gte(column: string, value: any): QueryBuilder<T>;
  lte(column: string, value: any): QueryBuilder<T>;
  gt(column: string, value: any): QueryBuilder<T>;
  lt(column: string, value: any): QueryBuilder<T>;
  is(column: string, value: null | boolean): QueryBuilder<T>;
  not(column: string, op: string, value: any): QueryBuilder<T>;
  or(condition: string): QueryBuilder<T>;
  order(column: string, options?: { ascending?: boolean }): QueryBuilder<T>;
  limit(limit: number): QueryBuilder<T>;
  range(from: number, to: number): QueryBuilder<T>;
  offset(offset: number): QueryBuilder<T>;
  single(): QueryBuilder<T>;
  maybeSingle(): QueryBuilder<T>;
  contains(column: string, value: any[]): QueryBuilder<T>;
  then(resolve: (result: SupabaseResponse<T>) => any): Promise<any>;
}

export interface InsertBuilder<T = any> {
  select(): InsertBuilder<T>;
  single(): InsertBuilder<T>;
  then(resolve: (result: SupabaseSingleResponse<T>) => any): Promise<any>;
}

export interface UpdateBuilder<T = any> {
  eq(column: string, value: any): UpdateBuilder<T>;
  in(column: string, values: any[]): UpdateBuilder<T>;
  then(resolve: (result: SupabaseResponse<T>) => any): Promise<any>;
}

export interface DeleteBuilder<T = any> {
  eq(column: string, value: any): DeleteBuilder<T>;
  in(column: string, values: any[]): DeleteBuilder<T>;
  then(resolve: (result: SupabaseResponse<T>) => any): Promise<any>;
}

export interface SupabaseClient {
  from(table: string): {
    select(columns?: string, options?: { count?: 'exact'; head?: boolean }): QueryBuilder;
    insert(records: any | any[]): InsertBuilder;
    update(record: any): UpdateBuilder;
    delete(): DeleteBuilder;
    upsert(records: any | any[], options?: { onConflict?: string }): InsertBuilder;
  };
  rpc(name: string, params?: any): Promise<any>;
}
