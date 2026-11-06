import assert from "node:assert/strict";
import test from "node:test";

import { callbackIsAllowed } from "./verify-auth-config.mjs";

const ORIGIN = "https://isbulkktc.com";

test("a bare-origin allowlist entry does not cover the callback path", () => {
  // GoTrue compiles each entry with glob.MustCompile(uri, '.', '/'), so the
  // separator characters are `.` and `/`: a bare origin matches only itself and
  // `/auth/callback` spans separators. Accepting it reported a missing callback
  // entry as healthy.
  assert.equal(callbackIsAllowed(ORIGIN, ORIGIN), false);
  assert.equal(callbackIsAllowed(ORIGIN, `${ORIGIN}/`), false);
});

test("the exact callback path or the globstar covers the callback", () => {
  assert.equal(callbackIsAllowed(ORIGIN, `${ORIGIN}/auth/callback`), true);
  assert.equal(callbackIsAllowed(ORIGIN, `${ORIGIN}/**`), true);
  assert.equal(
    callbackIsAllowed(ORIGIN, `http://localhost:3000/**,${ORIGIN}/auth/callback`),
    true,
  );
});

test("an unrelated or missing allowlist does not cover the callback", () => {
  assert.equal(callbackIsAllowed(ORIGIN, "http://localhost:3000/**"), false);
  assert.equal(callbackIsAllowed(ORIGIN, "https://www.isbulkktc.com/auth/callback"), false);
  assert.equal(callbackIsAllowed(ORIGIN, undefined), false);
});
