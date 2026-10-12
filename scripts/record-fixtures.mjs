#!/usr/bin/env node
// Records the test fixtures from HEY's live public API. Maintainers only; never run in CI.
//
//   HEY_LIVE=1 node scripts/record-fixtures.mjs
//
// Read-only GETs on the public routes the plugin's six tools use, one at a time, at most one
// request per second, no API key. Each fixture keeps the status, a small header allowlist and the
// body, unchanged. The slug and token are taken from the newest ships so the set stays
// consistent; the chosen ones are written to test/fixtures/live/index.json.
// HEY_RECORD_REUSE=1 keeps the identifiers already in index.json.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

if (process.env.HEY_LIVE !== '1') {
  console.error('Refusing to call the live API without HEY_LIVE=1.');
  process.exit(2);
}

const BASE = 'https://heyresearch.xyz';
const OUT = join(import.meta.dirname, '..', 'test', 'fixtures', 'live');
const KEEP_HEADERS = ['content-type', 'x-request-id', 'x-hey-api-version', 'retry-after'];
const UA = 'hey-goat-plugin-fixture-recorder/0.1.0';
mkdirSync(OUT, { recursive: true });

let last = 0;
async function record(name, path, params = {}) {
  const wait = last + 1100 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  last = Date.now();
  const url = new URL(path, BASE);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const res = await fetch(url, {
    redirect: 'manual',
    headers: { accept: 'application/json', 'user-agent': UA },
  });
  const headers = {};
  for (const h of KEEP_HEADERS) {
    const v = res.headers.get(h);
    if (v !== null) headers[h] = v;
  }
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  const fixture = { request: { path, params }, response: { status: res.status, headers, body } };
  writeFileSync(join(OUT, `${name}.json`), `${JSON.stringify(fixture, null, 2)}\n`);
  console.log(`${res.status} ${url.pathname}${url.search} -> ${name}.json`);
  return body;
}

const reuse = process.env.HEY_RECORD_REUSE === '1';
const ids = reuse ? JSON.parse(readFileSync(join(OUT, 'index.json'), 'utf8')) : {};
if (!reuse) {
  const probe = await fetch(new URL('/api/ships?limit=24', BASE), {
    headers: { accept: 'application/json', 'user-agent': UA },
  }).then((r) => r.json());
  const withToken = probe.items.find((s) => s.project?.token?.contractAddress);
  if (!withToken) throw new Error('no recent ship from a project with a token');
  ids.slug = withToken.project.slug;
  ids.name = withToken.project.name;
  ids.token = withToken.project.token.contractAddress.toLowerCase();
  last = Date.now();
}

const nobody = '0x0000000000000000000000000000000000000001';
await record('research', '/api/agent/research_project', { project: ids.slug });
await record('research-not-found', '/api/agent/research_project', {
  project: 'hey-goat-no-such-project',
});
await record('changes-chain', '/api/agent/what_changed', { days: 7, limit: 5 });
await record('changes-project', '/api/agent/what_changed', {
  project: ids.slug,
  days: 30,
  limit: 5,
  building: 'only',
});
await record('ships', '/api/ships', { project: ids.slug, limit: 5 });
await record('chain', '/api/chain', { days: 3 });
await record('search', '/api/search/suggest', { q: ids.name.slice(0, 12) });
await record('search-contract', '/api/search/suggest', { q: ids.token });
await record('search-empty', '/api/search/suggest', { q: 'zqxjv-no-such-name' });
await record('verify', '/api/agent/verify_project', { address: ids.token });
await record('verify-unknown', '/api/agent/verify_project', { address: nobody });

writeFileSync(
  join(OUT, 'index.json'),
  `${JSON.stringify({ recordedAt: new Date().toISOString(), base: BASE, ...ids }, null, 2)}\n`,
);
console.log('done; review the diff and run pnpm scan before committing.');
