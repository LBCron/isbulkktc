import assert from "node:assert/strict";
import test from "node:test";

import { companyWebsiteDomain } from "./website-domain";
import { deduplicateCompanyDirectory, type CompanyDirectoryEntry } from "./directory";

/**
 * The `website` value is only constrained to `^https?://[^[:space:]]+$` by the
 * database CHECK and typed as a plain `string` by the DAL, so it can hold a
 * value `new URL` rejects (`http://[`, `https://]`, `https://%zz`). Parsing it
 * unguarded threw `TypeError: Invalid URL` while the public directory
 * deduplicated or rendered, taking the companies page down for every visitor.
 */

test("an unparseable website yields no domain instead of throwing", () => {
  for (const value of ["http://[", "https://]", "https://%zz", "http://a b", ""]) {
    assert.equal(companyWebsiteDomain(value), null, `${value} should not throw`);
  }
  assert.equal(companyWebsiteDomain(null), null);
  assert.equal(companyWebsiteDomain(undefined), null);
});

test("a normal website yields its www-stripped, lowercased host", () => {
  assert.equal(companyWebsiteDomain("https://www.Example.COM/path"), "example.com");
  assert.equal(companyWebsiteDomain("http://ok.example"), "ok.example");
});

test("deduplication survives a row whose website cannot be parsed", () => {
  const entries: CompanyDirectoryEntry[] = [
    {
      id: "a".repeat(8),
      name: "Acme",
      categories: ["retail"],
      locations: [
        { address: null, municipality: null, phone: null, website: "http://[", email: null },
      ],
    },
    {
      id: "b".repeat(8),
      name: "Acme",
      categories: ["retail"],
      locations: [
        { address: null, municipality: null, phone: null, website: "http://[", email: null },
      ],
    },
  ];

  assert.doesNotThrow(() => deduplicateCompanyDirectory(entries));
});
