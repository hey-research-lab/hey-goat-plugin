import { HeyApiError } from '@hey-research-lab/sdk';

import { CAIP2, CHAIN_ID, CHAIN_NAME, UnsupportedChainError } from './chain.js';
import { fold } from './text.js';

export const TOOL_NAMES = [
  'hey_research_project',
  'hey_find_projects',
  'hey_what_changed',
  'hey_project_ships',
  'hey_chain_overview',
  'hey_lookup_contract',
] as const;
export type HeyToolName = (typeof TOOL_NAMES)[number];

/** The line every answer ends with, so an agent cites where the research came from. */
export const ATTRIBUTION = 'Source: HEY Research Lab — heyresearch.xyz';

export type HeyToolError = {
  /** HEY's own code when it gave one (`not_found`, `rate_limited` …), else this plugin's. */
  code: string;
  message: string;
  retryable: boolean;
  requestId?: string;
  retryAfterSeconds?: number;
  /** For `moved`: the slug HEY now publishes the project under. */
  movedTo?: string;
};

/**
 * What every tool returns. `text` is the answer to show or reason over — HEY's own answer first,
 * then the evidence, the gaps, the as-of time and the attribution line. `data` is the SDK's
 * answer unchanged (absent fields stay absent: unknown, never zero).
 */
export type HeyToolResult<T = unknown> = {
  schema: 'hey.goat/v1';
  tool: HeyToolName;
  ok: boolean;
  chain: { name: typeof CHAIN_NAME; chainId: typeof CHAIN_ID; caip2: typeof CAIP2 };
  text: string;
  data: T | null;
  error: HeyToolError | null;
  source: {
    /** The HEY API read this answer came from. */
    url: string;
    /** HEY's public page for the subject, when there is one. */
    page: string | null;
    /** When HEY's answer was true: its own `asOf`, or the time of this read where it gives none. */
    asOf: string | null;
    fetchedAt: string;
  };
  /** `Source: HEY Research Lab — heyresearch.xyz`, with the subject's HEY link when there is one. */
  attribution: string;
};

export const CHAIN = { name: CHAIN_NAME, chainId: CHAIN_ID, caip2: CAIP2 } as const;

export function attributionLine(link: string | null): string {
  return link ? `${ATTRIBUTION} · ${link}` : ATTRIBUTION;
}

type Common = {
  tool: HeyToolName;
  url: string;
  page: string | null;
  fetchedAt: string;
  includeData: boolean;
};

export function success<T>(
  common: Common,
  lines: string[],
  data: T,
  asOf: string | null,
): HeyToolResult<T> {
  const attribution = attributionLine(common.page ?? common.url);
  const asOfLine = asOf
    ? `As of ${asOf}${asOf === common.fetchedAt ? ' (the time of this read)' : ''}.`
    : 'As of: HEY gave no time for this answer.';
  return {
    schema: 'hey.goat/v1',
    tool: common.tool,
    ok: true,
    chain: CHAIN,
    text: [...lines, asOfLine, attribution].join('\n'),
    data: common.includeData ? data : null,
    error: null,
    source: { url: common.url, page: common.page, asOf, fetchedAt: common.fetchedAt },
    attribution,
  };
}

export function failure<T>(
  common: Common,
  error: HeyToolError,
  options: { lines?: string[]; data?: T | null; asOf?: string | null } = {},
): HeyToolResult<T> {
  const attribution = attributionLine(common.page ?? common.url);
  const detail = [
    `code ${error.code}`,
    error.requestId ? `requestId ${error.requestId}` : null,
    error.retryAfterSeconds !== undefined ? `retry after ${error.retryAfterSeconds} s` : null,
  ]
    .filter(Boolean)
    .join(', ');
  const head = `HEY could not answer: ${error.message} (${detail}).`;
  return {
    schema: 'hey.goat/v1',
    tool: common.tool,
    ok: false,
    chain: CHAIN,
    text: [head, ...(options.lines ?? []), attribution].join('\n'),
    data: common.includeData ? (options.data ?? null) : null,
    error,
    source: {
      url: common.url,
      page: common.page,
      asOf: options.asOf ?? null,
      fetchedAt: common.fetchedAt,
    },
    attribution,
  };
}

export class InvalidRequestError extends Error {
  readonly code = 'invalid_request';
}

const RETRYABLE = new Set(['rate_limited', 'unavailable', 'network', 'timeout']);

function bodyField(body: unknown, key: string): unknown {
  return body && typeof body === 'object' ? (body as Record<string, unknown>)[key] : undefined;
}

/** Any thrown error as a tool error the model can read; nothing is swallowed silently. */
export function toToolError(error: unknown): HeyToolError {
  if (error instanceof UnsupportedChainError) {
    return { code: error.code, message: error.message, retryable: false };
  }
  if (error instanceof InvalidRequestError) {
    return { code: error.code, message: fold(error.message), retryable: false };
  }
  if (error instanceof HeyApiError) {
    const requestId = bodyField(error.body, 'requestId');
    const bodyRetryable = bodyField(error.body, 'retryable');
    return {
      code: error.code,
      message: fold(error.message),
      retryable: RETRYABLE.has(error.code) || bodyRetryable === true,
      ...(typeof requestId === 'string' ? { requestId: fold(requestId, 80) } : {}),
      ...(error.retryAfterSeconds !== undefined
        ? { retryAfterSeconds: error.retryAfterSeconds }
        : {}),
    };
  }
  const message = error instanceof Error ? error.message : String(error);
  return { code: 'internal', message: fold(message), retryable: false };
}
