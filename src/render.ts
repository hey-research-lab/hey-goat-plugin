import type {
  HeyAgentChange,
  HeyAgentResearchData,
  HeyAgentResponse,
  HeyAgentVerifyData,
  HeyAgentWhatChangedData,
  HeyChain,
  HeyPage,
  HeySearchSuggestions,
  HeyShip,
} from '@hey-research-lab/sdk';

import { count, day, fold, say, usd, yesNo } from './text.js';

/** The fields every agent-contract answer carries, whatever its capability. */
export type AgentEnvelope = Omit<HeyAgentResponse, 'capability' | 'data'>;

/*
 * Each renderer turns one SDK answer into lines of plain text. HEY's own answer comes first and
 * its words and state values are printed verbatim; a value HEY does not hold is printed as
 * "unknown" or "not measured — <reason>", never as 0, "no" or a blank.
 */

const MAX_LIST = 25;
const MAX_EVIDENCE = 8;

/** The parts of every agent answer: HEY's sentence first, the gaps and evidence after. */
export function agentHead(envelope: AgentEnvelope): string[] {
  return [`HEY's answer (${envelope.answerStatus}): ${say(envelope.answer)}`];
}

export function agentTail(envelope: AgentEnvelope): string[] {
  const lines: string[] = [];
  const unknowns = envelope.unknowns ?? [];
  if (unknowns.length > 0) {
    lines.push(`What HEY does not know (${unknowns.length}) — gaps, not findings:`);
    for (const u of unknowns.slice(0, MAX_LIST)) {
      lines.push(
        `- ${u.category} · ${fold(u.dimension, 60)}: ${say(u.statement)} Do not conclude: ${say(u.doNotConclude)}`,
      );
    }
  }
  const evidence = envelope.evidence ?? [];
  if (evidence.length > 0) {
    const shown = evidence.slice(0, MAX_EVIDENCE).map((e) => fold(e.id, 120));
    const more = evidence.length > shown.length ? ` (+${evidence.length - shown.length} more)` : '';
    lines.push(
      `Evidence ids: ${shown.join(', ')}${more}. Each resolves at https://heyresearch.xyz/api/evidence/{id}.`,
    );
  }
  const disclaimer = envelope.boundaries?.disclaimer;
  if (disclaimer) lines.push(`HEY's note: ${say(disclaimer)}`);
  return lines;
}

function changeLine(change: HeyAgentChange, withProject: boolean): string {
  const when = change.occurredAt
    ? `${day(change.occurredAt)} (${change.precision})`
    : `observed by HEY ${day(change.detectedAt) ?? 'at an unknown time'}`;
  const parts = [
    when,
    fold(change.type, 60),
    ...(withProject ? [fold(change.project.slug, 120)] : []),
    say(change.summary),
    `counts as building: ${yesNo(change.countsAsBuilding)}`,
    ...(change.verification ? [`verification ${fold(change.verification, 40)}`] : []),
    fold(change.id, 120),
  ];
  return `- ${parts.join(' · ')}`;
}

const LATEST_CHANGE_REASON: Record<string, string> = {
  not_in_recent_changes:
    'not among the newest changes listed here (HEY holds meaningful building; this is "not listed", not "none")',
  none_recorded: "none in HEY's change ledger for this project",
  changes_unavailable: "unknown — HEY's change ledger could not be read for this answer",
};

function stillBuildingLine(state: HeyAgentResearchData['builderState']): string {
  if (state.stillBuildingState === 'HELD') {
    return 'Still Building: HELD (verified activity through a market drawdown HEY tracked; not a prediction)';
  }
  if (state.stillBuildingState === 'NOT_HELD') return 'Still Building: NOT_HELD';
  if (state.stillBuildingState === 'NOT_MEASURED') {
    return `Still Building: not measured — ${fold(state.stillBuildingWithheld ?? 'HEY gave no reason', 80)}`;
  }
  if (state.stillBuilding === true) return 'Still Building: HELD';
  if (state.stillBuildingWithheld) {
    return `Still Building: not measured — ${fold(state.stillBuildingWithheld, 80)}`;
  }
  return 'Still Building: not held, or not measured (HEY did not say which)';
}

