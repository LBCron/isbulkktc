import assert from "node:assert/strict";
import test from "node:test";

import { classifyResendApiKey } from "./resend-key";

/**
 * The mailer used to treat every unusable `RESEND_API_KEY` as "not configured"
 * and skip sending quietly, so a key that was present but wrong failed
 * invisibly. These cases pin the three-way classification the mailer now
 * reports on.
 */

test("a missing or blank key is reported as missing", () => {
  for (const value of [undefined, null, "", "   "]) {
    assert.equal(classifyResendApiKey(value), "missing", `expected ${JSON.stringify(value)} to be missing`);
  }
});

test("a Resend-shaped key is accepted, surrounding whitespace ignored", () => {
  assert.equal(classifyResendApiKey("re_AbC123_xyz-789"), "present");
  assert.equal(classifyResendApiKey("  re_AbC123  "), "present");
});

test("a present but wrongly-shaped key is malformed, not missing", () => {
  // A Supabase access token copied into the Resend slot (the real #186 value).
  assert.equal(classifyResendApiKey("d81" + "x".repeat(33)), "malformed");
  assert.equal(classifyResendApiKey("sbp_0123456789abcdef"), "malformed");
  assert.equal(classifyResendApiKey("re_"), "malformed");
  assert.equal(classifyResendApiKey("RE_abc123"), "malformed");
});
