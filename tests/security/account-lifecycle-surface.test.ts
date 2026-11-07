import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import test from "node:test";

/**
 * The account-lifecycle boundary (#418 "account journey" micro-audit,
 * LANE-GÜVENLİK).
 *
 * `public.profiles.status` is `active | suspended | closed` and nearly every
 * write RPC re-checks `status = 'active'` before it will act, so the column is
 * the account's kill switch. Two questions decide whether that switch is real:
 * can a client flip it, and does anything act on it at sign-in?
 *
 * The audit answered the first (no — the column grant is per-column and omits
 * `status`) and the second (no — `signIn` never reads the row), plus a third
 * the owner's brief named directly: there is no deletion path at all, so a
 * "closed" account is a status nobody can reach.
 *
 * The gates below pin what *is* enforced and record the two open gaps as
 * `todo`s against the owning lanes, so a refactor cannot quietly widen the
 * column grant or drop the status re-checks that already exist.
 */

const repoRoot = new URL("../../", import.meta.url);

function listFiles(directory: URL, suffix: RegExp): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory)) {
    const path = new URL(entry, directory);
    if (statSync(path).isDirectory()) files.push(...listFiles(new URL(`${entry}/`, directory), suffix));
    else if (suffix.test(entry)) files.push(path.pathname);
  }
  return files;
}

const migrationsDir = new URL("supabase/migrations/", repoRoot);
const migrations = listFiles(migrationsDir, /\.sql$/)
  .map((file) => readFileSync(file, "utf8"))
  .join("\n");
const statements = migrations
  .split(";")
  .map((statement) => statement.trim())
  .filter(Boolean);

const srcDir = new URL("src/", repoRoot);
const sourceFiles = listFiles(srcDir, /\.(ts|tsx)$/);
const source = sourceFiles.map((file) => readFileSync(file, "utf8")).join("\n");

// ---------------------------------------------------------------------------
// 1. The kill switch is not client-writable.
// ---------------------------------------------------------------------------

test("profiles.status is not grantable to a client role", () => {
  // `20261013000000_v4_identity_companies_security.sql` grants UPDATE on
  // `profiles` column-by-column: `grant update (display_name, locale)`. A
  // table-wide `grant update on public.profiles` would hand every authenticated
  // user the ability to un-suspend themselves, so the column list is the guard.
  const tableWide = statements.filter(
    (statement) =>
      /^grant\s+update/i.test(statement) &&
      /\bon\s+table\s+public\.profiles\b/i.test(statement) &&
      !/\(/i.test(statement.slice(0, statement.indexOf("on table"))),
  );
  assert.deepEqual(
    tableWide.map((statement) => statement.slice(0, 60)),
    [],
    "a table-wide UPDATE grant on public.profiles would expose the status column",
  );

  // The only column-level grant must not name `status`.
  const columnGrants = statements.filter(
    (statement) =>
      /^grant\s+update\s*\(/i.test(statement) &&
      /\bon\s+table\s+public\.profiles\b/i.test(statement),
  );
  assert.ok(columnGrants.length > 0, "the profiles column grant disappeared");
  for (const grant of columnGrants) {
    const columns = grant.slice(grant.indexOf("(") + 1, grant.indexOf(")"));
    assert.doesNotMatch(
      columns,
      /\bstatus\b/i,
      `a client role is granted UPDATE on profiles.status: ${grant.slice(0, 80)}`,
    );
  }
});

test("the write RPCs still refuse a non-active profile", () => {
  // These RPCs gate on the caller's own row being `active`; if one loses the
  // check a suspended account can keep acting through that RPC.
  const guarded = ["create_company", "register_push_subscription"];
  for (const name of guarded) {
    const match = migrations.match(
      new RegExp(
        `create or replace function public\\.${name}\\b[\\s\\S]*?\\$\\$;`,
        "i",
      ),
    );
    assert.ok(match, `${name} is not defined in the migrations`);
    assert.match(
      match[0],
      /\.status\s*=\s*'active'/i,
      `${name} no longer requires an active profile`,
    );
  }
});

// ---------------------------------------------------------------------------
// 2. Open gap: signing in never consults the kill switch.
// ---------------------------------------------------------------------------

test(
  "sign-in refuses an account whose profile is not active",
  { todo: "signIn calls signInWithPassword and redirects without reading profiles.status, so a suspended/closed account still gets a session (owner: LANE-AUTH, #400)" },
  () => {
    const signIn = source.match(
      /export async function signIn\b[\s\S]*?\n\}/,
    );
    assert.ok(signIn, "signIn is not defined");
    // A fix must read the caller's own profile row and act on its status. Any
    // shape counts as long as it consults `profiles` before the redirect.
    assert.match(
      signIn[0],
      /from\(\s*["'`]profiles["'`]\)[\s\S]{0,300}?status/i,
      "signIn does not check profiles.status before granting a session",
    );
  },
);

// ---------------------------------------------------------------------------
// 3. Open gap: there is no deletion path at all.
// ---------------------------------------------------------------------------

test(
  "a self-service account-deletion path exists",
  { todo: "no RPC, action or UI deletes a profile; KVKK/GDPR erasure is unmet (owner: LANE-SUPABASE + LANE-AUTH, #400)" },
  () => {
    const deletionStatements = statements.filter(
      (statement) =>
        /\bdelete\s+from\s+auth\.users\b/i.test(statement) ||
        /\bdelete\s+from\s+public\.profiles\b/i.test(statement),
    );
    assert.deepEqual(
      deletionStatements.map((statement) => statement.slice(0, 60)),
      [],
    );

    const deletionRpcs = [...source.matchAll(/rpc\(\s*["'`]([a-z0-9_]+)["'`]/gi)]
      .map((match) => match[1])
      .filter((name) =>
        /^(?:delete_account|delete_my_account|erase_account|close_account|anonymize_account)$/i.test(
          name,
        ),
      );
    assert.deepEqual(deletionRpcs, []);
  },
);
