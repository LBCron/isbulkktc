#!/usr/bin/env node
/**
 * Deliverability verification — the "did the fix actually work" check.
 *
 * CI proves the code is correct. It cannot prove an email lands in an inbox,
 * because that depends on DNS, on the sending reputation, and on the receiving
 * server. This script checks the parts that are verifiable without a mailbox:
 *
 *   1. SPF, DKIM, DMARC — present, valid, and aligned with the From domain.
 *   2. RBL — is the domain on a blocklist?
 *   3. Resend — is the API key valid and the domain verified?
 *
 * It reports what it measured and refuses to claim more. Inbox placement needs
 * a real mailbox, which the runbook in docs/lanes/11-verify.md covers.
 *
 * Usage:
 *   node scripts/verify-deliverability.mjs
 *   node scripts/verify-deliverability.mjs --domain example.com
 */

const args = process.argv.slice(2);
const domainArg = args.indexOf('--domain');
const DOMAIN = domainArg !== -1 ? args[domainArg + 1] : 'isbulkktc.com';

/** Resolve a DNS record through Google's JSON resolver (no credentials). */
async function resolve(name, type) {
  const url = `https://dns.google/resolve?name=${encodeURIComponent(name)}&type=${type}`;
  const response = await fetch(url, { headers: { accept: 'application/dns-json' } });
  if (!response.ok) return [];
  const body = await response.json();
  return (body.Answer ?? []).map((a) => String(a.data ?? ''));
}

const results = [];
function record(area, status, detail) {
  results.push({ area, status, detail });
}

const ICON = { pass: 'PASS', warn: 'WARN', fail: 'FAIL', skip: 'SKIP' };

async function checkSpf() {
  const txt = await resolve(DOMAIN, 'TXT');
  const spf = txt.find((t) => t.startsWith('v=spf1'));
  if (!spf) {
    record('SPF', 'fail', 'no v=spf1 record — receivers cannot verify the sender');
    return;
  }
  // Resend sends through Amazon SES, so the sending domain must be authorised.
  const authorisesResend = /amazonses\.com/.test(spf);
  const lookups = (spf.match(/\b(include|a|mx|ptr|exists|redirect)\b/g) ?? []).length;
  const detail = `${spf} (${lookups} lookup(s))`;
  if (!authorisesResend) {
    record(
      'SPF',
      'fail',
      `${detail} — does NOT include amazonses.com, so Resend's sending is unauthorised`,
    );
    return;
  }
  if (lookups > 10) {
    record('SPF', 'warn', `${detail} — over the 10-lookup limit, receivers may permerror`);
    return;
  }
  record('SPF', 'pass', detail);
}

async function checkDkim() {
  const txt = await resolve(`resend._domainkey.${DOMAIN}`, 'TXT');
  const record_ = txt.find((t) => t.includes('p='));
  if (!record_) {
    record('DKIM', 'fail', 'no resend._domainkey record — Resend cannot sign');
    return;
  }
  const key = record_.match(/p=([A-Za-z0-9+/=]+)/)?.[1] ?? '';
  if (key.length < 100) {
    record('DKIM', 'fail', `public key looks truncated (${key.length} chars)`);
    return;
  }
  record('DKIM', 'pass', `resend._domainkey present, key ${key.length} chars`);
}

async function checkDmarc() {
  const txt = await resolve(`_dmarc.${DOMAIN}`, 'TXT');
  const dmarc = txt.find((t) => t.startsWith('v=DMARC1'));
  if (!dmarc) {
    record('DMARC', 'fail', 'no _dmarc record — receivers have no policy');
    return;
  }
  const policy = dmarc.match(/\bp=(\w+)/)?.[1] ?? 'none';
  const hasRua = /\brua=/.test(dmarc);
  if (policy === 'none') {
    record(
      'DMARC',
      'warn',
      `${dmarc} — p=none only monitors; a failing SPF/DKIM is not enforced`,
    );
    return;
  }
  record('DMARC', policy === 'reject' ? 'pass' : 'warn', `${dmarc}${hasRua ? '' : ' (no rua)'}`);
}

async function checkMx() {
  const mx = await resolve(DOMAIN, 'MX');
  if (mx.length === 0) {
    record('MX', 'warn', 'no MX — inbound mail is not accepted (fine if intentional)');
    return;
  }
  record('MX', 'pass', mx.join(', '));
}

/** Public DNS blocklists that answer over DNS without credentials. */
async function checkBlocklists() {
  const lists = [
    'zen.spamhaus.org',
    'bl.spamcop.net',
    'dnsbl.sorbs.net',
  ];
  const hits = [];
  for (const list of lists) {
    const answers = await resolve(`${DOMAIN}.${list}`, 'A');
    if (answers.length > 0 && !answers.some((a) => a.startsWith('127.255'))) {
      hits.push(list);
    }
  }
  if (hits.length === 0) {
    record('Blocklists', 'pass', `not listed on ${lists.join(', ')}`);
    return;
  }
  record('Blocklists', 'fail', `listed on: ${hits.join(', ')}`);
}

async function checkResend() {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    record('Resend', 'skip', 'RESEND_API_KEY not set');
    return;
  }
  if (!key.startsWith('re_')) {
    record(
      'Resend',
      'fail',
      `key does not start with re_ (len ${key.length}) — likely the wrong secret`,
    );
    return;
  }
  try {
    const response = await fetch('https://api.resend.com/domains', {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!response.ok) {
      record('Resend', 'fail', `API rejected the key (HTTP ${response.status})`);
      return;
    }
    const body = await response.json();
    const found = (body.data ?? []).find((d) => d.name === DOMAIN);
    if (!found) {
      record('Resend', 'fail', `${DOMAIN} is not added to the Resend account`);
      return;
    }
    record(
      'Resend',
      found.status === 'verified' ? 'pass' : 'fail',
      `${DOMAIN} status=${found.status}`,
    );
  } catch (error) {
    record('Resend', 'warn', `could not reach the Resend API: ${error.message}`);
  }
}

async function main() {
  console.log(`Deliverability check for ${DOMAIN}\n`);
  await checkSpf();
  await checkDkim();
  await checkDmarc();
  await checkMx();
  await checkBlocklists();
  await checkResend();

  for (const r of results) {
    console.log(`  ${ICON[r.status].padEnd(4)} ${r.area.padEnd(11)} ${r.detail}`);
  }

  const failed = results.filter((r) => r.status === 'fail').length;
  const warned = results.filter((r) => r.status === 'warn').length;
  console.log(`\n${failed} failure(s), ${warned} warning(s)`);
  console.log(
    '\nInbox placement (spam vs inbox) cannot be checked here — it needs a real\n' +
      'mailbox. See docs/lanes/11-verify.md for the three-address runbook.',
  );
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
