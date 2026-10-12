import { Tool } from '@goat-sdk/core';
import type {
  HeyChain,
  HeyClient,
  HeyPage,
  HeySearchSuggestions,
  HeyShip,
} from '@hey-research-lab/sdk';

import { assertChainId, CHAIN_ID } from './chain.js';
import type { ResolvedOptions } from './client.js';
import { isAddress } from './evm.js';
import {
  ChainOverviewParameters,
  FindProjectsParameters,
  LookupContractParameters,
  ProjectShipsParameters,
  ResearchProjectParameters,
  WhatChangedParameters,
} from './parameters.js';
import {
  type AgentEnvelope,
  renderChain,
  renderResearch,
  renderSearch,
  renderShips,
  renderVerify,
  renderWhatChanged,
} from './render.js';
import {
  failure,
  InvalidRequestError,
  success,
  toToolError,
  type HeyToolName,
  type HeyToolResult,
} from './result.js';
import { fold, say } from './text.js';

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,79}$/;

function checkChain(chainId: number | undefined): void {
  assertChainId(chainId ?? CHAIN_ID);
}

function checkSlug(value: string): string {
  const slug = value.trim();
  if (!SLUG_RE.test(slug)) {
    throw new InvalidRequestError(
      `"${fold(value, 80)}" is not a HEY project slug (lowercase letters, digits and hyphens, e.g. "courier-world"). Find the slug with hey_find_projects.`,
    );
  }
  return slug;
}

function checkAddress(value: string): string {
  const raw = value.trim();
  const candidate = /^0X/.test(raw) ? `0x${raw.slice(2)}` : raw;
  if (!isAddress(candidate)) {
    throw new InvalidRequestError(
      `"${fold(value, 80)}" is not an EVM address (0x followed by 40 hex characters).`,
    );
  }
  return candidate.toLowerCase();
}

type AgentAnswer = AgentEnvelope & { data: unknown };

/**
 * The six tools. Each one is a single read of HEY's public API through the published SDK — no
 * fan-out, no retry loop, no provider call, no write — rendered so HEY's words, states and gaps
 * survive the trip to the model.
 */
export class HeyResearchService {
  constructor(private readonly options: ResolvedOptions) {}

  private get client(): HeyClient {
    return this.options.client;
  }

