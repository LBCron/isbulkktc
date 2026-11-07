import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import test from "node:test";

/**
 * Server-side cookie write inventory and flag ratchet (issue #418 §6 — the
 * owner's top priority: "hesapla yapılacak bütün işlemlerin ve çerezle ilgili
 * her şeyin mükemmel olması").
 *
 * `cookie-inventory.test.ts` ratchets the **client** writers (`document.cookie`)
 * and `session-cookie-flags.test.ts` pins the flags of the *known* Supabase
 * call sites. Neither one enumerates the **server** write sites
 * (`cookies().set(…)`, `response.cookies.set(…)`, `cookieStore.set(…)`): a new
 * server cookie — or a new write added to a known file — could ship with no
 * `HttpOnly`/`Secure`/`SameSite` at all and no test would notice, because the
 * only thing standing between it and the response is the options object passed
 * to the setter. That is the gap this file closes.
 *
 * The inventory (each write, and why its flags are correct):
 *
 * | Site | Cookie | Flags |
 * |---|---|---|
 * | `src/proxy.ts` `sessionResponse.cookies.set(name, value, options)` | `sb-*` session (refreshed in middleware) | inherits the shared `cookieOptions` below |
 * | `src/proxy.ts` `response.cookies.set(cookie)` | `sb-*` (propagated onto the outbound response) | already carries `options` on the copied object |
 * | `src/server/db/supabase-server.ts` `cookieStore.set(name, value, cookieOptions)` | `sb-*` (server client, Route Handler / Server Action) | shared `cookieOptions` |
 * | `src/features/identity/actions.ts` `cookieStore.set(oauthSignupIntentCookieName, …, { … })` | `ib_oauth_signup_intent` | HttpOnly, Secure (prod), SameSite=Lax — pinned by `session-cookie-flags.test.ts` |
 *
 * The two `sb-*` sites pass an `options`/`cookieOptions` **identifier**, not an
 * inline literal, so they inherit the single hardened `cookieOptions` object
 * (`path:/`, `sameSite:lax`, `httpOnly:true`, `secure` in production) declared
 * next to the client. A hardcoded literal here would fork the flags; the
 * `the sb-* writes take their flags from the shared options object` test below
 * makes that a failure rather than a silent divergence.
 */

const srcDir = new URL("../../src/", import.meta.url);

function walk(directory: URL): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory)) {
    const path = new URL(entry, directory);
    if (statSync(path).isDirectory()) files.push(...walk(new URL(`${entry}/`, directory)));
    else if (/\.(ts|tsx)$/.test(entry)) files.push(path.pathname);
  }
  return files;
}

/** Source files only — a cookie write inside a test is not a shipped write. */
const sourceFiles = walk(srcDir).filter((path) => !/\.test\.tsx?$/.test(path));

function relative(path: string): string {
  return path.slice(path.indexOf("/src/") + 1);
}

function read(path: string): string {
  return readFileSync(path, "utf8");
}

type WriteSite = {
  /** `set` writes a cookie; `delete` only expires one. */
  kind: "set" | "delete";
  /** The variable or constant the setter is called on (`cookieStore`, `response`, …). */
  receiver: string;
  /** The first argument, normalised to a single token. */
  firstArg: string;
  /** Top-level argument count of the call. */
  argCount: number;
  /** The third argument when there is one, normalised. */
  thirdArg: string | null;
};

/** Reads a balanced `(…)` group starting just after the opening paren. */
function readArguments(source: string, openIndex: number): { args: string[]; end: number } {
  const args: string[] = [];
  let depth = 1;
  let current = "";
  let index = openIndex;
  while (index < source.length && depth > 0) {
    const char = source[index];
    if (char === "(" || char === "{" || char === "[") depth += 1;
    else if (char === ")" || char === "}" || char === "]") {
      depth -= 1;
      if (depth === 0) break;
    }
    if (char === "," && depth === 1) {
      args.push(current.trim());
      current = "";
    } else {
      current += char;
    }
    index += 1;
  }
  if (current.trim().length > 0) args.push(current.trim());
  return { args, end: index };
}

/** The leading identifier of an argument expression, or its first character. */
function firstToken(expression: string): string {
  return (expression.match(/^[\w$]+(?:\.[\w$]+)*/) ?? [expression.slice(0, 1)])[0];
}

