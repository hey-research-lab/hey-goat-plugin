import { PluginBase, type Chain, type WalletClientBase } from '@goat-sdk/core';

import { resolveOptions, type HeyResearchOptions } from './client.js';
import { HeyResearchService } from './hey-research.service.js';

/**
 * HEY Research Lab as a GOAT plugin. It only reads HEY's public API, so it needs nothing from the
 * wallet and is chain-agnostic in GOAT's sense: `supportsChain` accepts every chain the agent's
 * wallet may be on, Robinhood Chain (EVM 4663) included, as GOAT's own read-only data plugins do.
 * The questions it answers are about Robinhood Chain only: a tool asked about another chain
 * answers `unsupported_chain`.
 */
export class HeyResearchPlugin extends PluginBase<WalletClientBase> {
  constructor(options: HeyResearchOptions = {}) {
    super('hey-research', [new HeyResearchService(resolveOptions(options))]);
  }

  supportsChain = (_chain: Chain): boolean => true;
}

/**
 * The plugin factory: `heyResearch()` with no key works; `heyResearch({ apiKey })` lifts the
 * anonymous rate limit. Without `apiKey`, `HEY_API_KEY` from the environment is used.
 */
export function heyResearch(options: HeyResearchOptions = {}): HeyResearchPlugin {
  return new HeyResearchPlugin(options);
}
