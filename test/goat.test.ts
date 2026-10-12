import { readFileSync } from 'node:fs';

import { getOnChainTools } from '@goat-sdk/adapter-vercel-ai';
import { getTools, PluginBase } from '@goat-sdk/core';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  heyResearch,
  HeyResearchPlugin,
  PLUGIN_VERSION,
  TOOL_NAMES,
  type HeyToolResult,
} from '../src/index.js';
import { fixtureFetch, liveIndex, noFetch, ReadOnlyWallet, type Call } from './helpers.js';

const { slug } = liveIndex();

describe('the GOAT plugin', () => {
  it('is a PluginBase named hey-research with six tools, in order', async () => {
    const plugin = heyResearch();
    expect(plugin).toBeInstanceOf(PluginBase);
    expect(plugin).toBeInstanceOf(HeyResearchPlugin);
    expect(plugin.name).toBe('hey-research');
    const tools = await plugin.getTools(new ReadOnlyWallet());
    expect(tools.map((t) => t.name)).toEqual([...TOOL_NAMES]);
    for (const tool of tools) {
      expect(tool.description.length).toBeGreaterThan(200);
      expect(typeof tool.parameters.parse).toBe('function');
    }
  });

  it('is chain-agnostic in GOAT’s sense: any wallet chain, Robinhood Chain included', () => {
    const plugin = heyResearch();
    const native = { name: 'Ether', symbol: 'ETH', decimals: 18 };
    expect(plugin.supportsChain({ type: 'evm', id: 4663, nativeCurrency: native })).toBe(true);
    expect(plugin.supportsChain({ type: 'evm', id: 1, nativeCurrency: native })).toBe(true);
    expect(plugin.supportsChain({ type: 'solana', nativeCurrency: native })).toBe(true);
    expect(plugin.supportsChain({ type: 'aptos' })).toBe(true);
  });

  it('works through GOAT’s getTools beside the wallet’s core tools, without touching the wallet', async () => {
    const wallet = new ReadOnlyWallet();
    const tools = await getTools({ wallet, plugins: [heyResearch({ fetchImpl: noFetch })] });
    const names = tools.map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining(['get_address', ...TOOL_NAMES]));
  });

  it('works through the Vercel AI adapter (getOnChainTools), as the README shows', async () => {
    const calls: Call[] = [];
    const tools = await getOnChainTools({
      wallet: new ReadOnlyWallet(),
      plugins: [heyResearch({ fetchImpl: fixtureFetch('research', calls) })],
    });
    const research = tools.hey_research_project;
    expect(research).toBeDefined();
    expect((research as { description?: string } | undefined)?.description).toContain(
      'Robinhood Chain',
    );
    const result = (await research?.execute?.(
      { project: slug },
      { messages: [] },
    )) as HeyToolResult;
    expect(result.ok).toBe(true);
    expect(result.text).toContain('HEY research on Robinhood Chain');
    expect(calls).toHaveLength(1);
  });

  it('the zod schemas carry the API’s bounds', async () => {
    const tools = await heyResearch().getTools(new ReadOnlyWallet());
    const byName = new Map(tools.map((t) => [t.name, t]));
    expect(byName.get('hey_what_changed')?.parameters.safeParse({ days: 31 }).success).toBe(false);
    expect(byName.get('hey_what_changed')?.parameters.safeParse({ days: 30 }).success).toBe(true);
    expect(
      byName.get('hey_project_ships')?.parameters.safeParse({ project: slug, limit: 49 }).success,
    ).toBe(false);
    expect(byName.get('hey_find_projects')?.parameters.safeParse({ query: 'a' }).success).toBe(
      false,
    );
    expect(byName.get('hey_chain_overview')?.parameters.safeParse({}).success).toBe(true);
  });
});

describe('options', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('sends an explicit key as a bearer token', async () => {
    const calls: Call[] = [];
    const tools = await heyResearch({
      apiKey: 'test-key-not-real',
      fetchImpl: fixtureFetch('chain', calls),
    }).getTools(new ReadOnlyWallet());
    await tools.find((t) => t.name === 'hey_chain_overview')?.execute({ days: 3 });
    expect(new Headers(calls[0]?.init?.headers).get('authorization')).toBe(
      'Bearer test-key-not-real',
    );
  });

  it('reads HEY_API_KEY from the environment for HEY’s own origin only', async () => {
    vi.stubEnv('HEY_API_KEY', 'env-key-not-real');
    const own: Call[] = [];
    const ownTools = await heyResearch({ fetchImpl: fixtureFetch('chain', own) }).getTools(
      new ReadOnlyWallet(),
    );
    await ownTools.find((t) => t.name === 'hey_chain_overview')?.execute({ days: 3 });
    expect(new Headers(own[0]?.init?.headers).get('authorization')).toBe('Bearer env-key-not-real');

    const local: Call[] = [];
    const localFetch = fixtureFetch('chain', local);
    const localTools = await heyResearch({
      baseUrl: 'http://localhost:3000',
      fetchImpl: async (input, init) =>
        localFetch(input.replace('http://localhost:3000', 'https://heyresearch.xyz'), init),
    }).getTools(new ReadOnlyWallet());
    const result = (await localTools
      .find((t) => t.name === 'hey_chain_overview')
      ?.execute({ days: 3 })) as HeyToolResult;
    expect(result.ok).toBe(true);
    expect(result.source.url).toBe('http://localhost:3000/api/chain?days=3');
    expect(new Headers(local[0]?.init?.headers).get('authorization')).toBeNull();
  });

  it('refuses a baseUrl that is not an https origin or loopback http', () => {
    expect(() => heyResearch({ baseUrl: 'http://example.com' })).toThrow(/https: origin/);
    expect(() => heyResearch({ baseUrl: 'https://example.com/api' })).toThrow(/no path/);
    expect(() => heyResearch({ baseUrl: 'https://user:pw@example.com' })).toThrow(/credentials/);
    expect(() => heyResearch({ baseUrl: 'not a url' })).toThrow(/not a URL/);
    expect(() => heyResearch({ baseUrl: 'https://example.com' })).not.toThrow();
  });

  it('includeData: false leaves only the text for the model', async () => {
    const tools = await heyResearch({
      includeData: false,
      fetchImpl: fixtureFetch('chain'),
    }).getTools(new ReadOnlyWallet());
    const result = (await tools
      .find((t) => t.name === 'hey_chain_overview')
      ?.execute({ days: 3 })) as HeyToolResult;
    expect(result.ok).toBe(true);
    expect(result.data).toBeNull();
    expect(result.text).toContain('Robinhood Chain day by day');
  });

  it('the version in the code is the package version', () => {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
      version: string;
    };
    expect(PLUGIN_VERSION).toBe(pkg.version);
  });
});
