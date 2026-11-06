/**
 * The listing routes (`/`, `/jobs`) advertise the newest vacancy's modification
 * instant as their `<lastmod>`, so it must equal the date the vacancy entry
 * itself carries. Taking it from `publishedAt` would make the two disagree as
 * soon as a listing is edited after publication, and Google drops a `<lastmod>`
 * it cannot verify against the page.
 *
 * The input is deliberately narrowed to `modifiedAt` so the compiler rejects a
 * call site that tries to reintroduce the publication date.
 *
 * A row whose `modifiedAt` is unparseable is skipped rather than allowed to win:
 * `new Date("garbage")` is an invalid `Date`, and once it is stored as `newest`
 * every later comparison is `false` (NaN), so the invalid value would be
 * returned and `toISOString()` at the call site would throw. Skipping it keeps
 * the result the newest *real* instant, and `null` when none is usable.
 */
export function newestJobModifiedAt(
  jobs: readonly { modifiedAt: string }[],
): Date | null {
  return jobs.reduce<Date | null>((newest, job) => {
    const modified = new Date(job.modifiedAt);
    if (Number.isNaN(modified.getTime())) return newest;
    return newest === null || modified > newest ? modified : newest;
  }, null);
}
