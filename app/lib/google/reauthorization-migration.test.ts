import { beforeAll, afterAll, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec("create role anon; create role authenticated; create role service_role bypassrls;");
  await db.exec(readFileSync("supabase/migrations/20261120170507_google_reauthorization_single_use.sql", "utf8"));
}, 30000);
afterAll(async () => { await db?.close(); });
it("denies all client access to OAuth attempts", async () => {
  for (const role of ["anon", "authenticated"]) {
    await db.exec(`reset role; set role ${role}`);
    await expect(db.query("select * from google_oauth_reauthorizations")).rejects.toThrow(/permission denied/);
    await expect(db.query("delete from google_oauth_reauthorizations")).rejects.toThrow(/permission denied/);
  }
});
it("consumes only the matching actor once using DELETE RETURNING", async () => {
  await db.exec("reset role; set role service_role;");
  const actor = "11111111-1111-4111-8111-111111111111";
  await db.query("insert into google_oauth_reauthorizations values ($1,$2,'france',$3,now()+interval '10 minutes')", ["a".repeat(64), actor, "b".repeat(64)]);
  const consume = () => db.query("delete from google_oauth_reauthorizations where state_hash=$1 and actor_id=$2 and broker='france' and expires_at>now() returning connection_fingerprint", ["a".repeat(64), actor]);
  const results = await Promise.all([consume(), consume()]);
  expect(results.reduce((sum, result) => sum + result.rows.length, 0)).toBe(1);
});
