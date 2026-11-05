#!/usr/bin/env node
/**
 * Approve workflow runs that GitHub is holding.
 *
 * A pull request opened by a bot can leave its checks stuck at
 * `action_required`: GitHub waits for a human to approve the run before it
 * starts. Nothing tells you — the PR simply shows BLOCKED forever and the lane
 * that opened it looks idle. That is how #178 sat with no CI at all.
 *
 * This approves those runs. It only approves; it never re-runs a failure, so a
 * genuinely red check stays red and visible.
 *
 * Usage: node scripts/approve-pending-runs.mjs [--dry-run]
 */

import { execFileSync } from 'node:child_process';

const REPO = 'cenkmenk71-max/isbulkktc';
const dryRun = process.argv.includes('--dry-run');

function gh(args) {
  return execFileSync('gh', args, {
    encoding: 'utf8',
    env: {
      ...process.env,
      GH_TOKEN:
        process.env.GITHUB_PERSONAL_ACCESS_TOKEN ?? process.env.GH_TOKEN,
    },
  }).trim();
}

const raw = gh([
  'api',
  `repos/${REPO}/actions/runs?status=action_required&per_page=50`,
  '--jq',
  '.workflow_runs[] | "\\(.id)\\t\\(.name)\\t\\(.head_branch)"',
]);

if (!raw) {
  console.log('no runs are waiting for approval');
  process.exit(0);
}

const rows = raw
  .split('\n')
  .filter(Boolean)
  .map((line) => {
    const [id, name, branch] = line.split('\t');
    return { id, name, branch };
  });

console.log(`${rows.length} run(s) waiting for approval`);
let approved = 0;
for (const run of rows) {
  if (dryRun) {
    console.log(`  would approve ${run.id} ${run.name} (${run.branch})`);
    continue;
  }
  try {
    gh(['api', '-X', 'POST', `repos/${REPO}/actions/runs/${run.id}/approve`]);
    approved += 1;
    console.log(`  approved ${run.id} ${run.name} (${run.branch})`);
  } catch (error) {
    console.error(
      `  could not approve ${run.id}: ${String(error.message).split('\n')[0]}`,
    );
  }
}

if (!dryRun) console.log(`approved ${approved}/${rows.length}`);
