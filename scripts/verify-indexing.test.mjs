import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateIndexNowKey,
  evaluateIndexability,
  extractPageSignals,
  hasLocalePrefix,
  isPathAllowed,
  isSameOrigin,
  parseRobots,
  parseSitemap,
  sampleUrls,
  validateHreflang,
  validateLoc,
  verdictForPage,
} from "./verify-indexing.mjs";

const ORIGIN = "https://isbulkktc.com";

test("robots parsing reads groups, rules and sitemaps past comments and blanks", () => {
  const robots = parseRobots(
    [
      "# a comment",
      "User-Agent: *",
      "Allow: /",
      "Disallow: /api/   # trailing comment",
      "",
      "User-agent: Googlebot",
      "Disallow: /private/",
      "Sitemap: https://isbulkktc.com/sitemap.xml",
    ].join("\n"),
  );
  assert.equal(robots.groups.length, 2);
  assert.deepEqual(robots.groups[0].agents, ["*"]);
  assert.deepEqual(robots.groups[0].rules, [
    { type: "allow", path: "/" },
    { type: "disallow", path: "/api/" },
  ]);
  assert.deepEqual(robots.sitemaps, ["https://isbulkktc.com/sitemap.xml"]);
});

test("robots path matching honours wildcards, the end-anchor and specificity", () => {
  const robots = parseRobots(
    ["User-Agent: *", "Disallow: /*.pdf$", "Disallow: /api/", "Allow: /api/public/"].join("\n"),
  );
  assert.equal(isPathAllowed(robots, "/files/report.pdf"), false);
  assert.equal(isPathAllowed(robots, "/files/report.pdf?x=1"), true); // `$` anchors the end
  assert.equal(isPathAllowed(robots, "/api/jobs"), false);
  assert.equal(isPathAllowed(robots, "/api/public/jobs"), true); // longer allow wins
  assert.equal(isPathAllowed(robots, "/"), true); // no matching rule
});

test("an empty Disallow allows everything and a missing group is permissive", () => {
  const robots = parseRobots(["User-Agent: *", "Disallow:"].join("\n"));
  assert.equal(isPathAllowed(robots, "/anything"), true);
  assert.equal(isPathAllowed(parseRobots(""), "/anything"), true);
});