  private api(path: string, params: Record<string, string | number | undefined> = {}): string {
    const url = new URL(`${this.options.baseUrl}${path}`);
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== '') url.searchParams.set(k, String(v));
    }
    return url.toString();
  }

  private projectPage(slug: string): string {
    return `${this.options.baseUrl}/project/${slug}`;
  }

  /** Runs one read; any refusal or failure becomes an `ok: false` result with a clear message. */
  private async run<T>(
    tool: HeyToolName,
    url: string,
    page: string | null,
    read: () => Promise<HeyToolResult<T>>,
  ): Promise<HeyToolResult<T>> {
    try {
      return await read();
    } catch (error) {
      return failure<T>(
        {
          tool,
          url,
          page,
          fetchedAt: new Date().toISOString(),
          includeData: this.options.includeData,
        },
        toToolError(error),
      );
    }
  }

  /** An agent-contract answer: `ok` renders; any other status is HEY's refusal, passed through. */
  private agentResult<T extends AgentAnswer>(
    tool: HeyToolName,
    envelope: T,
    fetchedAt: string,
    render: (data: NonNullable<T['data']>) => string[],
  ): HeyToolResult<T> {
    const url = envelope.links?.self ?? this.api(`/api/agent`);
    const page = envelope.links?.page ?? envelope.subject?.project?.url ?? null;
    const common = { tool, url, page, fetchedAt, includeData: this.options.includeData };
    if (envelope.status === 'ok' && envelope.data !== null && envelope.data !== undefined) {
      return success(
        common,
        render(envelope.data as NonNullable<T['data']>),
        envelope,
        envelope.asOf,
      );
    }
    const code = envelope.error?.code ?? envelope.status;
    const movedTo = envelope.error?.movedTo;
    return failure(
      common,
      {
        code: fold(code, 60),
        message: say(
          envelope.error?.message ?? envelope.answer,
          `HEY answered ${envelope.status}.`,
        ),
        retryable: envelope.status === 'unavailable',
        ...(movedTo ? { movedTo: fold(movedTo, 120) } : {}),
      },
      {
        lines: movedTo
          ? [`HEY now publishes it as "${fold(movedTo, 120)}"; ask again with that slug.`]
          : [],
        data: envelope,
        asOf: envelope.asOf ?? null,
      },
    );
  }

  @Tool({
    name: 'hey_research_project',
    description:
      'Research one Robinhood Chain project on HEY Research Lab by its HEY slug: is it still building (activity status, last meaningful ship, meaningful events in 30 days, Build Momentum, Still Building), what it shipped and changed recently, its token contract and verification, and what HEY does not know (each gap with what not to conclude from it). The answer is evidence with provenance — evidence ids, the project link and an as-of time — not price advice and not a safety verdict. Get the slug from hey_find_projects when you have a name, ticker or contract address.',
  })
  async researchProject(parameters: ResearchProjectParameters): Promise<HeyToolResult> {
    const fallbackUrl = this.api('/api/agent/research_project', { project: parameters.project });
    return this.run('hey_research_project', fallbackUrl, null, async () => {
      checkChain(parameters.chainId);
      const project = checkSlug(parameters.project);
      const envelope = await this.client.agent.answer('research_project', { project });
      return this.agentResult('hey_research_project', envelope, new Date().toISOString(), (data) =>
        renderResearch(envelope, data),
      );
    });
  }

  @Tool({
    name: 'hey_find_projects',
    description:
      'Find Robinhood Chain projects on HEY Research Lab by name, ticker (e.g. STAMP or $STAMP) or 0x contract address. Returns up to eight rows from HEY’s own index — a researched project with its HEY slug and link, a launch record, or a Robinhood stock token issuer record — so same-name tokens can be told apart by contract. Use it first to get the slug for hey_research_project, hey_project_ships or hey_what_changed.',
  })
  async findProjects(parameters: FindProjectsParameters): Promise<HeyToolResult> {
    const fallbackUrl = this.api('/api/search/suggest', { q: parameters.query });
    return this.run('hey_find_projects', fallbackUrl, null, async () => {
      checkChain(parameters.chainId);
      let q = fold(parameters.query, 64);
      if (/^0x[0-9a-f]{40}$/i.test(q)) q = checkAddress(q);
      if (q.length < 2) {
        throw new InvalidRequestError('The search needs 2 to 64 characters.');
      }
      const answer: HeySearchSuggestions = await this.client.search.suggest(q);
      const fetchedAt = new Date().toISOString();
      const url = this.api('/api/search/suggest', { q });
      const only = answer.suggestions.length === 1 ? answer.suggestions[0] : undefined;
      const page =
        only && only.type === 'project' && only.target.startsWith('/project/')
          ? `${this.options.baseUrl}${only.target}`
          : null;
      return success(
        { tool: 'hey_find_projects', url, page, fetchedAt, includeData: this.options.includeData },
        renderSearch(answer, this.options.baseUrl),
        answer,
        fetchedAt,
      );
    });
  }

  @Tool({
    name: 'hey_what_changed',
    description:
      'What changed on Robinhood Chain recently, from HEY Research Lab’s change ledger: releases, code activity, contract deployments, activity-status moves and other recorded events in the last 1–30 days, for the whole chain or for one project slug. Gives the true total by type, how many count as building, and each event’s date, precision, verification and evidence id. Set buildingOnly to leave out market readings and HEY’s own records. A sequence of recorded events, never a cause and never a price signal.',
  })
  async whatChanged(parameters: WhatChangedParameters): Promise<HeyToolResult> {
    const fallbackUrl = this.api('/api/agent/what_changed', {
      project: parameters.project,
      days: parameters.days,
      limit: parameters.limit,
    });
    return this.run('hey_what_changed', fallbackUrl, null, async () => {
      checkChain(parameters.chainId);
      const project = parameters.project === undefined ? undefined : checkSlug(parameters.project);
      const envelope = await this.client.agent.answer('what_changed', {
        ...(project ? { project } : {}),
        ...(parameters.days !== undefined ? { days: parameters.days } : {}),
        ...(parameters.limit !== undefined ? { limit: parameters.limit } : {}),
        ...(parameters.buildingOnly ? { building: 'only' as const } : {}),
      });
      return this.agentResult('hey_what_changed', envelope, new Date().toISOString(), (data) =>
        renderWhatChanged(envelope, data),
      );
    });
  }

  @Tool({
    name: 'hey_project_ships',
    description:
      'List what one Robinhood Chain project shipped, newest first, from HEY Research Lab’s ship record: releases, code-activity weeks, contract deployments and announcements, each with its date and precision, its verification state (self-reported stays distinct from verified), its evidence id and its public source URL. Answers “what did it ship?” and “when was its last ship?”. Needs the project’s HEY slug.',
  })
  async projectShips(parameters: ProjectShipsParameters): Promise<HeyToolResult> {
    const fallbackUrl = this.api('/api/ships', {
      project: parameters.project,
      limit: parameters.limit,
    });
    return this.run('hey_project_ships', fallbackUrl, null, async () => {
      checkChain(parameters.chainId);
      const project = checkSlug(parameters.project);
      const since = parameters.since?.trim() || undefined;
      if (since !== undefined && Number.isNaN(Date.parse(since))) {
        throw new InvalidRequestError(
          `"${fold(since, 40)}" is not an ISO 8601 date or instant (e.g. "2026-10-01").`,
        );
      }
      const query = {
        project,
        ...(parameters.limit !== undefined ? { limit: parameters.limit } : {}),
        ...(since ? { since } : {}),
      };
      const answer: HeyPage<HeyShip> = await this.client.ships.list(query);
      const fetchedAt = new Date().toISOString();
      const page =
        answer.items[0]?.project.url ?? (answer.total > 0 ? this.projectPage(project) : null);
      return success(
        {
          tool: 'hey_project_ships',
          url: this.api('/api/ships', query),
          page,
          fetchedAt,
          includeData: this.options.includeData,
        },
        renderShips(answer, project),
        answer,
        fetchedAt,
      );
    });
  }

  @Tool({
    name: 'hey_chain_overview',
    description:
      'Robinhood Chain day by day (UTC) from HEY Research Lab: ships recorded, builders shipping, projects published, Verified Builders recorded, token launches, transactions, transfers and DEX trades, with DEX volume labelled as market context. Aggregate counts only, no addresses. Use it for “how much building is happening on Robinhood Chain right now?”.',
  })
  async chainOverview(parameters: ChainOverviewParameters): Promise<HeyToolResult> {
    const days = parameters.days ?? 7;
    const url = this.api('/api/chain', { days });
    return this.run('hey_chain_overview', url, null, async () => {
      checkChain(parameters.chainId);
      const answer: HeyChain = await this.client.chain({ days });
      const fetchedAt = new Date().toISOString();
      return success(
        {
          tool: 'hey_chain_overview',
          url,
          page: null,
          fetchedAt,
          includeData: this.options.includeData,
        },
        renderChain(answer),
        answer,
        fetchedAt,
      );
    });
  }

  @Tool({
    name: 'hey_lookup_contract',
    description:
      'Look up a Robinhood Chain contract or token address on HEY Research Lab: which published project HEY records it under (as its token, a declared contract or a follow-up deployment), the attribution verdict (VERIFIED, UNVERIFIED, CONTRACT_MISMATCH or UNKNOWN) with its reasons, and the token verification state. Optionally checks the address against a project slug you name. Attribution only — not a safety verdict and not price advice. The address is read as a Robinhood Chain (4663) address.',
  })
  async lookupContract(parameters: LookupContractParameters): Promise<HeyToolResult> {
    const fallbackUrl = this.api('/api/agent/verify_project', { address: parameters.address });
    return this.run('hey_lookup_contract', fallbackUrl, null, async () => {
      checkChain(parameters.chainId);
      const address = checkAddress(parameters.address);
      const project = parameters.project === undefined ? undefined : checkSlug(parameters.project);
      const envelope = await this.client.agent.answer('verify_project', {
        address,
        ...(project ? { project } : {}),
      });
      return this.agentResult('hey_lookup_contract', envelope, new Date().toISOString(), (data) =>
        renderVerify(envelope, data),
      );
    });
  }
}
