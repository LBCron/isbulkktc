import assert from "node:assert/strict";
import test from "node:test";
import { diffRgba, type RawImage } from "../visual/support/image-diff";

/**
 * The visual layer's diff engine is the one part that decides pass/fail, so it
 * is exercised here in the fast unit gate. The browser-driven runner in
 * `tests/visual/**` is not wired into CI yet (it belongs to LANE-INFRA), but this
 * file already protects the threshold arithmetic that a regression would have to
 * get past.
 */

/** A fixed RGBA raster, built directly so the test never needs an image codec. */
function solid(
  width: number,
  height: number,
  rgba: [number, number, number, number],
): RawImage {
  const data = Buffer.alloc(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = rgba[0];
    data[i + 1] = rgba[1];
    data[i + 2] = rgba[2];
    data[i + 3] = rgba[3];
  }
  return { data, width, height, channels: 4 };
}

test("identical rasters report zero changed pixels", () => {
  const image = solid(10, 10, [12, 34, 56, 255]);
  const result = diffRgba(image, image, 0);
  assert.equal(result.diffPixels, 0);
  assert.equal(result.ratio, 0);
  assert.equal(result.totalPixels, 100);
});

test("a per-channel delta within tolerance is not counted", () => {
  const baseline = solid(10, 10, [100, 100, 100, 255]);
  const actual = solid(10, 10, [108, 100, 100, 255]);
  const result = diffRgba(actual, baseline, 12);
  assert.equal(result.diffPixels, 0, "8 < 12 must be ignored");
});

test("a per-channel delta beyond tolerance is counted", () => {
  const baseline = solid(10, 10, [100, 100, 100, 255]);
  const actual = solid(10, 10, [113, 100, 100, 255]);
  const result = diffRgba(actual, baseline, 12);
  assert.equal(result.diffPixels, 100, "13 > 12 must count every pixel");
  assert.equal(result.ratio, 1);
});

test("alpha-only differences count when they exceed tolerance", () => {
  const baseline = solid(4, 4, [0, 0, 0, 255]);
  const actual = solid(4, 4, [0, 0, 0, 200]);
  const result = diffRgba(actual, baseline, 12);
  assert.equal(result.diffPixels, 16);
});

test("the ratio is the fraction of changed pixels", () => {
  // 4x1: two pixels move, two stay.
  const baseline = solid(4, 1, [0, 0, 0, 255]);
  const actual = solid(4, 1, [0, 0, 0, 255]);
  actual.data[0] = 255; // pixel 0 red channel
  actual.data[4] = 255; // pixel 1 red channel
  const result = diffRgba(actual, baseline, 0);
  assert.equal(result.diffPixels, 2);
  assert.equal(result.ratio, 0.5);
});

test("a dimension change is a hard failure, not a small diff", () => {
  const baseline = solid(10, 10, [0, 0, 0, 255]);
  const actual = solid(10, 11, [0, 0, 0, 255]);
  assert.throws(
    () => diffRgba(actual, baseline, 12),
    /image dimensions differ: actual 10x11 vs baseline 10x10/,
  );
});
