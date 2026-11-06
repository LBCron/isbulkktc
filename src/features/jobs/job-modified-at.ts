/**
 * Resolves the `dateModified` for a JobPosting.
 *
 * The public RPCs already return a truthful `modified_at` (the employer's edit
 * for platform listings, the upstream change instant for imported ones), so the
 * normal path is a pass-through. The fallback exists for the edge case of a row
 * whose `modified_at` is absent: rather than emit an invalid/empty
 * `dateModified`, it degrades to `datePosted`, which keeps
 * `dateModified >= datePosted` — a requirement Google Jobs enforces — without
 * inventing a timestamp that never happened.
 *
 * A value that is present but unparseable is treated the same as an absent one:
 * emitting it verbatim would publish a `dateModified` that is not a date, which
 * is worse than falling back to the publication instant.
 */
export function resolveJobDateModified(
  modifiedAt: string | null | undefined,
  publishedAt: string,
): string {
  const modified = typeof modifiedAt === "string" ? modifiedAt.trim() : "";
  if (!modified) return publishedAt;
  const modifiedTime = Date.parse(modified);
  if (!Number.isFinite(modifiedTime)) return publishedAt;
  const publishedTime = Date.parse(publishedAt);
  return modifiedTime < publishedTime ? publishedAt : modified;
}
