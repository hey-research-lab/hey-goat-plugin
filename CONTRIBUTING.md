# Contributing

Thank you for helping. This plugin is a thin, read-only bridge from GOAT SDK agents to HEY
Research Lab's public API; changes that keep it that way are welcome.

## Setup

```sh
corepack enable
pnpm install
pnpm scan          # leak and attribution scan (scripts/scan.mjs)
pnpm lint
pnpm typecheck
pnpm test          # offline: fixtures only, the network is blocked
pnpm build
```

Node.js 22+, pnpm 9.15.1. Builds and tests compile through SWC (`@swc/core`, `unplugin-swc`)
because GOAT's `@Tool` decorator reads `design:paramtypes` metadata, which esbuild does not emit.

## Rules

- **One tool, one SDK read.** Every tool is a single call of the published
  `@hey-research-lab/sdk`. No fan-out, no automatic retries, no provider call, no write route,
  never `POST /api/scan`. Never fork or vendor the SDK.
- **Relay, never reshape.** `data` carries the SDK's answer unchanged. `text` prints HEY's own
  answer first and HEY's state values verbatim; an absent value prints as "unknown" (or "not
  measured — reason"), never `0`, `false`, a blank or "none".
- **Every answer ends with the attribution line** — `Source: HEY Research Lab — heyresearch.xyz`
  and the subject's HEY link — and carries an as-of time.
- **Robinhood Chain only** (4663). Another `chainId` is `unsupported_chain`.
- **Wording:** no investment advice, no safety verdicts, no trading language, no "users" for
  addresses. `test/wording.test.ts` scans every tool description and every output string.
- **Tool descriptions are what make an agent pick a tool.** Keep them concrete: Robinhood Chain,
  ticker, contract address, still building, what shipped, last ship, evidence with provenance.
- **Tests:** every behaviour is tested against fixtures in `test/fixtures`. `live/` holds answers
  recorded once from the live API; `synthetic/` holds hand-written answers for paths the live API
  cannot be asked for politely (rate limits, 5xx, a moved slug).
- **No secrets** in code, fixtures, commits or logs; no `.env` with values.
- Conventional commit messages (`feat:`, `fix:`, `test:`, `docs:`, `chore:`, `ci:`).

## Re-recording fixtures (maintainers)

```sh
HEY_LIVE=1 node scripts/record-fixtures.mjs
# keep the same project and token as test/fixtures/live/index.json:
HEY_LIVE=1 HEY_RECORD_REUSE=1 node scripts/record-fixtures.mjs
```

About a dozen read-only GETs on public routes, at most one per second, no API key. Never run it in
CI. Review the diff before committing: the fixtures are public data, but replace personal account
handles with neutral placeholders (`builder-one`, `example_project`) and run `pnpm scan`. The
tests' expectations then move only where HEY's answer did.

## Parity

The chain constants (`src/chain.ts`) and the address rules (`src/evm.ts`) follow the HEY Research
Lab ecosystem conventions shared by every repository in the organisation. The tool-to-SDK map and
the state vocabularies were last checked against `@hey-research-lab/sdk` 0.2.0 and the agent
contract served at https://heyresearch.xyz/api/agent on 2026-10-13; the fixtures were recorded
from the live API on 2026-10-12 (UTC).
