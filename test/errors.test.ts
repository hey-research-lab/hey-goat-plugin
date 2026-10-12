import { describe, expect, it } from 'vitest';

import { TOOL_NAMES } from '../src/index.js';
import { ATTRIBUTION_RE, callTool, fixtureFetch, liveIndex, noFetch } from './helpers.js';

const { slug, token } = liveIndex();

/** The smallest valid arguments for each tool. */
const ARGS: Record<(typeof TOOL_NAMES)[number], Record<string, unknown>> = {
  hey_research_project: { project: slug },
  hey_find_projects: { query: 'Courier' },
  hey_what_changed: {},
  hey_project_ships: { project: slug },
  hey_chain_overview: {},
  hey_lookup_contract: { address: token },
};

describe('unsupported chain', () => {
  for (const tool of TOOL_NAMES) {
    it(`${tool} answers unsupported_chain for another chain, without a request`, async () => {
      const result = await callTool(tool, { ...ARGS[tool], chainId: 8453 }, noFetch);
      expect(result.ok).toBe(false);
      expect(result.data).toBeNull();
      expect(result.error).toEqual({
        code: 'unsupported_chain',
        message: 'HEY supports Robinhood Chain (4663) only; chain 8453 is not supported.',
        retryable: false,
      });
      expect(result.text).toContain(
        'HEY could not answer: HEY supports Robinhood Chain (4663) only; chain 8453 is not supported. (code unsupported_chain).',
      );
      expect(result.text).toMatch(ATTRIBUTION_RE);
    });
  }

  it('accepts 4663 given explicitly', async () => {
    const result = await callTool(
      'hey_research_project',
      { project: slug, chainId: 4663 },
      fixtureFetch('research'),
    );
    expect(result.ok).toBe(true);
  });
});

describe('invalid input is refused before any request, with what to send instead', () => {
  it('a name where a slug belongs points to hey_find_projects', async () => {
    const result = await callTool('hey_research_project', { project: 'Courier World' }, noFetch);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('invalid_request');
    expect(result.error?.message).toContain('is not a HEY project slug');
    expect(result.error?.message).toContain('hey_find_projects');
  });

  it('a malformed address', async () => {
    const result = await callTool('hey_lookup_contract', { address: '0x1234' }, noFetch);
    expect(result.error?.code).toBe('invalid_request');
    expect(result.error?.message).toContain('is not an EVM address');
  });

  it('a since that is not a date', async () => {
    const result = await callTool(
      'hey_project_ships',
      { project: slug, since: 'last tuesday' },
      noFetch,
    );
    expect(result.error?.code).toBe('invalid_request');
    expect(result.error?.message).toContain('is not an ISO 8601 date');
  });
});

describe('HEY’s refusals and failures pass through as clear messages', () => {
  it('not_found from the agent contract keeps HEY’s sentence and envelope', async () => {
    const result = await callTool(
      'hey_research_project',
      { project: 'hey-goat-no-such-project' },
      fixtureFetch('research-not-found'),
    );
    expect(result.ok).toBe(false);
    expect(result.error).toEqual({
      code: 'not_found',
      message: 'HEY holds no published project with the slug "hey-goat-no-such-project".',
      retryable: false,
    });
    expect(result.text).toContain(
      'HEY could not answer: HEY holds no published project with the slug "hey-goat-no-such-project". (code not_found).',
    );
    expect((result.data as { status: string }).status).toBe('not_found');
    expect(result.source.asOf).toBe('2026-10-12T19:52:24.115Z');
  });

  it('moved names the slug to ask with', async () => {
    const result = await callTool(
      'hey_research_project',
      { project: 'courier-world-old' },
      fixtureFetch('synthetic/research-moved'),
    );
    expect(result.error).toMatchObject({ code: 'moved', movedTo: 'courier-world' });
    expect(result.text).toContain(
      'HEY now publishes it as "courier-world"; ask again with that slug.',
    );
  });

  it('a rate limit carries the delay and HEY’s request id', async () => {
    const result = await callTool(
      'hey_research_project',
      { project: slug },
      fixtureFetch('synthetic/rate-limited'),
    );
    expect(result.ok).toBe(false);
    expect(result.error).toEqual({
      code: 'rate_limited',
      message: 'Too many requests. Try again in 12 seconds.',
      retryable: true,
      requestId: '00000000-0000-4000-8000-000000000429',
      retryAfterSeconds: 12,
    });
    expect(result.text).toContain(
      'HEY could not answer: Too many requests. Try again in 12 seconds. (code rate_limited, requestId 00000000-0000-4000-8000-000000000429, retry after 12 s).',
    );
  });

  it('a used quota is not retryable', async () => {
    const result = await callTool(
      'hey_project_ships',
      { project: slug, limit: 5 },
      fixtureFetch('synthetic/quota'),
    );
    expect(result.error).toMatchObject({ code: 'quota', retryable: false });
  });

  it('a 500 says so and keeps the request id', async () => {
    const result = await callTool(
      'hey_chain_overview',
      {},
      fixtureFetch('synthetic/internal-error'),
    );
    expect(result.ok).toBe(false);
    expect(result.error).toMatchObject({
      code: 'http',
      message: "Something went wrong on HEY's side.",
      retryable: true,
      requestId: '00000000-0000-4000-8000-000000000500',
    });
  });

  it('an unreachable HEY is a network error, never an empty answer', async () => {
    const result = await callTool('hey_chain_overview', {}, async () => {
      throw new TypeError('getaddrinfo ENOTFOUND heyresearch.xyz');
    });
    expect(result.ok).toBe(false);
    expect(result.data).toBeNull();
    expect(result.error).toMatchObject({ code: 'network', retryable: true });
    expect(result.error?.message).toContain('Could not reach HEY');
  });
});