export function renderResearch(envelope: AgentEnvelope, data: HeyAgentResearchData): string[] {
  const { identity, builderState: b } = data;
  const symbol = identity.symbol ? ` ($${say(identity.symbol)})` : '';
  const lines = [`${say(identity.name, identity.slug)}${symbol} — HEY research on Robinhood Chain`];
  lines.push(...agentHead(envelope));

  const measured =
    b.activityMeasured === true
      ? ''
      : b.activityMeasured === false
        ? ' (activity not measured)'
        : ' (whether activity was measured: unknown)';
  lines.push(
    [
      `Activity status: ${fold(b.activityStatus, 40)}${measured}`,
      `last meaningful ship ${day(b.lastMeaningfulShipAt) ?? 'unknown'}`,
      `meaningful events in 30 days: ${count(b.meaningfulEvents30d)}`,
    ].join(' · '),
  );
  lines.push(
    typeof b.buildMomentum === 'number'
      ? `Build Momentum: ${b.buildMomentum} of 100 (development evidence only, never price)`
      : `Build Momentum: not measured — ${fold(b.buildMomentumReason ?? 'HEY gave no reason', 80)}`,
  );
  lines.push(stillBuildingLine(b));

  const token = data.contractIdentity.token;
  lines.push(
    [
      `Research level: ${fold(identity.researchLevel, 40)}`,
      token
        ? `token contract ${fold(token.address, 60)} (token verification ${token.verification ? fold(token.verification, 40) : 'unknown'})`
        : 'token contract: HEY records no token for this project',
      `owner verified: ${yesNo(data.contractIdentity.ownerVerified)}`,
    ].join(' · '),
  );

  if (data.latestMeaningfulChange) {
    lines.push(
      `Latest meaningful change: ${changeLine(data.latestMeaningfulChange, false).slice(2)}`,
    );
  } else {
    const reason = data.latestMeaningfulChangeReason;
    lines.push(
      `Latest meaningful change: ${reason ? (LATEST_CHANGE_REASON[reason] ?? fold(reason, 80)) : 'unknown'}`,
    );
  }

  const summary = (envelope.claims ?? []).filter((c) => c.id.startsWith('summary.'));
  if (summary.length > 0) {
    lines.push('Research summary:');
    for (const claim of summary) {
      const context =
        claim.contextOnly || claim.dimension === 'market' || claim.dimension === 'usage'
          ? ' (context only, never builder evidence)'
          : '';
      lines.push(
        `- [${claim.status}] ${fold(claim.dimension, 40)}${context}: ${say(claim.statement)}`,
      );
    }
  }

  const recent = data.recentChanges;
  if (!recent.available) {
    lines.push(
      `Recent changes: unknown — ${fold(recent.reason ?? 'not available for this answer', 80)}`,
    );
  } else if (recent.items.length > 0) {
    lines.push(`Recent changes (newest ${Math.min(recent.items.length, 5)}):`);
    for (const change of recent.items.slice(0, 5)) lines.push(changeLine(change, false));
  }
  lines.push(...agentTail(envelope));
  return lines;
}

export function renderWhatChanged(
  envelope: AgentEnvelope,
  data: HeyAgentWhatChangedData,
): string[] {
  const lines = agentHead(envelope);
  lines.push(
    `Window: ${data.window.from} → ${data.window.to} (${data.window.days} days; dated by when it happened, else when HEY detected it).`,
  );
  lines.push(
    `Total ${count(data.total)} · count as building ${count(data.countsAsBuilding, 'not stated')} · listed ${count(data.shown)}`,
  );
  if (data.byType.length > 0) {
    const top = data.byType.slice(0, 10).map((t) => `${fold(t.type, 60)} ${count(t.count)}`);
    lines.push(`By type: ${top.join(', ')}${data.byType.length > 10 ? ', …' : ''}`);
  }
  for (const change of data.items.slice(0, 50)) {
    lines.push(changeLine(change, data.scope === 'chain'));
  }
  if (data.ledger.transitionsFrom) {
    lines.push(
      `HEY's ledger records status moves since ${data.ledger.transitionsFrom}; before that they are absent here, not zero.`,
    );
  }
  lines.push(`More: ${fold(data.more, 300)}`);
  lines.push(...agentTail(envelope));
  return lines;
}

