import { describe, expect, it } from 'vitest';

import { ATTRIBUTION_RE, callTool, fixtureFetch, liveIndex, type Call } from './helpers.js';

const { slug, token } = liveIndex();
const page = `https://heyresearch.xyz/project/${slug}`;

describe('hey_research_project', () => {
  it('answers with HEY’s sentence first, the builder state, the gaps, the evidence and the attribution', async () => {
    const calls: Call[] = [];
    const result = await callTool(
      'hey_research_project',
      { project: slug },
      fixtureFetch('research', calls),
    );
    expect(result.ok).toBe(true);
    expect(result.schema).toBe('hey.goat/v1');
    expect(result.chain).toEqual({ name: 'Robinhood Chain', chainId: 4663, caip2: 'eip155:4663' });
    const lines = result.text.split('\n');
    expect(lines[0]).toBe('Courier World ($STAMP) — HEY research on Robinhood Chain');
    expect(lines[1]).toMatch(/^HEY's answer \(DERIVED\): courier-world: activity status SHIPPING/);
    expect(result.text).toContain(
      'Activity status: SHIPPING · last meaningful ship 2026-10-12 · meaningful events in 30 days: 3',
    );
    expect(result.text).toContain('Build Momentum: 49.5 of 100');
    expect(result.text).toContain('Still Building: NOT_HELD');
    expect(result.text).toContain(`token contract ${token} (token verification VERIFIED)`);
    expect(result.text).toContain(
      'Latest meaningful change: 2026-10-12 (WEEK) · build.code_activity',
    );
    expect(result.text).toMatch(
      /- \[FACT\] market \(context only, never builder evidence\): Active market/,
    );
    expect(result.text).toContain('What HEY does not know (4) — gaps, not findings:');
    expect(result.text).toContain('- NOT_VERIFIED · projectOwner:');
    expect(result.text).toContain('Do not conclude: HEY has not measured this.');
    expect(result.text).toMatch(/Evidence ids: ship:6d9ec4f3-d4a4-468b-b6b0-f1717bb07632/);
    expect(result.text).toContain('As of 2026-10-12T19:52:23.000Z.');
    expect(lines.at(-1)).toBe(`Source: HEY Research Lab — heyresearch.xyz · ${page}`);
    expect(result.attribution).toBe(`Source: HEY Research Lab — heyresearch.xyz · ${page}`);
    expect(result.source).toMatchObject({
      url: `https://heyresearch.xyz/api/agent/research_project?project=${slug}`,
      page,
      asOf: '2026-10-12T19:52:23.000Z',
    });
    expect((result.data as { capability: string }).capability).toBe('research_project');
    // One SDK read, identified as this plugin, with no key.
    expect(calls).toHaveLength(1);
    const headers = new Headers(calls[0]?.init?.headers);
    expect(headers.get('x-hey-integration')).toBe('hey-goat-plugin/0.1.0');
    expect(headers.get('user-agent')).toMatch(/^hey-goat-plugin\/0\.1\.0 hey-research-sdk\//);
    expect(headers.get('authorization')).toBeNull();
  });
});

describe('hey_find_projects', () => {
  it('lists projects and launch records apart, with the slug and HEY link', async () => {
    const result = await callTool(
      'hey_find_projects',
      { query: 'Courier Worl' },
      fixtureFetch('search'),
    );
    expect(result.ok).toBe(true);
    expect(result.text).toContain('HEY search for "Courier Worl"');
    expect(result.text).toContain(
      `- Project: Courier World ($STAMP) · contract ${token} · Shipping · Verified Builder · slug ${slug} · ${page}`,
    );
    expect(result.text).toContain(
      '- Launch record (not a researched project page): Play Courier World',
    );
    expect(result.text).toMatch(ATTRIBUTION_RE);
    expect(result.source.page).toBeNull();
  });

  it('accepts a contract address in either case and links the one project found', async () => {
    const calls: Call[] = [];
    const result = await callTool(
      'hey_find_projects',
      { query: token.toUpperCase().replace('0X', '0x') },
      fixtureFetch('search-contract', calls),
    );
    expect(calls[0]?.url.searchParams.get('q')).toBe(token);
    expect(result.ok).toBe(true);
    expect(result.source.page).toBe(page);
    expect(result.attribution).toBe(`Source: HEY Research Lab — heyresearch.xyz · ${page}`);
  });

  it('says an empty answer is a reading of HEY’s index, never that nothing exists', async () => {
    const result = await callTool(
      'hey_find_projects',
      { query: 'zqxjv-no-such-name' },
      fixtureFetch('search-empty'),
    );
    expect(result.ok).toBe(true);
    expect(result.text).toContain(
      "That is a reading of HEY's index only, not evidence that no such project exists.",
    );
  });
});

describe('hey_what_changed', () => {
  it('reads the whole chain with the true total, the building count and each event’s project', async () => {
    const result = await callTool(
      'hey_what_changed',
      { days: 7, limit: 5 },
      fixtureFetch('changes-chain'),
    );
    expect(result.ok).toBe(true);
    expect(result.text).toMatch(/^HEY's answer \(FACT\): 6546 changes recorded/);
    expect(result.text).toContain('Total 6,546 · count as building 292 · listed 5');
    expect(result.text).toContain('By type: market.status_changed 1,986');
    expect(result.text).toMatch(
      /- 2026-10-12 \(WEEK\) · build\.code_activity · courier-world · Code changes, week of .* · counts as building: yes · verification SOURCE_LINKED · ship:/,
    );
    expect(result.text).toContain('observed by HEY 2026-10-12 · research.published');
    expect(result.text).toContain('More: https://heyresearch.xyz/api/changes');
    expect(result.attribution).toBe(
      'Source: HEY Research Lab — heyresearch.xyz · https://heyresearch.xyz/api/agent/what_changed?days=7&limit=5',
    );
  });

  it('reads one project, building only', async () => {
    const calls: Call[] = [];
    const result = await callTool(
      'hey_what_changed',
      { project: slug, days: 30, limit: 5, buildingOnly: true },
      fixtureFetch('changes-project', calls),
    );
    expect(calls[0]?.url.searchParams.get('building')).toBe('only');
    expect(result.ok).toBe(true);
    expect(result.text).toContain('3 changes that count as building recorded for courier-world');
    expect(result.text).not.toMatch(/· courier-world · Code changes/); // one project: no slug per line
    expect(result.source.page).toBe(page);
  });
});

describe('hey_project_ships', () => {
  it('lists ships newest first with precision, verification, evidence id and source', async () => {
    const result = await callTool(
      'hey_project_ships',
      { project: slug, limit: 5 },
      fixtureFetch('ships'),
    );
    expect(result.ok).toBe(true);
    expect(result.text).toContain(
      `HEY's ship record for ${slug}: 3 ships in total; listing the newest 3.`,
    );
    expect(result.text).toContain(
      `Project: Courier World ($STAMP) · activity status SHIPPING · last shipped 2026-10-12 · ${page}`,
    );
    expect(result.text).toMatch(
      /- 2026-10-12 \(WEEK\) · CODE_ACTIVITY · Code changes, week of .* · verification SOURCE_LINKED · ship:6d9ec4f3-d4a4-468b-b6b0-f1717bb07632 · source https:\/\/github\.com\/builder-one\/courierworld/,
    );
    expect(result.source.page).toBe(page);
    expect(result.text.split('\n').at(-1)).toBe(
      `Source: HEY Research Lab — heyresearch.xyz · ${page}`,
    );
    expect(result.text).toMatch(/As of .* \(the time of this read\)\./);
  });
});

describe('hey_chain_overview', () => {
  it('prints each day’s counts, marks today partial and labels DEX volume as market context', async () => {
    const result = await callTool('hey_chain_overview', { days: 3 }, fixtureFetch('chain'));
    expect(result.ok).toBe(true);
    expect(result.text).toContain(
      'Robinhood Chain day by day (UTC), 3 days; aggregate counts only',
    );
    expect(result.text).toContain('2026-10-12 is today and partial. Last full day: 2026-10-11.');
    expect(result.text).toContain(
      '- 2026-10-11 · ships 60 · builders shipping 51 · projects published 53 · Verified Builders recorded 17 · token launches 27,810',
    );
    expect(result.text).toMatch(/- 2026-10-12 \(partial\) · ships 43/);
    expect(result.text).toContain('DEX volume $699.0M (market context)');
    expect(result.text).toContain('Volume note: dexVolumeUsd counts trades against USDG');
  });
});

describe('hey_lookup_contract', () => {
  it('names the recorded project and the attribution verdict', async () => {
    const result = await callTool(
      'hey_lookup_contract',
      { address: token },
      fixtureFetch('verify'),
    );
    expect(result.ok).toBe(true);
    expect(result.text).toMatch(
      /^HEY's answer \(FACT\): VERIFIED: the project "courier-world" itself names/,
    );
    expect(result.text).toContain(
      `Contract ${token} on Robinhood Chain (4663) · attribution verdict VERIFIED (token_deploy_record_in_own_repo)`,
    );
    expect(result.text).toContain(`Recorded project: ${slug} (role token) · ${page}`);
    expect(result.text).toContain('Token verification: VERIFIED (deploy_record_in_own_repo)');
    expect(result.source.page).toBe(page);
  });
});