test("sitemap parsing reads locs, lastmod and hreflang alternates", () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
<url>
<loc>https://isbulkktc.com/</loc>
<xhtml:link rel="alternate" hreflang="tr" href="https://isbulkktc.com/" />
<xhtml:link rel="alternate" hreflang="x-default" href="https://isbulkktc.com/" />
<lastmod>2026-11-05T16:08:07.000Z</lastmod>
</url>
</urlset>`;
  const parsed = parseSitemap(xml);
  assert.equal(parsed.isIndex, false);
  assert.equal(parsed.urls.length, 1);
  assert.equal(parsed.urls[0].loc, "https://isbulkktc.com/");
  assert.equal(parsed.urls[0].lastmod, "2026-11-05T16:08:07.000Z");
  assert.deepEqual(parsed.urls[0].alternates, [
    { hreflang: "tr", href: "https://isbulkktc.com/" },
    { hreflang: "x-default", href: "https://isbulkktc.com/" },
  ]);
});

test("sitemap index documents are recognised and their children listed", () => {
  const xml = `<?xml version="1.0"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<sitemap><loc>https://isbulkktc.com/sitemap-jobs.xml</loc></sitemap>
</sitemapindex>`;
  const parsed = parseSitemap(xml);
  assert.equal(parsed.isIndex, true);
  assert.deepEqual(parsed.childSitemaps, ["https://isbulkktc.com/sitemap-jobs.xml"]);
});

test("a <loc> must be absolute, on-origin and free of the default-locale prefix", () => {
  assert.equal(validateLoc("https://isbulkktc.com/jobs", ORIGIN).ok, true);
  assert.equal(validateLoc("", ORIGIN).ok, false);
  assert.equal(validateLoc("/jobs", ORIGIN).ok, false); // not absolute
  assert.equal(validateLoc("https://other.example/jobs", ORIGIN).ok, false);
  assert.equal(validateLoc("https://isbulkktc.com/jobs#x", ORIGIN).ok, false);
  assert.equal(validateLoc("https://isbulkktc.com/tr", ORIGIN).ok, false);
  assert.equal(validateLoc("https://isbulkktc.com/tr/jobs", ORIGIN).ok, false);
  // A non-default locale prefix is the canonical form and stays valid.
  assert.equal(validateLoc("https://isbulkktc.com/en", ORIGIN).ok, true);
});

test("a single-locale entry with no alternates is valid, not a defect", () => {
  // Regression: a page that exists in one language only (its localized
  // duplicates canonicalise back to it) must not be forced to carry hreflang.
  const verdict = validateHreflang([], `${ORIGIN}/jobs/source-x`, ORIGIN);
  assert.equal(verdict.ok, true);
  assert.equal(verdict.single, true);
  assert.deepEqual(verdict.problems, []);
});

test("hreflang validation requires the full set, x-default and a self-reference", () => {
  const locales = ["tr", "en", "ru", "el", "fa", "de"];
  const full = [
    ...locales.map((l) => ({ hreflang: l, href: `${ORIGIN}/${l}` })),
    { hreflang: "x-default", href: ORIGIN },
  ];
  const loc = `${ORIGIN}/en`;
  // The default locale's URL is the origin; make the self-reference match.
  const selfAware = full.map((a) => (a.hreflang === "en" ? { ...a, href: loc } : a));
  assert.equal(validateHreflang(selfAware, loc, ORIGIN).ok, true);

  const missing = validateHreflang(selfAware.filter((a) => a.hreflang !== "de"), loc, ORIGIN);
  assert.equal(missing.ok, false);
  assert.ok(missing.problems.some((p) => p.includes('"de"')));

  const noDefault = validateHreflang(selfAware.filter((a) => a.hreflang !== "x-default"), loc, ORIGIN);
  assert.equal(noDefault.ok, false);
  assert.ok(noDefault.problems.some((p) => p.includes("x-default")));

  const noSelf = validateHreflang(
    selfAware.map((a) => (a.hreflang === "en" ? { ...a, href: `${ORIGIN}/xx` } : a)),
    loc,
    ORIGIN,
  );
  assert.equal(noSelf.ok, false);
  assert.ok(noSelf.problems.some((p) => p.includes("self-referential")));

  const unknown = validateHreflang(
    [...selfAware, { hreflang: "fr", href: `${ORIGIN}/fr` }],
    loc,
    ORIGIN,
  );
  assert.equal(unknown.ok, false);
  assert.ok(unknown.problems.some((p) => p.includes("unknown hreflang")));
});

test("hasLocalePrefix distinguishes default, non-default and unprefixed paths", () => {
  assert.equal(hasLocalePrefix("/jobs/x"), false);
  assert.equal(hasLocalePrefix("/en/jobs/x"), true);
  assert.equal(hasLocalePrefix("/de"), true);
  assert.equal(hasLocalePrefix("/tr/jobs"), false); // default locale is not a "locale prefix"
  assert.equal(hasLocalePrefix("/"), false);
});

test("page signals are read from either attribute order", () => {
  const a = extractPageSignals(
    '<link rel="canonical" href="https://isbulkktc.com/en"><meta name="robots" content="noindex,follow">',
  );
  assert.equal(a.canonical, "https://isbulkktc.com/en");
  assert.equal(a.metaRobots, "noindex,follow");
  const b = extractPageSignals('<link href="https://isbulkktc.com" rel="canonical">');
  assert.equal(b.canonical, "https://isbulkktc.com");
  assert.equal(b.metaRobots, null);
});

test("meta directives are read in either attribute order and either quote style", () => {
  // Attribute order and quote style are not significant in HTML; assuming
  // `name` before `content` or double quotes only misses a real `noindex`.
  assert.equal(extractPageSignals('<meta name="robots" content="noindex">').metaRobots, "noindex");
  assert.equal(extractPageSignals('<meta content="noindex" name="robots">').metaRobots, "noindex");
  assert.equal(extractPageSignals("<meta name='robots' content='noindex'>").metaRobots, "noindex");
  assert.equal(
    extractPageSignals('<meta name="description" content="x"><meta name="robots" content="NOINDEX">')
      .metaRobots,
    "noindex",
  );
  assert.equal(extractPageSignals('<meta name="robots">').metaRobots, null);
  assert.equal(
    extractPageSignals('<meta name="google-site-verification" content="abc">').siteVerification,
    "abc",
  );
});

test("indexability rejects noindex, missing/relative/off-origin/default-locale canonicals and mismatches", () => {
  const loc = "https://isbulkktc.com/en";
  const base = { status: 200, loc, origin: ORIGIN };
  assert.equal(
    evaluateIndexability({ ...base, canonical: loc, metaRobots: null }).ok,
    true,
  );
  assert.equal(evaluateIndexability({ ...base, status: 404, canonical: loc }).state, "unreachable");
  assert.equal(evaluateIndexability({ ...base, canonical: loc, metaRobots: "noindex" }).state, "noindex");
  assert.equal(
    evaluateIndexability({ ...base, canonical: loc, xRobotsTag: "noindex" }).state,
    "noindex",
  );
  assert.equal(evaluateIndexability({ ...base, canonical: null }).state, "no-canonical");
  assert.equal(evaluateIndexability({ ...base, canonical: "/en" }).state, "relative-canonical");
  assert.equal(
    evaluateIndexability({ ...base, canonical: "https://other.example/en" }).state,
    "off-origin-canonical",
  );
  assert.equal(
    evaluateIndexability({ ...base, canonical: "https://isbulkktc.com/tr/jobs" }).state,
    "default-locale-canonical",
  );
  assert.equal(
    evaluateIndexability({ ...base, canonical: "https://isbulkktc.com/jobs" }).state,
    "canonical-mismatch",
  );
});

test("the IndexNow key is only valid when the served body matches", () => {
  const key = "isbulkktcada1d9ce6917a3363df4ff8fccc7629a";
  assert.equal(evaluateIndexNowKey({ status: 200, body: key, key }).ok, true);
  assert.equal(evaluateIndexNowKey({ status: 200, body: `${key}\n`, key }).ok, true); // trims
  assert.equal(evaluateIndexNowKey({ status: 200, body: "other", key }).state, "mismatch");
  assert.equal(evaluateIndexNowKey({ status: 404, body: "", key }).state, "unreachable");
  assert.equal(evaluateIndexNowKey({ status: 0, body: "", key, error: "ETIMEDOUT" }).state, "unreachable");
});

test("isSameOrigin rejects a lookalike host a prefix test would accept", () => {
  assert.equal(isSameOrigin(`${ORIGIN}/sitemap.xml`, ORIGIN), true);
  // The prefix trap: both of these `startsWith("https://isbulkktc.com")`.
  assert.equal(isSameOrigin("https://isbulkktc.com.evil.example/sitemap.xml", ORIGIN), false);
  assert.equal(isSameOrigin("https://isbulkktc.com.au/sitemap.xml", ORIGIN), false);
  assert.equal(isSameOrigin("http://isbulkktc.com/sitemap.xml", ORIGIN), false); // scheme differs
  assert.equal(isSameOrigin("not a url", ORIGIN), false);
});

test("verdictForPage consults the X-Robots-Tag header, not just the meta tag", () => {
  // Regression: the page fetch read the header but `checkPages` passed a
  // hardcoded `null`, so a header-only `noindex` was invisible to the live run.
  const loc = `${ORIGIN}/en`;
  const html = `<link rel="canonical" href="${loc}">`;
  assert.equal(
    verdictForPage({ status: 200, body: html, xRobotsTag: null, loc, origin: ORIGIN }).ok,
    true,
  );
  const headerOnly = verdictForPage({
    status: 200,
    body: html,
    xRobotsTag: "noindex",
    loc,
    origin: ORIGIN,
  });
  assert.equal(headerOnly.ok, false);
  assert.equal(headerOnly.state, "noindex");
  // A header that only repeats `index, follow` is not a block.
  assert.equal(
    verdictForPage({ status: 200, body: html, xRobotsTag: "index, follow", loc, origin: ORIGIN }).ok,
    true,
  );
});

test("sampling keeps the first URL and respects the size", () => {
  const urls = Array.from({ length: 100 }, (_, i) => ({ loc: `${ORIGIN}/p${i}` }));
  const sample = sampleUrls(urls, 8);
  assert.ok(sample.length <= 8);
  assert.equal(sample[0], `${ORIGIN}/p0`);
  assert.deepEqual(sampleUrls([{ loc: `${ORIGIN}/only` }], 8), [`${ORIGIN}/only`]);
});
