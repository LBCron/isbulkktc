import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const readSource = (relative: string) =>
  readFileSync(new URL(`../../../${relative}`, import.meta.url), "utf8");

/**
 * Signing out must always end on the login page, even when the remote sign-out
 * call fails.
 *
 * auth-js's `_signOut` removes the local session before returning a transient
 * error (its `_removeSession()` runs on the non-benign branch), so the cookies
 * are already gone and the visitor is signed out. The action used to
 * `throw new Error(...)` in that branch, which turned a form whose whole purpose
 * is to get the visitor out into a 500 — with no retry that could help.
 *
 * This is a static guard: the branch is hard to reach from a unit test (it needs
 * a live GoTrue answering an error), but the shape that caused the 500 can be
 * pinned — no `throw` inside the signOut action.
 */
test("the sign-out action never throws; it always redirects to login", () => {
  const source = readSource("src/features/identity/actions.ts");
  const signOut = source.slice(source.indexOf("export async function signOut"));

  assert.doesNotMatch(
    signOut,
    /\bthrow\b/,
    "signOut must not throw; a failed remote sign-out still clears the local session",
  );
  assert.match(
    signOut,
    /redirectLocalized\("\/login"\)/,
    "signOut must redirect to the login page",
  );
  // The failure is still observable in the logs.
  assert.match(
    signOut,
    /console\.error\("Supabase sign-out failed\."/,
    "signOut must log a remote failure",
  );
});

test("the password-update path treats a failed sign-out as non-fatal too", () => {
  // The same rule already applied here; keep the two in step.
  const source = readSource("src/features/identity/actions.ts");
  const updatePassword = source.slice(
    source.indexOf("export async function updatePassword"),
    source.indexOf("export async function signOut"),
  );
  assert.match(
    updatePassword,
    /console\.error\("Supabase sign-out after password update failed\."/,
  );
  assert.doesNotMatch(
    updatePassword,
    /throw new Error\("Oturum kapatılamadı/,
    "the password-update sign-out must stay non-fatal",
  );
});