/** The argument as an identifier, or `null` when it is an inline literal. */
function asIdentifier(expression: string | undefined): string | null {
  if (expression === undefined) return null;
  const token = firstToken(expression);
  return /^[A-Za-z_$][\w$]*$/.test(token) ? token : null;
}

/** The leading identifier, or the literal as written (capped) — a stable label. */
function argumentLabel(expression: string): string {
  const trimmed = expression.trim();
  const identifier = trimmed.match(/^[A-Za-z_$][\w$]*/);
  return identifier ? identifier[0] : trimmed.slice(0, 32);
}

/**
 * The names bound to a `cookies()` store in this source — `const cookieStore =
 * await cookies()`, `const jar = (await import("next/headers")).cookies()`, …
 * A write through any of these is a server cookie write regardless of what the
 * author named the variable.
 */
function cookieStoreReceivers(source: string): Set<string> {
  const receivers = new Set<string>();
  for (const match of source.matchAll(
    /(?:const|let|var)\s+(\w+)\s*=\s*[^\n;]*\bcookies\s*\(\s*\)/g,
  )) {
    receivers.add(match[1]);
  }
  return receivers;
}

/**
 * Every server cookie write in one source. Reads (`cookies().get`) are not
 * writes; the inbound `request.cookies.set` (which makes a *refreshed* token
 * visible to the rest of the request) is not a response cookie either, so the
 * `request` receiver is excluded — the response cookie is written separately
 * from the returned object.
 *
 * Three shapes are covered: `X.cookies.set/delete(…)` (a `NextResponse`), the
 * bare `cookies().set/delete(…)`, `<store>.set/delete(…)` where `<store>` is
 * any variable bound to `cookies()` in the same file, and the inline
 * `(await cookies()).set/delete(…)`. Tracking the bound name — rather than
 * hardcoding `cookieStore` — is what makes the ratchet survive a rename; the
 * inline form is a separate branch because there is no bound name to track.
 */
