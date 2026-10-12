import { DEFAULT_BASE_URL, HeyClient, type FetchLike } from '@hey-research-lab/sdk';

import { INTEGRATION } from './version.js';

export type HeyResearchOptions = {
  /**
   * An API key from https://heyresearch.xyz/account. Optional: every tool works without one; a
   * key only lifts the anonymous rate limit. When absent, `HEY_API_KEY` from the environment is
   * used — but only against HEY's own origin, never a `baseUrl` you point elsewhere.
   */
  apiKey?: string;
  /**
   * Where HEY's public API lives. Defaults to https://heyresearch.xyz. Point it at a local HEY or a
   * mock while developing: an `https:` origin, or `http://localhost` / `http://127.0.0.1`, with no
   * path, query or credentials. It is not a network switch — the tools answer for Robinhood Chain
   * only, wherever the API runs.
   */
  baseUrl?: string;
  /**
   * Include the SDK's answer, unchanged, as `data` in every tool result (default `true`). Set it
   * to `false` to give the model only the rendered `text`, which is much shorter.
   */
  includeData?: boolean;
  /** The global `fetch` by default. Tests and unusual runtimes pass their own. */
  fetchImpl?: FetchLike;
};

export type ResolvedOptions = {
  client: HeyClient;
  baseUrl: string;
  includeData: boolean;
};

export class InvalidOptionError extends Error {
  readonly code = 'invalid_option';
}

/** An `https:` origin, or plain http on loopback for local development; nothing else. */
export function normalizeBaseUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new InvalidOptionError('baseUrl is not a URL.');
  }
  const loopback = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) {
    throw new InvalidOptionError(
      'baseUrl must be an https: origin, or http://localhost / http://127.0.0.1 for development.',
    );
  }
  if (url.username || url.password) {
    throw new InvalidOptionError('baseUrl must not carry credentials.');
  }
  if ((url.pathname !== '/' && url.pathname !== '') || url.search || url.hash) {
    throw new InvalidOptionError('baseUrl must be an origin, with no path, query or fragment.');
  }
  return url.origin;
}

function envApiKey(): string | undefined {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
    ?.env;
  const value = env?.HEY_API_KEY?.trim();
  return value ? value : undefined;
}

export function resolveOptions(options: HeyResearchOptions = {}): ResolvedOptions {
  const baseUrl =
    options.baseUrl === undefined ? DEFAULT_BASE_URL : normalizeBaseUrl(options.baseUrl);
  const explicitKey = options.apiKey?.trim() || undefined;
  // The environment's key travels only to HEY itself; a key for another origin must be passed.
  const apiKey = explicitKey ?? (baseUrl === DEFAULT_BASE_URL ? envApiKey() : undefined);
  const client = new HeyClient({
    baseUrl,
    ...(apiKey ? { apiKey } : {}),
    ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
    userAgent: INTEGRATION,
    integration: INTEGRATION,
  });
  return { client, baseUrl, includeData: options.includeData ?? true };
}