export function renderVerify(envelope: AgentEnvelope, data: HeyAgentVerifyData): string[] {
  const lines = agentHead(envelope);
  lines.push(
    `Contract ${fold(data.address, 60)} on Robinhood Chain (${data.chainId}) · attribution verdict ${data.verdict} (${fold(data.reasonCode, 80)})`,
  );
  const recorded = data.recordedProject;
  lines.push(
    recorded
      ? `Recorded project: ${fold(recorded.slug, 120)} (role ${recorded.role ?? 'unknown'}) · ${fold(recorded.url, 300)}`
      : "Recorded project: none in HEY's records — attribution unknown, which is not evidence against the contract",
  );
  if (data.askedProject) {
    lines.push(
      `Asked project: ${fold(data.askedProject.slug, 120)} · ${data.askedProject.found ? 'published on HEY' : 'HEY holds no published project with this slug'}`,
    );
  }
  lines.push(
    data.tokenVerification
      ? `Token verification: ${data.tokenVerification.status}${data.tokenVerification.reason ? ` (${fold(data.tokenVerification.reason, 80)})` : ''}`
      : 'Token verification: unknown (HEY holds no token record for this address)',
  );
  lines.push(
    `Does the project's activity status apply to this contract: ${yesNo(data.activityAppliesToContract, 'unknown')}`,
  );
  if (data.reasons.length > 0) {
    lines.push('Reasons:');
    for (const reason of data.reasons.slice(0, 10)) lines.push(`- ${say(reason)}`);
  }
  lines.push(
    `Contract record: ${fold(data.contractUrl, 300)} · HEY Scan: ${fold(data.scanUrl, 300)}`,
  );
  lines.push(...agentTail(envelope));
  return lines;
}

