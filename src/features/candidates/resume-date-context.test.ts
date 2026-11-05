import assert from "node:assert/strict";
import test from "node:test";

import { parseResumeText } from "./resume-parser";

/**
 * The date token accepts a bare year, so without a context filter a CV's birth
 * date, address or phone line contributed a year to work experience (#208):
 * "1995-2000 doğumlu" became a job period. These cases pin the filter.
 */

test("a birth year is not read as a work-experience period", () => {
  const draft = parseResumeText(
    [
      "AYŞE YILMAZ",
      "Kıdemli Yazılım Geliştirici",
      "",
      "Doğum: 1995-2000",
      "1995 doğumlu",
      "",
      "DENEYİM",
      "Acme Yazılım - Geliştirici - 2019 - 2023",
    ].join("\n"),
  );

  assert.equal(draft.experience?.length, 1);
  assert.equal(draft.experience?.[0]?.startDate, "2019");
  assert.equal(draft.experience?.[0]?.endDate, "2023");
});

test("an address year is not read as a period", () => {
  const draft = parseResumeText(
    [
      "DENEYİM",
      "Acme Yazılım - Geliştirici - 2019 - 2023",
      "Adres: Lefkoşa - 2019",
    ].join("\n"),
  );

  assert.equal(draft.experience?.length, 1);
  assert.equal(draft.experience?.[0]?.organization, "Acme Yazılım");
});

test("an English birth line is filtered too", () => {
  const draft = parseResumeText(
    [
      "EXPERIENCE",
      "Acme Corp - Engineer - 2019 - 2023",
      "Date of birth: 1990",
    ].join("\n"),
  );

  assert.equal(draft.experience?.[0]?.startDate, "2019");
  assert.equal(draft.experience?.[0]?.endDate, "2023");
});

test("a backwards or implausible year range is rejected", () => {
  const draft = parseResumeText(
    [
      "DENEYİM",
      "Acme Yazılım - Geliştirici - 2023 - 2019",
      "Beta Ltd - Mühendis - 1900 - 1999",
    ].join("\n"),
  );

  // Neither line is a valid period; the parser must not invent dates from them.
  for (const entry of draft.experience ?? []) {
    assert.equal(entry.startDate, "");
    assert.equal(entry.endDate, "");
  }
});

test("a legitimate period still parses (no regression)", () => {
  const draft = parseResumeText(
    ["DENEYİM", "Acme Yazılım - Geliştirici - 2019 - 2023"].join("\n"),
  );

  assert.equal(draft.experience?.[0]?.startDate, "2019");
  assert.equal(draft.experience?.[0]?.endDate, "2023");
  assert.equal(draft.experience?.[0]?.organization, "Acme Yazılım");
});

test("a university named 'Doğu Akdeniz' is not filtered as a birth line", () => {
  // "doğu" (east) must not be read as the "doğum" (birth) stem.
  const draft = parseResumeText(
    ["EĞİTİM", "Doğu Akdeniz Üniversitesi - Bilgisayar Mühendisliği - 2012 - 2016"].join("\n"),
  );

  assert.equal(draft.education?.[0]?.institution, "Doğu Akdeniz Üniversitesi");
  assert.equal(draft.education?.[0]?.startDate, "2012");
  assert.equal(draft.education?.[0]?.endDate, "2016");
});
