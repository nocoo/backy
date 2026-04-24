/**
 * D1 binding adapter — uses Cloudflare Workers' native D1 binding.
 *
 * Used by `apps/worker`. The legacy Next.js host uses
 * `createRestD1Adapter` over the v4 HTTP API instead. The binding is
 * typed structurally so this file does not need a hard dependency on
 * `@cloudflare/workers-types`.
 */

import type { D1Adapter, D1QueryMeta } from "../../runtime";

export interface D1BindingResult<T = unknown> {
  results?: T[];
  meta?: D1QueryMeta;
}

export interface D1BindingPreparedStatement {
  bind(...values: unknown[]): D1BindingPreparedStatement;
  all<T = unknown>(): Promise<D1BindingResult<T>>;
}

export interface D1Binding {
  prepare(query: string): D1BindingPreparedStatement;
}

export function createBindingD1Adapter(db: D1Binding): D1Adapter {
  return {
    async query<T>(sql: string, params: unknown[] = []) {
      const stmt = db.prepare(sql).bind(...params);
      const result = await stmt.all<T>();
      const meta = result.meta;
      return {
        results: result.results ?? [],
        ...(meta !== undefined && { meta }),
      };
    },
  };
}
