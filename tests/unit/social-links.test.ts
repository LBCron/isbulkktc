import assert from "node:assert/strict";
import test from "node:test";

import {
  getSocialChannels,
  getSupportMailto,
  getWhatsAppUrl,
  SUPPORT_EMAIL,
  SUPPORT_PHONE_TEL,
} from "../../src/lib/social-links";

/**
 * The footer's support channels.
 *
 * `getSocialChannels` reads `NEXT_PUBLIC_SOCIAL_*_URL` and renders whatever the
 * operator set, so the value is operator input, not user input — but it still
 * ends up in an `<a href>`, and a value that is not `http(s)` (`javascript:`,
 * `data:`, or a bare host) must be dropped rather than rendered. The module
 * documents that contract; these tests pin it, and pin the URL shapes the
 * contact page asserts on.
 */

/** Sets the five social env vars and restores them afterwards. */
function withSocialEnv<T>(values: Record<string, string | undefined>, run: () => T): T {
  const names = [
    "NEXT_PUBLIC_SOCIAL_INSTAGRAM_URL",
    "NEXT_PUBLIC_SOCIAL_FACEBOOK_URL",
    "NEXT_PUBLIC_SOCIAL_LINKEDIN_URL",
    "NEXT_PUBLIC_SOCIAL_YOUTUBE_URL",
    "NEXT_PUBLIC_SOCIAL_X_URL",
  ];
  const previous = new Map(names.map((name) => [name, process.env[name]]));

  for (const name of names) delete process.env[name];
  for (const [name, value] of Object.entries(values)) {
    if (value !== undefined) process.env[name] = value;
  }

  try {
    return run();
  } finally {
    for (const [name, value] of previous) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

test("a channel without a configured URL is dropped, not linked to a placeholder", () => {
  const channels = withSocialEnv({}, () => getSocialChannels());
  assert.deepEqual(channels, []);
});

test("a configured https channel is rendered in the documented order", () => {
  const channels = withSocialEnv(
    {
      NEXT_PUBLIC_SOCIAL_YOUTUBE_URL: "https://youtube.com/@isbulkktc",
      NEXT_PUBLIC_SOCIAL_INSTAGRAM_URL: "https://instagram.com/isbulkktc",
      NEXT_PUBLIC_SOCIAL_X_URL: "https://x.com/isbulkktc",
    },
    () => getSocialChannels(),
  );

  assert.deepEqual(
    channels.map((channel) => channel.id),
    ["instagram", "youtube", "x"],
  );
  assert.equal(channels[0].href, "https://instagram.com/isbulkktc");
  assert.equal(channels[0].label, "Instagram");
});

test("a non-http(s) scheme is rejected rather than rendered into an href", () => {
  const channels = withSocialEnv(
    {
      NEXT_PUBLIC_SOCIAL_INSTAGRAM_URL: "javascript:alert(1)",
      NEXT_PUBLIC_SOCIAL_FACEBOOK_URL: "data:text/html,<script>alert(1)</script>",
      NEXT_PUBLIC_SOCIAL_LINKEDIN_URL: "instagram.com/isbulkktc",
    },
    () => getSocialChannels(),
  );

  assert.deepEqual(
    channels,
    [],
    "only an absolute http(s) URL may become a footer link",
  );
});

test("surrounding whitespace is trimmed before the scheme check", () => {
  const channels = withSocialEnv(
    { NEXT_PUBLIC_SOCIAL_LINKEDIN_URL: "  https://linkedin.com/company/isbulkktc  " },
    () => getSocialChannels(),
  );

  assert.equal(channels.length, 1);
  assert.equal(channels[0].href, "https://linkedin.com/company/isbulkktc");
});

test("a blank value is treated as unset", () => {
  const channels = withSocialEnv({ NEXT_PUBLIC_SOCIAL_INSTAGRAM_URL: "   " }, () =>
    getSocialChannels(),
  );
  assert.deepEqual(channels, []);
});

test("the WhatsApp link carries the dialable number", () => {
  assert.equal(getWhatsAppUrl(), `https://wa.me/${SUPPORT_PHONE_TEL.replace(/[^0-9]/g, "")}`);
  assert.equal(getWhatsAppUrl(), "https://wa.me/905391316421");
});

test("the support mailto encodes the subject and body", () => {
  assert.equal(getSupportMailto(), `mailto:${SUPPORT_EMAIL}`);
  assert.equal(getSupportMailto("Merhaba"), `mailto:${SUPPORT_EMAIL}?subject=Merhaba`);
  // `URLSearchParams` is what makes a space a `+` and `&` a `%26`; a raw
  // concatenation would let a subject with `&body=` inject a second parameter.
  assert.equal(
    getSupportMailto("Merhaba dünya", "gövde & metin"),
    "mailto:info@isbulkktc.com?subject=Merhaba+d%C3%BCnya&body=g%C3%B6vde+%26+metin",
  );
});
