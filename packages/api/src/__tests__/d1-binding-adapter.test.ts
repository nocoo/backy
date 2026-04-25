import { describe, expect, test, vi } from "vitest";
import {
  createBindingD1Adapter,
  type D1Binding,
  type D1BindingPreparedStatement,
} from "../lib/db/d1-binding-adapter";

function makeBinding(
  result: { results?: unknown[]; meta?: Record<string, unknown> },
  capture?: { sql?: string; params?: unknown[] },
): D1Binding {
  return {
    prepare(sql: string) {
      if (capture) capture.sql = sql;
      const stmt: D1BindingPreparedStatement = {
        bind(...values: unknown[]) {
          if (capture) capture.params = values;
          return stmt;
        },
        async all<U>() {
          return result as unknown as {
            results?: U[];
            meta?: Record<string, unknown>;
          };
        },
      };
      return stmt;
    },
  };
}

describe("createBindingD1Adapter", () => {
  test("returns rows + meta when binding provides them", async () => {
    const meta = { changes: 1, last_row_id: 7 };
    const adapter = createBindingD1Adapter(
      makeBinding({ results: [{ id: "x" }], meta }),
    );
    const out = await adapter.query<{ id: string }>("SELECT 1");
    expect(out.results).toEqual([{ id: "x" }]);
    expect(out.meta).toEqual(meta);
  });

  test("defaults results to [] and omits meta when absent", async () => {
    const adapter = createBindingD1Adapter(makeBinding({}));
    const out = await adapter.query("SELECT 1");
    expect(out.results).toEqual([]);
    expect("meta" in out).toBe(false);
  });

  test("forwards sql + params via prepare/bind", async () => {
    const capture: { sql?: string; params?: unknown[] } = {};
    const adapter = createBindingD1Adapter(
      makeBinding({ results: [] }, capture),
    );
    await adapter.query("SELECT * FROM t WHERE id = ?", ["abc"]);
    expect(capture.sql).toBe("SELECT * FROM t WHERE id = ?");
    expect(capture.params).toEqual(["abc"]);
  });

  test("propagates errors from binding.all", async () => {
    const broken: D1Binding = {
      prepare() {
        const stmt: D1BindingPreparedStatement = {
          bind: () => stmt,
          all: () => {
            throw new Error("D1 binding crash");
          },
        };
        return stmt;
      },
    };
    const adapter = createBindingD1Adapter(broken);
    await expect(adapter.query("X")).rejects.toThrow("D1 binding crash");
  });

  test("default empty params still calls bind", async () => {
    const bindSpy = vi.fn(() => undefined);
    const stmt: D1BindingPreparedStatement = {
      bind(...values: unknown[]) {
        bindSpy();
        expect(values).toEqual([]);
        return stmt;
      },
      async all<U>() {
        return { results: [] as U[] };
      },
    };
    const adapter = createBindingD1Adapter({ prepare: () => stmt });
    await adapter.query("SELECT 1");
    expect(bindSpy).toHaveBeenCalledTimes(1);
  });
});
