/**
 * @backy/api — server-side libraries shared across web/cli/worker hosts.
 *
 * Subpath imports are the recommended way to consume this package, e.g.
 * `import { generateId } from "@backy/api/id"`. The barrel here re-exports
 * the most common surfaces so consumers can also do
 * `import { generateId } from "@backy/api"` when convenient.
 */

export const PACKAGE_NAME = "@backy/api";

export * from "./http/response";
export * from "./lib/id";
export * from "./lib/hosts";
export * from "./lib/ip";
export * from "./lib/sanitize";
export * from "./lib/url";
export * from "./lib/test-project";