function absolute(baseUrl: string, target: string): string {
  if (/^https:\/\//.test(target)) return fold(target, 300);
  return `${baseUrl}${target.startsWith('/') ? '' : '/'}${fold(target, 300)}`;
}

/** `/project/<slug>` → `<slug>`, else null. */
export function slugOfTarget(target: string): string | null {
  const match = /^\/project\/([a-z0-9][a-z0-9-]{0,119})$/.exec(target);
  return match ? (match[1] as string) : null;
}

export function renderSearch(answer: HeySearchSuggestions, baseUrl: string): string[] {
  const q = fold(answer.q, 64);
  const rows = answer.suggestions;
  if (rows.length === 0) {
    return [
      `HEY's search index has no row for "${q}". That is a reading of HEY's index only, not evidence that no such project exists.`,
    ];
  }
  const lines = [
    `HEY search for "${q}" (names, tickers and contracts in HEY's own index, at most eight rows): ${rows.length} row${rows.length === 1 ? '' : 's'}.`,
  ];
  for (const row of rows) {
    const symbol = row.symbol ? ` ($${fold(row.symbol, 24)})` : '';
    const name = `${fold(row.name, 120)}${symbol}`;
    const link = absolute(baseUrl, row.target);
    if (row.type === 'project') {
      const slug = slugOfTarget(row.target);
      const status = (row as { status?: unknown }).status;
      const parts = [
        `- Project: ${name}`,
        row.contract ? `contract ${fold(row.contract, 60)}` : 'no token contract recorded',
        ...(typeof status === 'string' ? [fold(status, 80)] : []),
        ...(slug ? [`slug ${slug}`] : []),
        link,
      ];
      lines.push(parts.join(' · '));
      if (row.sameNameDifferentContract) {
        lines.push(
          '  Another project shares this name or ticker on a different contract; tell them apart by contract.',
        );
      }
      if (row.emptyNamesake) {
        lines.push(
          '  This page has no token, ship or builder signal recorded and shares its name with a fuller entry.',
        );
      }
    } else if (row.type === 'launch') {
      lines.push(
        `- Launch record (not a researched project page): ${name} · contract ${fold(row.contract, 60)} · launched via ${fold(row.launchedVia, 60)} · ${link}`,
      );
      if (row.brandNotice) {
        lines.push(`  ${fold(row.brandNotice.title, 120)}: ${fold(row.brandNotice.detail, 280)}`);
      }
    } else {
      lines.push(
        `- Issuer token record (never a project): ${name} · contract ${fold(row.contract, 60)} · ${fold(row.label, 120)} · ${link}`,
      );
    }
  }
  if (answer.moreLaunchRecords) {
    lines.push('HEY may hold more launch records matching this query than these rows list.');
  }
  lines.push(
    'Next: hey_research_project with a project slug, or hey_lookup_contract with a contract.',
  );
  return lines;
}

export function renderShips(page: HeyPage<HeyShip>, slug: string): string[] {
  const items = page.items;
  if (items.length === 0) {
    return [
      `HEY's ship record holds no ship for "${fold(slug, 120)}"${page.total > 0 ? ' on this page' : ''}. That is a reading of HEY's record only; if the slug is uncertain, check it with hey_find_projects.`,
    ];
  }
  const project = items[0]?.project;
  const lines = [
    `HEY's ship record for ${fold(slug, 120)}: ${count(page.total)} ship${page.total === 1 ? '' : 's'} in total; listing the newest ${items.length}.`,
  ];
  if (project) {
    const symbol = project.symbol ? ` ($${fold(project.symbol, 24)})` : '';
    lines.push(
      `Project: ${fold(project.name, 120)}${symbol} · activity status ${fold(project.activityStatus, 40)} · last shipped ${day(project.lastShippedAt) ?? 'unknown'} · ${fold(project.url, 300)}`,
    );
  }
  for (const ship of items) {
    lines.push(
      [
        `- ${day(ship.publishedAt) ?? 'date unknown'} (${ship.precision})`,
        fold(ship.eventType, 40),
        fold(ship.title, 200),
        `verification ${fold(ship.verification, 40)}`,
        fold(ship.evidenceId, 120),
        ship.sourceUrl ? `source ${fold(ship.sourceUrl, 300)}` : 'no public source URL recorded',
      ].join(' · '),
    );
    if (ship.summary) lines.push(`  ${fold(ship.summary, 280)}`);
  }
  if (page.disclaimer) lines.push(`HEY's note: ${fold(page.disclaimer)}`);
  return lines;
}

export function renderChain(chain: HeyChain): string[] {
  const lines = [
    `Robinhood Chain day by day (UTC), ${chain.days.length} day${chain.days.length === 1 ? '' : 's'}; aggregate counts only, no address is named.${chain.today ? ` ${chain.today} is today and partial.` : ''}${chain.lastFullDay ? ` Last full day: ${chain.lastFullDay}.` : ''}`,
  ];
  for (const d of chain.days) {
    const volume = d.dexVolumeWithheld
      ? `DEX volume withheld — ${fold(d.dexVolumeWithheld, 60)}`
      : `DEX volume ${usd(d.dexVolumeUsd)} (market context)`;
    const launches =
      d.launchesBackfill === true
        ? `token launches ${count(d.launches)} (a backfill day, not that day's launches)`
        : `token launches ${count(d.launches)}`;
    lines.push(
      [
        `- ${fold(d.day, 20)}${d.day === chain.today ? ' (partial)' : ''}`,
        `ships ${count(d.ships)}`,
        `builders shipping ${count(d.buildersShipping)}`,
        `projects published ${count(d.projectsPublished)}`,
        `Verified Builders recorded ${count(d.buildersVerified)}`,
        launches,
        `transactions ${count(d.transactions)}`,
        `transfers ${count(d.transfers)}`,
        `DEX trades ${count(d.dexTrades)}`,
        volume,
      ].join(' · '),
    );
  }
  if (chain.volumeNote) lines.push(`Volume note: ${fold(chain.volumeNote)}`);
  if (chain.launchesNote) lines.push(`Launches note: ${fold(chain.launchesNote)}`);
  if (chain.disclaimer) lines.push(`HEY's note: ${fold(chain.disclaimer)}`);
  return lines;
}
