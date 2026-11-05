import { routing, type AppLocale } from "@/i18n/routing";

/**
 * Locale → pathname for a content family whose slug is translated per locale.
 *
 * Guides and editorial articles carry a different slug in each language
 * (`kktc-is-bulma-rehberi` vs `finding-a-job-in-northern-cyprus`) while the
 * locale files hold the same entries in the same order. Prefixing one language's
 * slug with another language's prefix — which is what assuming an identical
 * pathname does — advertises URLs that 404, so `hreflang` and the sitemap point
 * at pages that do not exist. Resolving the sibling slug by position keeps both
 * signals on real pages.
 *
 * `locale` must be the locale that owns `slug`; the index is looked up there and
 * then applied to every other locale's list. A locale whose list is a different
 * length, or an index that does not resolve, falls back to the caller's own
 * slug: an alternate that points at a *different* page is worse than one that
 * points at a missing one, because it asserts a false equivalence between two
 * distinct articles.
 *
 * Kept free of `server-only` (which `src/lib/seo.ts` pulls in through
 * `@/server/config/app-url`) so the slug-mapping contract can be unit-tested
 * directly; `seo.ts` re-exports it for the route files.
 */
export function getLocalizedSlugPathnames({
  section,
  locale,
  slug,
  siblings,
}: {
  section: string;
  locale: AppLocale;
  slug: string;
  siblings: (locale: AppLocale) => readonly { slug: string }[];
}): Record<AppLocale, string> {
  const ownerList = siblings(locale);
  const index = ownerList.findIndex((entry) => entry.slug === slug);
  const pathnames = {} as Record<AppLocale, string>;
  for (const candidate of routing.locales) {
    const candidateList = siblings(candidate);
    const sibling =
      index >= 0 && candidateList.length === ownerList.length
        ? candidateList[index]
        : undefined;
    pathnames[candidate] = `${section}/${sibling?.slug ?? slug}`;
  }
  return pathnames;
}

/**
 * The pathname that serves `slug` in `locale` when `slug` belongs to a
 * *different* locale, or `null` when there is nothing safe to redirect to.
 *
 * A content slug is translated per locale, so the same page has a different
 * slug in each language. Any link that carries one language's slug under
 * another language's prefix (`/en/rehber/kktc-is-bulma-rehberi`) therefore
 * addresses a page that does not exist. Resolving the slug's owning locale and
 * returning the sibling slug for `locale` lets the route answer with a redirect
 * to the real page instead of a 404 — a link that is merely mislabelled still
 * lands the reader on the right article, and a crawler consolidates it onto the
 * canonical URL.
 *
 * Returns `null` — never a redirect to the requested URL itself — when:
 *  - no locale knows the slug (a genuine 404), or
 *  - the caller's own locale owns it (the route renders it directly), or
 *  - the requested locale's list is a different length, so the positional
 *    mapping would point at a different article.
 *
 * The last two cases are why this cannot simply return `siblings(locale)[index]`:
 * a same-URL result would be an infinite redirect, and a wrong-article result
 * would assert a false equivalence. Both are worse than leaving the URL alone.
 */
export function resolveLocalizedSlugPathname({
  section,
  locale,
  slug,
  siblings,
}: {
  section: string;
  locale: AppLocale;
  slug: string;
  siblings: (locale: AppLocale) => readonly { slug: string }[];
}): string | null {
  for (const owner of routing.locales) {
    const ownerList = siblings(owner);
    const index = ownerList.findIndex((entry) => entry.slug === slug);
    if (index < 0) continue;
    // The caller's own locale owns the slug: the route resolves it, and
    // redirecting here would send the request back to itself.
    if (owner === locale) return null;
    const target = siblings(locale)[index];
    if (!target || target.slug === slug) return null;
    return `${section}/${target.slug}`;
  }
  return null;
}
