import assert from "node:assert/strict";
import test from "node:test";

import { newestJobModifiedAt } from "../../src/features/jobs/sitemap-lastmod";

test("newestJobModifiedAt returns the newest modification instant", () => {
  const newest = newestJobModifiedAt([
    { modifiedAt: "2026-10-20T12:00:00.000Z" },
    { modifiedAt: "2026-10-22T09:30:00.000Z" },
    { modifiedAt: "2026-10-21T00:00:00.000Z" },
  ]);

  assert.equal(newest?.toISOString(), "2026-10-22T09:30:00.000Z");
});

test("newestJobModifiedAt ignores the publication date entirely", () => {
  // The listing routes must advertise the same instant the vacancy entry
  // carries. A vacancy published later but edited earlier is the regression:
  // the old implementation reduced over `publishedAt` and would have picked
  // 2026-10-25 here, disagreeing with the vacancy `<lastmod>`.
  const rows: { modifiedAt: string; publishedAt: string }[] = [
    { modifiedAt: "2026-10-01T00:00:00.000Z", publishedAt: "2026-10-25T00:00:00.000Z" },
    { modifiedAt: "2026-10-02T00:00:00.000Z", publishedAt: "2026-10-03T00:00:00.000Z" },
  ];

  assert.equal(newestJobModifiedAt(rows)?.toISOString(), "2026-10-02T00:00:00.000Z");
});

test("newestJobModifiedAt returns null when there are no vacancies", () => {
  assert.equal(newestJobModifiedAt([]), null);
});

test("newestJobModifiedAt skips an unparseable date instead of returning it", () => {
  // `new Date("garbage")` is an invalid Date; once stored as `newest`, every
  // later comparison is false, so it would be returned and `toISOString()` at
  // the call site would throw RangeError.
  const valid = "2026-10-22T09:30:00.000Z";

  assert.equal(newestJobModifiedAt([{ modifiedAt: "garbage" }]), null);
  assert.equal(
    newestJobModifiedAt([{ modifiedAt: valid }, { modifiedAt: "garbage" }])?.toISOString(),
    valid,
  );
  // Order must not matter: an invalid row after a valid one used to win the
  // reduction and poison the result.
  assert.equal(
    newestJobModifiedAt([{ modifiedAt: "garbage" }, { modifiedAt: valid }])?.toISOString(),
    valid,
  );
  assert.equal(newestJobModifiedAt([{ modifiedAt: "" }]), null);
});
