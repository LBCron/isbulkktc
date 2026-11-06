import assert from "node:assert/strict";
import test from "node:test";

import { buildEmailHeaders, listUnsubscribeHeaders } from "./email-headers";

/**
 * The mailer sent only from/to/subject/html/text, so a reply to `no-reply@…`
 * vanished and a promotional digest carried no one-click unsubscribe — which
 * Gmail/Yahoo require (#196). These pin the header rules.
 */

test("the one-click pair is emitted for an https unsubscribe URL", () => {
  const headers = listUnsubscribeHeaders(
    "https://isbulkktc.com/tr/unsubscribe?token=abc",
    "destek@isbulkktc.com",
  );
  assert.equal(
    headers["List-Unsubscribe"],
    "<https://isbulkktc.com/tr/unsubscribe?token=abc>, <mailto:destek@isbulkktc.com?subject=unsubscribe>",
  );
  assert.equal(headers["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
});

test("a mailto fallback is omitted when no inbox is known", () => {
  const headers = listUnsubscribeHeaders("https://isbulkktc.com/u");
  assert.equal(headers["List-Unsubscribe"], "<https://isbulkktc.com/u>");
});

test("a non-https or malformed unsubscribe URL yields no header", () => {
  for (const url of ["http://isbulkktc.com/u", "not a url", "/u", "javascript:alert(1)"]) {
    assert.deepEqual(listUnsubscribeHeaders(url), {}, `${url} should not produce headers`);
  }
});

test("reply-to is set only for a mailbox-shaped value", () => {
  assert.equal(
    buildEmailHeaders({ replyToInbox: "destek@isbulkktc.com" }).replyTo,
    "destek@isbulkktc.com",
  );
  assert.equal(buildEmailHeaders({ replyToInbox: "  destek@isbulkktc.com  " }).replyTo, "destek@isbulkktc.com");
  for (const bad of ["", "   ", "not-an-email", null, undefined]) {
    assert.equal(buildEmailHeaders({ replyToInbox: bad }).replyTo, undefined, `${bad} must be dropped`);
  }
});

test("a transactional message gets reply-to but no unsubscribe header", () => {
  const extra = buildEmailHeaders({ replyToInbox: "destek@isbulkktc.com" });
  assert.equal(extra.replyTo, "destek@isbulkktc.com");
  assert.equal(extra.headers, undefined);
});

test("a promotional message gets both reply-to and the one-click pair", () => {
  const extra = buildEmailHeaders({
    replyToInbox: "destek@isbulkktc.com",
    unsubscribeUrl: "https://isbulkktc.com/unsubscribe?token=abc",
  });
  assert.equal(extra.replyTo, "destek@isbulkktc.com");
  assert.equal(extra.headers?.["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
  assert.ok(extra.headers?.["List-Unsubscribe"]?.startsWith("<https://isbulkktc.com/unsubscribe"));
});

test("nothing is emitted when neither input applies", () => {
  assert.deepEqual(buildEmailHeaders({}), {});
  assert.deepEqual(buildEmailHeaders({ replyToInbox: null, unsubscribeUrl: null }), {});
});
