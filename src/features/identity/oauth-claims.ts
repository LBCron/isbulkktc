/**
 * The display-name precedence the database uses.
 *
 * `public.oauth_profile_claims` resolves a provider's name in this exact order
 * and the account trigger writes the result into `profiles.display_name`. The
 * callback needs the same answer for the welcome e-mail greeting, and reading
 * only `display_name`/`full_name` silently dropped LinkedIn, whose metadata
 * carries `name` plus a `given_name`/`family_name` pair and neither of the
 * other two keys — so a LinkedIn sign-up was greeted without a name while a
 * Google one was greeted with it.
 */
export function deriveDisplayName(
  metadata: Record<string, unknown> | null | undefined,
): string | null {
  if (!metadata) return null;

  const text = (value: unknown): string | null => {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  };

  const direct =
    text(metadata.display_name) ?? text(metadata.full_name) ?? text(metadata.name);
  if (direct) return direct;

  const pair = [text(metadata.given_name), text(metadata.family_name)]
    .filter((part): part is string => part !== null)
    .join(" ");

  return pair.length > 0 ? pair : null;
}
