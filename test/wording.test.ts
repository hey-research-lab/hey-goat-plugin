import { describe, expect, it } from 'vitest';
import type { ZodTypeAny } from 'zod';

import type { HeyToolResult } from '../src/index.js';
import { ATTRIBUTION_RE, callTool, fixtureFetch, heyTools, liveIndex, noFetch } from './helpers.js';

const { slug, token } = liveIndex();

/**
 * HEY's forbidden output words (ecosystem conventions §1): no verdicts, no trading language, no
 * hype, no people behind addresses, no claimed affiliation. Matched as whole words, so HEY's own
 * machine codes such as `buy_or_sell_signal` or `safety_verdict` (which say what HEY never
 * provides) do not trip it.
 */
const FORBIDDEN =
  /\b(rugs?|rugged|scams?|safe|unsafe|bullish|bearish|buy|buying|sell|selling|100x|alpha|undervalued|guaranteed|smart money|whales?|dev wallet|users|partnerships?|audited|official robinhood)\b/i;

const RUNS: [string, Record<string, unknown>, string][] = [
  ['hey_research_project', { project: slug }, 'research'],
  ['hey_research_project', { project: 'hey-goat-no-such-project' }, 'research-not-found'],
  ['hey_find_projects', { query: 'Courier Worl' }, 'search'],
  ['hey_find_projects', { query: token }, 'search-contract'],
  ['hey_find_projects', { query: 'zqxjv-no-such-name' }, 'search-empty'],
  ['hey_what_changed', { days: 7, limit: 5 }, 'changes-chain'],
  [
    'hey_what_changed',
    { project: slug, days: 30, limit: 5, buildingOnly: true },
    'changes-project',
  ],
  ['hey_project_ships', { project: slug, limit: 5 }, 'ships'],
  ['hey_chain_overview', { days: 3 }, 'chain'],
  ['hey_lookup_contract', { address: token }, 'verify'],
  [
    'hey_lookup_contract',
    { address: '0x0000000000000000000000000000000000000001' },
    'verify-unknown',
  ],
  ['hey_research_project', { project: slug }, 'synthetic/rate-limited'],
  ['hey_chain_overview', {}, 'synthetic/internal-error'],
];

async function everyResult(): Promise<HeyToolResult[]> {
  const results: HeyToolResult[] = [];
  for (const [tool, args, fixture] of RUNS) {
    results.push(await callTool(tool, args, fixtureFetch(fixture)));
  }
  results.push(await callTool('hey_research_project', { project: slug, chainId: 1 }, noFetch));
  results.push(await callTool('hey_lookup_contract', { address: 'nope' }, noFetch));
  return results;
}

/** Every string in a value, keys included. */
function strings(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) for (const v of value) strings(v, out);
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      out.push(k);
      strings(v, out);
    }
  }
  return out;
}

function describeSchema(schema: ZodTypeAny, out: string[] = []): string[] {
  if (schema.description) out.push(schema.description);
  const def = schema._def as { shape?: () => Record<string, ZodTypeAny>; innerType?: ZodTypeAny };
  if (typeof def.shape === 'function')
    for (const s of Object.values(def.shape())) describeSchema(s, out);
  if (def.innerType) describeSchema(def.innerType, out);
  return out;
}

describe('wording', () => {
  it('no forbidden word in any output string, rendered or relayed', async () => {
    const offending: string[] = [];
    for (const result of await everyResult()) {
      for (const s of strings(result)) {
        if (FORBIDDEN.test(s)) offending.push(`${result.tool}: ${s.slice(0, 160)}`);
      }
    }
    expect(offending).toEqual([]);
  });

  it('no forbidden word in a tool name, description or parameter description', async () => {
    const tools = await heyTools({ fetchImpl: noFetch });
    const texts: string[] = [];
    for (const tool of tools.values()) {
      texts.push(tool.name, tool.description, ...describeSchema(tool.parameters as ZodTypeAny));
    }
    expect(texts.length).toBeGreaterThan(12);
    expect(texts.filter((t) => FORBIDDEN.test(t))).toEqual([]);
  });

  it('every answer — success, gap or failure — ends with the attribution line', async () => {
    for (const result of await everyResult()) {
      const last = result.text.split('\n').at(-1) ?? '';
      expect(last).toMatch(ATTRIBUTION_RE);
      expect(last).toBe(result.attribution);
      expect(result.attribution.startsWith('Source: HEY Research Lab — heyresearch.xyz')).toBe(
        true,
      );
    }
  });

  it('every successful answer carries an as-of time and a HEY link', async () => {
    for (const result of await everyResult()) {
      if (!result.ok) continue;
      expect(result.source.asOf).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(result.text).toContain(`As of ${result.source.asOf}`);
      expect(result.attribution).toMatch(/ · https:\/\/heyresearch\.xyz\//);
    }
  });

  it('the descriptions say what an agent needs to pick the tool', async () => {
    const tools = await heyTools({ fetchImpl: noFetch });
    for (const tool of tools.values()) expect(tool.description).toContain('Robinhood Chain');
    expect(tools.get('hey_research_project')?.description).toMatch(/still building/);
    expect(tools.get('hey_research_project')?.description).toMatch(
      /not price advice and not a safety verdict/,
    );
    expect(tools.get('hey_find_projects')?.description).toMatch(/ticker/);
    expect(tools.get('hey_find_projects')?.description).toMatch(/contract address/);
    expect(tools.get('hey_project_ships')?.description).toMatch(/last ship/);
    expect(tools.get('hey_what_changed')?.description).toMatch(/evidence id/);
  });
});