function serverCookieWrites(source: string): WriteSite[] {
  const receivers = cookieStoreReceivers(source);
  const sites: WriteSite[] = [];
  const re =
    /\(\s*await\s+cookies\s*\(\s*\)\s*\)\s*\.\s*(set|delete)\s*\(|\b(\w+)\s*\.\s*cookies\s*\.\s*(set|delete)\s*\(|\bcookies\s*\(\s*\)\s*\.\s*(set|delete)\s*\(|\b(\w+)\s*\.\s*(set|delete)\s*\(/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source)) !== null) {
    let receiver: string;
    let kind: "set" | "delete";
    if (match[1] !== undefined) {
      receiver = "cookies()";
      kind = match[1] as "set" | "delete";
    } else if (match[2] !== undefined) {
      receiver = match[2];
      kind = match[3] as "set" | "delete";
    } else if (match[4] !== undefined) {
      receiver = "cookies()";
      kind = match[4] as "set" | "delete";
    } else {
      receiver = match[5];
      kind = match[6] as "set" | "delete";
      if (!receivers.has(receiver)) continue;
    }
    if (receiver === "request") continue;
    const { args } = readArguments(source, re.lastIndex);
    sites.push({
      kind,
      receiver,
      firstArg: args[0] ? argumentLabel(args[0]) : "",
      argCount: args.length,
      thirdArg: asIdentifier(args[2]),
    });
  }
  return sites;
}

/** `file:firstArg` for every `set` write across `src/**`, sorted. */
function cookieWriteInventory(): string[] {
  const entries: string[] = [];
  for (const path of sourceFiles) {
    for (const site of serverCookieWrites(read(path))) {
      if (site.kind === "set") entries.push(`${relative(path)}:${site.firstArg}`);
    }
  }
  return entries.sort();
}

// ---------------------------------------------------------------------------
// 1. Inventory ratchet: every server `set` write is on the documented list.
//    A new cookie — or a new write added to a known file — is a review, not a
//    miss.
// ---------------------------------------------------------------------------

test("every server cookie write site is on the audited inventory", () => {
  assert.deepEqual(
    cookieWriteInventory(),
    [
      "src/features/identity/actions.ts:oauthSignupIntentCookieName",
      "src/proxy.ts:cookie",
      "src/proxy.ts:name",
      "src/server/db/supabase-server.ts:name",
    ],
    "a server cookie was added or removed without updating the §6 inventory in this file",
  );
});

// ---------------------------------------------------------------------------
// 2. The flag rule: no server write may ship without an options object. A
//    bare `cookies.set(name, value)` would take the runtime default (no
//    HttpOnly, no Secure, no SameSite) and silently downgrade the cookie.
// ---------------------------------------------------------------------------

test("every server cookie write passes an options object (no bare two-arg write)", () => {
  const offenders: string[] = [];
  for (const path of sourceFiles) {
    for (const site of serverCookieWrites(read(path))) {
      if (site.kind !== "set") continue;
      // `response.cookies.set(cookie)` copies a `@supabase/ssr` cookie that
      // already carries its options; it is the only one-argument form allowed.
      const isPropagation = site.argCount === 1 && site.firstArg === "cookie";
      if (!isPropagation && site.argCount < 3) {
        offenders.push(`${relative(path)} ${site.receiver}.cookies.set(${site.firstArg}, …)`);
      }
    }
  }
  assert.deepEqual(offenders, [], `server cookies written without flags:\n${offenders.join("\n")}`);
});

test("the sb-* writes take their flags from the shared options object", () => {
  const offenders: string[] = [];
  for (const path of sourceFiles) {
    for (const site of serverCookieWrites(read(path))) {
      if (site.kind !== "set" || site.firstArg !== "name") continue;
      // A `name` write is a `sb-*` cookie written from `@supabase/ssr`'s
      // `setAll`. It must forward the shared `options`/`cookieOptions`
      // identifier, not an inline literal, so the hardened flags cannot fork.
      if (site.thirdArg !== "options" && site.thirdArg !== "cookieOptions") {
        offenders.push(
          `${relative(path)} ${site.receiver}.cookies.set(name, value, ${site.thirdArg ?? "<none>"})`,
        );
      }
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `an sb-* cookie no longer inherits the shared options object:\n${offenders.join("\n")}`,
  );
});

// ---------------------------------------------------------------------------
// 3. Self-tests: the detectors are only as wide as their matchers.
// ---------------------------------------------------------------------------

test("the write detector sees a setter but not a getter (self-test)", () => {
  assert.deepEqual(
    serverCookieWrites(
      "const cookieStore = await cookies();\ncookieStore.set(name, value, cookieOptions);",
    ).map((s) => [s.kind, s.firstArg, s.thirdArg]),
    [["set", "name", "cookieOptions"]],
  );
  assert.deepEqual(serverCookieWrites("cookieStore.get('x');"), []);
  assert.deepEqual(serverCookieWrites("const all = cookies().getAll();"), []);
});

test("the write detector reads a multiline options object (self-test)", () => {
  const source = [
    "const cookieStore = await cookies();",
    "cookieStore.set(",
    "  oauthSignupIntentCookieName,",
    "  createOAuthSignupIntent(locale),",
    "  {",
    "    httpOnly: true,",
    "    secure: process.env.NODE_ENV === 'production',",
    "  },",
    ");",
  ].join("\n");
  const [site] = serverCookieWrites(source);
  assert.equal(site.firstArg, "oauthSignupIntentCookieName");
  assert.equal(site.argCount, 3);
  assert.equal(site.thirdArg, null, "the inline object literal is not an identifier");
});

test("the write detector ignores the inbound request cookie (self-test)", () => {
  assert.deepEqual(serverCookieWrites("request.cookies.set(name, value);"), []);
  assert.deepEqual(serverCookieWrites("request.cookies.delete(name);"), []);
});

test("the write detector follows the store whatever it is named (self-test)", () => {
  const source = [
    "const jar = await cookies();",
    "jar.set('ib_evil', '1');",
    "const other = {};",
    "other.set('not-a-cookie', '1');",
  ].join("\n");
  const sites = serverCookieWrites(source);
  assert.deepEqual(
    sites.map((site) => [site.receiver, site.firstArg]),
    [["jar", "'ib_evil'"]],
    "a renamed cookies() store must still be inventoried, and a non-store .set must not",
  );
});

test("the write detector sees the inline await cookies() store (self-test)", () => {
  const sites = serverCookieWrites("(await cookies()).set('ib_evil', '1');");
  assert.deepEqual(
    sites.map((site) => [site.receiver, site.firstArg, site.argCount]),
    [["cookies()", "'ib_evil'", 2]],
    "an inline (await cookies()).set write has no bound name, so it needs its own branch",
  );
  assert.deepEqual(serverCookieWrites("(await cookies()).delete('ib');"), [
    { kind: "delete", receiver: "cookies()", firstArg: "'ib'", argCount: 1, thirdArg: null },
  ]);
});
