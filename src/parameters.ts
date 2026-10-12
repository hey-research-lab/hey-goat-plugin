import { createToolParameters } from '@goat-sdk/core';
import { z } from 'zod';

/*
 * Numbers carry the API's own bounds so a model sees them; slugs and addresses are checked when
 * the tool runs, so a near miss ("Courier World" for "courier-world") comes back as a readable
 * answer that says what to send instead of a schema failure.
 */

const chainId = z
  .number()
  .int()
  .optional()
  .describe(
    'EVM chain id of the question. Only 4663 (Robinhood Chain) is supported; leave it out to mean 4663. Any other chain is answered with unsupported_chain.',
  );

const slug = z
  .string()
  .min(1)
  .max(120)
  .describe(
    'The project\'s HEY slug, e.g. "courier-world": lowercase letters, digits and hyphens. Get it from hey_find_projects when you have a name, ticker or contract address.',
  );

export class ResearchProjectParameters extends createToolParameters(
  z.object({ project: slug, chainId }),
) {}

export class FindProjectsParameters extends createToolParameters(
  z.object({
    query: z
      .string()
      .min(2)
      .max(64)
      .describe(
        'A project name, a ticker (with or without $) or a 0x contract address on Robinhood Chain; 2–64 characters.',
      ),
    chainId,
  }),
) {}

export class WhatChangedParameters extends createToolParameters(
  z.object({
    project: slug
      .optional()
      .describe(
        'A project slug to ask about one project; leave it out for all of Robinhood Chain.',
      ),
    days: z
      .number()
      .int()
      .min(1)
      .max(30)
      .optional()
      .describe('Window in days, 1–30; HEY uses 7 when left out.'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe(
        'How many events to list, 1–50; HEY uses 25. The total always covers the whole window.',
      ),
    buildingOnly: z
      .boolean()
      .optional()
      .describe(
        'true: only events that count toward activity status (releases, code activity, deployments, ships), leaving out market readings and HEY’s own records.',
      ),
    chainId,
  }),
) {}

export class ProjectShipsParameters extends createToolParameters(
  z.object({
    project: slug,
    limit: z
      .number()
      .int()
      .min(1)
      .max(48)
      .optional()
      .describe('How many ships to list, newest first, 1–48; HEY uses 24.'),
    since: z
      .string()
      .max(40)
      .optional()
      .describe('ISO 8601 date or instant, e.g. "2026-10-01": only ships dated at or after it.'),
    chainId,
  }),
) {}

export class ChainOverviewParameters extends createToolParameters(
  z.object({
    days: z
      .number()
      .int()
      .min(1)
      .max(30)
      .optional()
      .describe('How many UTC days to show, 1–30, the newest being today (partial); default 7.'),
    chainId,
  }),
) {}

export class LookupContractParameters extends createToolParameters(
  z.object({
    address: z
      .string()
      .min(1)
      .max(80)
      .describe(
        'A 0x contract or token address (40 hex characters), read as a Robinhood Chain address.',
      ),
    project: slug
      .optional()
      .describe(
        'Optional HEY slug to check the address against (does it belong to this project?).',
      ),
    chainId,
  }),
) {}
