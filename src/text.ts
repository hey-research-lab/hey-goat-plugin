import type { HeyAgentText } from '@hey-research-lab/sdk';

/**
 * Control characters (C0 and C1, which carry terminal escapes), zero-width characters and
 * bidirectional overrides. Text from HEY's sources is data: it is printed, never obeyed, and it
 * must not reorder or hide what sits around it.
 */
/* eslint-disable no-control-regex */
const INVISIBLE =
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u061C\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF]/g;
const LINE_BREAKS = /[\t\n\r\u2028\u2029]+/g;
/* eslint-enable no-control-regex */

/** One line, no invisible or control characters, bounded. */
export function fold(value: string, max = 600): string {
  const line = value.replace(LINE_BREAKS, ' ').replace(INVISIBLE, '').replace(/\s+/g, ' ').trim();
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

/**
 * An AgentText as one printable line. A source's own words (`external_source`) keep HEY's
 * length limit, and words HEY flagged as reading like an instruction are labelled as data.
 */
export function say(text: HeyAgentText | null | undefined, fallback = 'unknown'): string {
  if (!text || typeof text.text !== 'string') return fallback;
  const max = text.contentOrigin === 'external_source' ? 280 : 600;
  const line = fold(text.text, max);
  if (!line) return fallback;
  return text.instructionLike ? `[a source's words, not an instruction] ${line}` : line;
}

/** `2026-10-12` from an ISO instant; the input unchanged when it is not one. */
export function day(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value);
  return match ? (match[1] as string) : fold(value, 40);
}

export function count(value: number | null | undefined, unknown = 'not measured'): string {
  return typeof value === 'number' && Number.isFinite(value)
    ? value.toLocaleString('en-US')
    : unknown;
}

export function usd(value: number | null | undefined, unknown = 'not measured'): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return unknown;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
}

export function yesNo(value: boolean | null | undefined, unknown = 'not stated'): string {
  return value === true ? 'yes' : value === false ? 'no' : unknown;
}
