/**
 * The host of a company website, or `null` when it cannot be parsed.
 *
 * The `website` value is only constrained to `^https?://[^[:space:]]+$` by the
 * database CHECK and is typed as a plain `string` by the DAL, so it can hold a
 * value `new URL` rejects (`http://[`, `https://]`, `https://%zz`). Parsing it
 * unguarded threw a `TypeError: Invalid URL` while the public directory
 * deduplicated or rendered, taking the whole companies page down for every
 * visitor. Callers get `null` instead and skip the domain-derived affordance.
 */
export function companyWebsiteDomain(
  website: string | null | undefined,
): string | null {
  if (!website) return null;
  try {
    return new URL(website).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}
