/**
 * Classifies the `RESEND_API_KEY` value.
 *
 * Resend API keys are prefixed `re_`. A key that is present but not in that
 * shape — a copy-pasted Supabase access token, a truncated value, a
 * placeholder — can never authenticate, yet the mailer treated it exactly like
 * a missing key and swallowed the result. That is how a wrong key went
 * unnoticed while every transactional email silently failed (#186).
 * Distinguishing "missing" from "malformed" lets the mailer report which one it
 * is instead of degrading to a quiet skip.
 *
 * Kept pure — the value is passed in, not read from `process.env` — so the rule
 * is unit-testable without a `server-only` boundary.
 */
export type ResendKeyStatus = "missing" | "malformed" | "present";

// `re_` followed by at least a few key characters. Deliberately loose on length:
// the shape check exists to catch a *wrong* value (a foreign token), not to
// re-implement Resend's key format.
const resendKeyPattern = /^re_[A-Za-z0-9_-]{4,}$/;

export function classifyResendApiKey(
  value: string | null | undefined,
): ResendKeyStatus {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return "missing";
  return resendKeyPattern.test(trimmed) ? "present" : "malformed";
}
