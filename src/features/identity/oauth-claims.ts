// POSIX `[[:cntrl:]]` is C0 (U+0000–U+001F), DEL (U+007F) and C1 (U+0080–U+009F).
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f]/g;

// `pg_catalog.btrim` without a character set strips only spaces (U+0020).
// JavaScript's `trim()` also strips tabs, newlines and the Unicode space
// separators, so the two disagree on a name padded with a non-breaking space.
function btrim(value: string): string {
  return value.replace(/^ +| +$/g, "");
}

// `_meta ->> 'key'` coerces a JSON number or boolean to its text form and yields
// null for a missing key, `null`, or a nested object/array. A nested value is
// deliberately treated as absent rather than serialised the way `->>` would:
// GoTrue never stores a name claim as an object, and emitting `{"a": 1}` as a
// greeting name is worse than emitting nothing.
function claimText(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return null;
}

/**
 * The display-name precedence and normalisation `public.oauth_profile_claims`
 * uses, for the welcome-e-mail greeting.
 *
 * `public.oauth_profile_claims` resolves a provider's name in this exact order
 * and the account trigger writes the result into `profiles.display_name`. The
 * callback needs the same answer for the greeting, and reading only
 * `display_name`/`full_name` silently dropped LinkedIn, whose metadata carries
 * `name` plus a `given_name`/`family_name` pair and neither of the other two
 * keys — so a LinkedIn sign-up was greeted without a name while a Google one
 * was greeted with it.
 *
 * Every step mirrors the SQL — the coercion, the space-only trim, the
 * `coalesce` order (including that the pair fallback is never null, so a
 * control-only `display_name` yields no name rather than falling through), the
 * control-character strip, and `left(..., 80)` counting characters rather than
 * UTF-16 code units — so this function is byte-identical to the SQL derivation
 * for every non-object claim (verified against the deployed function).
 *
 * It is *not* byte-identical to the value the trigger stores: the trigger
 * afterwards substitutes the e-mail local part (or `'Aday'`) when the derived
 * name is shorter than two characters, which this helper cannot know. The two
 * are allowed to differ, and the e-mail renderer omits the greeting when the
 * name is absent rather than showing a placeholder.
 */
export function deriveDisplayName(
  metadata: Record<string, unknown> | null | undefined,
): string | null {
  if (!metadata) return null;

  const key = (name: string): string | null => {
    const text = claimText(metadata[name]);
    if (text === null) return null;
    const trimmed = btrim(text);
    return trimmed.length > 0 ? trimmed : null;
  };

  const direct = key("display_name") ?? key("full_name") ?? key("name");
  // `concat_ws(' ')` ignores nulls but is itself never null, so the pair is the
  // fallback even when both halves are absent (yielding an empty string).
  const pair = [key("given_name"), key("family_name")]
    .filter((part): part is string => part !== null)
    .join(" ");

  // `coalesce` stops at the first non-null, and the pair is never null.
  const candidate = direct ?? pair;
  const cleaned = btrim(candidate.replace(CONTROL_CHARACTERS, ""));
  const capped = [...cleaned].slice(0, 80).join("");
  return capped.length > 0 ? capped : null;
}
