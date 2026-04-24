/**
 * @backy/worker entrypoint — placeholder filled in by Wave C.3–C.5.
 * Wrangler needs `main` to point somewhere; a no-op fetch keeps the
 * scaffold typecheckable while the Hono app is wired up.
 */
export default {
  async fetch(): Promise<Response> {
    return new Response("backy worker scaffold", { status: 200 });
  },
};
