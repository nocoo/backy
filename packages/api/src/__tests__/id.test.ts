import { describe, expect, test } from "vitest";
import { generateId, generateWebhookToken } from "../lib/id";

describe("generateId", () => {
  test("returns a 21-character string", () => {
    const id = generateId();
    expect(id).toHaveLength(21);
  });

  test("generates unique IDs", () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateId()));
    expect(ids.size).toBe(100);
  });

  test("uses URL-safe characters only", () => {
    const id = generateId();
    // Tightened: pin both length AND URL-safe alphabet in one regex.
    // Previously the length was tested separately above; combining
    // ensures a regression that returns the right length but a non-
    // URL-safe character (e.g. '+', '/' from base64) would surface
    // even if someone deletes the length-only test.
    expect(id).toMatch(/^[A-Za-z0-9_-]{21}$/);
  });
});

describe("generateWebhookToken", () => {
  test("returns a 48-character string", () => {
    const token = generateWebhookToken();
    expect(token).toHaveLength(48);
  });

  test("generates unique tokens", () => {
    const tokens = new Set(
      Array.from({ length: 100 }, () => generateWebhookToken()),
    );
    expect(tokens.size).toBe(100);
  });

  test("uses URL-safe characters only", () => {
    const token = generateWebhookToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{48}$/);
  });
});
