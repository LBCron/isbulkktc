import assert from "node:assert/strict";
import test from "node:test";

import { callbackIsAllowed, evaluateCaptchaProbe } from "./verify-auth-config.mjs";

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

test("the captcha probe reads GoTrue's answer, not just the status", () => {
  // A wrong secret makes every auth request fail: GoTrue answers
  // `captcha_failed` with `invalid-input-secret`.
  assert.equal(
    evaluateCaptchaProbe(400, { error_code: "captcha_failed", msg: "invalid-input-secret" }).state,
    "invalid-secret",
  );
  // A valid secret rejects only our fake token — the healthy answer.
  assert.equal(
    evaluateCaptchaProbe(400, { error_code: "captcha_failed", msg: "invalid-input-response" }).state,
    "valid",
  );
  // No `captcha_failed` on a 4xx means captcha is not enforced.
  assert.equal(evaluateCaptchaProbe(200, {}).state, "disabled");
});

test("a rate-limited captcha probe is unreachable, not a false pass", () => {
  // Regression: the `200 <= status < 500` branch read a 429 as `disabled`, so a
  // throttled run reported "captcha is not enforced" without testing anything.
  // Supabase Auth answers 429 when a rate limit is exceeded.
  const throttled = evaluateCaptchaProbe(429, { msg: "Too many requests" });
  assert.equal(throttled.state, "unreachable");
  assert.equal(throttled.ok, false);
  // A 5xx is likewise inconclusive.
  assert.equal(evaluateCaptchaProbe(503, {}).state, "unreachable");
});
