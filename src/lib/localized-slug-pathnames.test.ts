import assert from "node:assert/strict";
import test from "node:test";

import type { AppLocale } from "@/i18n/routing";

import {
  getLocalizedSlugPathnames,
  resolveLocalizedSlugPathname,
} from "./localized-slug-pathnames";

/**
 * Regression guard for the translated-slug redirect contract.
 *
 * The same content family carries a different slug in each language, and a
 * cross-locale link (`/en/rehber/kktc-is-bulma-rehberi`, the Turkish slug under
 * the English prefix) used to answer 404. `resolveLocalizedSlugPathname` maps it
 * to the sibling slug. The bug class shipped twice (#105 and #142) with no unit
 * test, so the two unsafe inputs — a slug the caller's own locale already owns,
 * and a positional mapping onto a different article — are asserted here.
 */

const lists: Record<AppLocale, readonly { slug: string }[]> = {
  tr: [{ slug: "kktc-is-bulma-rehberi" }, { slug: "kktc-cv-hazirlama-rehberi" }],
  en: [{ slug: "finding-a-job-in-northern-cyprus" }, { slug: "cv-guide" }],
  ru: [{ slug: "kak-najti-rabotu" }, { slug: "rezyume" }],
  el: [{ slug: "evresi-ergasias" }, { slug: "odigos-viografikou" }],
  fa: [{ slug: "yaf-tan-kar" }, { slug: "rahnamaye-resume" }],
  de: [{ slug: "arbeit-finden-in-nordzypern" }, { slug: "lebenslauf-ratgeber" }],
};

const siblings = (locale: AppLocale) => lists[locale];

test("resolves another locale's slug to the requested locale's sibling", () => {
  assert.equal(
    resolveLocalizedSlugPathname({
      section: "/rehber",
      locale: "en",
      slug: "arbeit-finden-in-nordzypern",
      siblings,
    }),
    "/rehber/finding-a-job-in-northern-cyprus",
  );
});

test("maps by position, so a slug keeps its own article", () => {
  assert.equal(
    resolveLocalizedSlugPathname({
      section: "/rehber",
      locale: "en",
      slug: "lebenslauf-ratgeber",
      siblings,
    }),
    "/rehber/cv-guide",
  );
});

test("returns null for a slug no locale owns, so it stays a 404", () => {
  assert.equal(
    resolveLocalizedSlugPathname({
      section: "/rehber",
      locale: "en",
      slug: "not-a-real-guide",
      siblings,
    }),
    null,
  );
});

test("returns null when the caller's own locale owns the slug", () => {
  // Redirecting here would send the request back to the same URL forever.
  assert.equal(
    resolveLocalizedSlugPathname({
      section: "/rehber",
      locale: "de",
      slug: "arbeit-finden-in-nordzypern",
      siblings,
    }),
    null,
  );
});

test("returns null when the target list is too short, never a wrong-article redirect", () => {
  // German has two articles; English has only the first. Mapping German's
  // second slug by position would run off the end of the English list, so the
  // resolver must decline rather than borrow a stranger's slug.
  const shortEnglish: Record<AppLocale, readonly { slug: string }[]> = {
    ...lists,
    en: [{ slug: "finding-a-job-in-northern-cyprus" }],
  };
  assert.equal(
    resolveLocalizedSlugPathname({
      section: "/rehber",
      locale: "en",
      slug: "lebenslauf-ratgeber",
      siblings: (locale) => shortEnglish[locale],
    }),
    null,
  );
});

test("getLocalizedSlugPathnames maps every locale and keeps the section", () => {
  assert.deepEqual(
    getLocalizedSlugPathnames({
      section: "/blog",
      locale: "tr",
      slug: "kktc-is-bulma-rehberi",
      siblings,
    }),
    {
      tr: "/blog/kktc-is-bulma-rehberi",
      en: "/blog/finding-a-job-in-northern-cyprus",
      ru: "/blog/kak-najti-rabotu",
      el: "/blog/evresi-ergasias",
      fa: "/blog/yaf-tan-kar",
      de: "/blog/arbeit-finden-in-nordzypern",
    },
  );
});

test("getLocalizedSlugPathnames falls back to the caller's slug when uneven", () => {
  const shortEnglish: Record<AppLocale, readonly { slug: string }[]> = {
    ...lists,
    en: [{ slug: "finding-a-job-in-northern-cyprus" }],
  };
  const pathnames = getLocalizedSlugPathnames({
    section: "/rehber",
    locale: "de",
    slug: "lebenslauf-ratgeber",
    siblings: (locale) => shortEnglish[locale],
  });
  // The shorter locale keeps the caller's slug rather than borrowing a
  // different article's slug by position.
  assert.equal(pathnames.en, "/rehber/lebenslauf-ratgeber");
  assert.equal(pathnames.de, "/rehber/lebenslauf-ratgeber");
});
