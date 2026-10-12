import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  WalletClientBase,
  type Balance,
  type Chain,
  type Signature,
  type ToolBase,
} from '@goat-sdk/core';
import type { FetchLike } from '@hey-research-lab/sdk';

import { heyResearch, type HeyResearchOptions, type HeyToolResult } from '../src/index.js';

export type Fixture = {
  request: { path: string; params: Record<string, string | number> };
  response: { status: number; headers: Record<string, string>; body: unknown };
};

const FIXTURES = join(import.meta.dirname, 'fixtures');

/** `research` reads test/fixtures/live/research.json; `synthetic/x` reads the synthetic set. */
export function loadFixture(name: string): Fixture {
  const path = name.startsWith('synthetic/') ? `${name}.json` : `live/${name}.json`;
  return JSON.parse(readFileSync(join(FIXTURES, path), 'utf8')) as Fixture;
}

export function liveIndex(): { slug: string; name: string; token: string } {
  return JSON.parse(readFileSync(join(FIXTURES, 'live', 'index.json'), 'utf8')) as {
    slug: string;
    name: string;
    token: string;
  };
}

export type Call = { url: URL; init: RequestInit | undefined };

/**
 * A fetch that answers from one saved fixture and fails the test on any other request: the path
 * and every query parameter must match what the fixture recorded. `mutate` edits a copy of the
 * body first, for the cases the live API cannot be asked for (a field HEY does not hold).
 */
export function fixtureFetch(
  name: string,
  calls: Call[] = [],
  mutate?: (body: Record<string, unknown>) => void,
): FetchLike {
  const fixture = loadFixture(name);
  return async (input, init) => {
    const url = new URL(input);
    calls.push({ url, init });
    const expected = new URL(fixture.request.path, 'https://heyresearch.xyz');
    for (const [k, v] of Object.entries(fixture.request.params)) {
      expected.searchParams.set(k, String(v));
    }
    expected.searchParams.sort();
    const actual = new URL(url);
    actual.searchParams.sort();
    if (actual.pathname !== expected.pathname || actual.search !== expected.search) {
      throw new Error(
        `Unexpected request ${url.pathname}${url.search}; fixture ${name} recorded ${expected.pathname}${expected.search}`,
      );
    }
    let body = fixture.response.body;
    if (mutate && body && typeof body === 'object') {
      body = structuredClone(body);
      mutate(body as Record<string, unknown>);
    }
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
      status: fixture.response.status,
      headers: fixture.response.headers,
    });
  };
}

/** A fetch that fails the test if the plugin makes any request at all. */
export const noFetch: FetchLike = async (input) => {
  throw new Error(`No request was expected, but the plugin asked for ${input}`);
};

/** The smallest wallet GOAT accepts. The plugin never uses it: HEY needs no wallet. */
export class ReadOnlyWallet extends WalletClientBase {
  constructor(private readonly chain: Chain = robinhoodChain) {
    super();
  }
  getAddress(): string {
    return '0x0000000000000000000000000000000000000001';
  }
  getChain(): Chain {
    return this.chain;
  }
  async signMessage(): Promise<Signature> {
    throw new Error('the HEY plugin never signs');
  }
  async balanceOf(): Promise<Balance> {
    throw new Error('the HEY plugin never reads balances');
  }
}

export const robinhoodChain: Chain = {
  type: 'evm',
  id: 4663,
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
};

/** The plugin's tools as GOAT hands them to an adapter. */
export async function heyTools(options: HeyResearchOptions): Promise<Map<string, ToolBase>> {
  const tools = await heyResearch(options).getTools(new ReadOnlyWallet());
  return new Map(tools.map((t) => [t.name, t]));
}

/** Runs one tool through GOAT's own tool object, exactly as an adapter does. */
export async function callTool(
  name: string,
  args: Record<string, unknown>,
  fetchImpl: FetchLike,
  options: Omit<HeyResearchOptions, 'fetchImpl'> = {},
): Promise<HeyToolResult> {
  const tools = await heyTools({ ...options, fetchImpl });
  const tool = tools.get(name);
  if (!tool) throw new Error(`no tool ${name}`);
  return (await tool.execute(tool.parameters.parse(args))) as HeyToolResult;
}

export const ATTRIBUTION_RE = /Source: HEY Research Lab — heyresearch\.xyz/;
