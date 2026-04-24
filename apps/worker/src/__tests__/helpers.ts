import type { D1Binding } from "@backy/api/db/d1-binding-adapter";
import type {
  R2Binding,
  R2BindingObject,
} from "@backy/api/r2/binding-adapter";
import type { Bindings } from "../lib/types";

export function fakeD1(rows: unknown[] = []): D1Binding {
  return {
    prepare() {
      const stmt = {
        bind() {
          return stmt;
        },
        async all<T>() {
          return { results: rows as T[], meta: {} };
        },
      };
      return stmt;
    },
  };
}

export function fakeR2(): R2Binding {
  const store = new Map<string, R2BindingObject>();
  return {
    async put(key, body) {
      const bytes =
        body instanceof ArrayBuffer
          ? new Uint8Array(body)
          : ArrayBuffer.isView(body)
            ? new Uint8Array(
                (body as ArrayBufferView).buffer,
                (body as ArrayBufferView).byteOffset,
                (body as ArrayBufferView).byteLength,
              )
            : new Uint8Array();
      store.set(key, {
        body: null,
        async arrayBuffer() {
          return bytes.buffer.slice(
            bytes.byteOffset,
            bytes.byteOffset + bytes.byteLength,
          ) as ArrayBuffer;
        },
        size: bytes.byteLength,
      });
    },
    async get(key) {
      return store.get(key) ?? null;
    },
    async delete(key) {
      store.delete(key);
    },
    async head(key) {
      return store.get(key) ?? null;
    },
  };
}

type OptionalBindingKey = {
  [K in keyof Bindings]-?: object extends Pick<Bindings, K> ? K : never;
}[keyof Bindings];

export type EnvOverrides =
  & { DB?: D1Database; R2?: R2Bucket }
  & { [K in OptionalBindingKey]?: Bindings[K] | undefined };

export function makeEnv(overrides: EnvOverrides = {}): Bindings {
  const base: Bindings = {
    DB: fakeD1() as unknown as D1Database,
    R2: fakeR2() as unknown as R2Bucket,
    E2E_SKIP_AUTH: "true",
    CRON_SECRET: "test-cron-secret",
  };
  return { ...base, ...overrides } as Bindings;
}
