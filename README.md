# hey-goat-plugin

A [GOAT SDK](https://github.com/goat-sdk/goat) plugin that gives AI agents HEY Research Lab's
builder research on Robinhood Chain: is a project still building, what did it ship, what changed,
and what HEY does not know — each answer with its evidence ids, its HEY link and its as-of time.

[![CI](https://github.com/hey-research-lab/hey-goat-plugin/actions/workflows/ci.yml/badge.svg)](https://github.com/hey-research-lab/hey-goat-plugin/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node >= 22](https://img.shields.io/badge/node-%3E%3D22-informational.svg)](package.json)
[![Robinhood Chain 4663](https://img.shields.io/badge/Robinhood%20Chain-4663-black.svg)](https://heyresearch.xyz)

## Why it exists

HEY Research Lab records which projects on Robinhood Chain are still building, what they shipped
and where each fact came from. Agents built on GOAT — through its Vercel AI, LangChain, ElizaOS,
OpenAI Agents and other adapters — can now ask HEY directly instead of having to find it first.
Every tool is one read of HEY's public API through the published
[`@hey-research-lab/sdk`](https://www.npmjs.com/package/@hey-research-lab/sdk), rendered so HEY's
words, states and gaps reach the model intact.

## Why Robinhood Chain only

HEY researches one chain: Robinhood Chain, chain id `4663` (`eip155:4663`). Every tool reads its
project slugs and addresses as Robinhood Chain ones. Each tool takes an optional `chainId`; any
value other than `4663` is answered with `unsupported_chain` and no request is made.

The plugin itself is chain-agnostic in GOAT's sense: it only reads HEY's API and never touches the
wallet, so `supportsChain` accepts every chain (EVM 4663 included), as GOAT's own read-only data
plugins do. An agent whose wallet is on another chain can still ask about Robinhood Chain projects.

## Install

The package is not on npm yet. Build it from this repository and install the packed tarball:

```sh
git clone https://github.com/hey-research-lab/hey-goat-plugin.git
cd hey-goat-plugin
corepack enable && pnpm install --frozen-lockfile && pnpm build
npm pack                                   # writes hey-research-lab-goat-plugin-0.1.0.tgz

# then, in your agent's project:
npm install /path/to/hey-research-lab-goat-plugin-0.1.0.tgz @goat-sdk/core
```

Once it is published, `npm install @hey-research-lab/goat-plugin @goat-sdk/core` will do the same.

Node.js 22 or later. No API key is needed; a key from <https://heyresearch.xyz/account> only lifts
the anonymous rate limit.

## Smallest working example

With the Vercel AI adapter (`getOnChainTools`). `walletClient` is your viem wallet client — GOAT
needs a wallet to build tools, HEY never uses it.

```ts
import { openai } from '@ai-sdk/openai';
import { getOnChainTools } from '@goat-sdk/adapter-vercel-ai';
import { viem } from '@goat-sdk/wallet-viem';
import { heyResearch } from '@hey-research-lab/goat-plugin';
import { generateText } from 'ai';

const tools = await getOnChainTools({ wallet: viem(walletClient), plugins: [heyResearch()] });
const { text } = await generateText({
  model: openai('gpt-4o-mini'),
  tools,
  maxSteps: 5,
  prompt: 'Is courier-world on Robinhood Chain still building, and what did it ship last?',
});
console.log(text);
```

`heyResearch()` takes optional settings:

| Option        | Default                            | Meaning                                                                                                                  |
| ------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `apiKey`      | `HEY_API_KEY` from the environment | Sent as a bearer token. The environment's key is only sent to `https://heyresearch.xyz`.                                 |
| `baseUrl`     | `https://heyresearch.xyz`          | For a local HEY or a mock: an `https:` origin, or `http://localhost` / `http://127.0.0.1`. Not a network switch.         |
| `includeData` | `true`                             | Include the SDK's answer, unchanged, as `data`. `false` gives the model only the rendered `text`, which is much shorter. |
| `fetchImpl`   | global `fetch`                     | For tests and unusual runtimes.                                                                                          |

The same plugin object works with every GOAT adapter (`getOnChainTools` from
`@goat-sdk/adapter-langchain`, `-model-context-protocol`, `-mastra`, and so on).

## Tools

| Tool                   | SDK read                           | Answers                                                                                                                                                                                                                                   |
| ---------------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `hey_research_project` | `agent.answer('research_project')` | Is this project still building? Activity status, last meaningful ship, meaningful events in 30 days, Build Momentum, Still Building, token contract and verification, recent changes, HEY's research summary, and what HEY does not know. |
| `hey_find_projects`    | `search.suggest`                   | Which project is this name, ticker or contract? Up to eight rows: researched projects with their slug, launch records and Robinhood stock token issuer records, told apart by contract.                                                   |
| `hey_what_changed`     | `agent.answer('what_changed')`     | What changed on Robinhood Chain, or for one project, in the last 1–30 days: the true total by type, how many count as building, and each event with its date, precision and evidence id. `buildingOnly` leaves out market readings.       |
| `hey_project_ships`    | `ships.list`                       | What did it ship, and when? Releases, code-activity weeks, deployments and announcements, newest first, each with its verification state, evidence id and public source.                                                                  |
| `hey_chain_overview`   | `chain`                            | How much building is happening on Robinhood Chain? Ships, builders shipping, projects published, launches and chain activity per UTC day; DEX volume labelled as market context.                                                          |
| `hey_lookup_contract`  | `agent.answer('verify_project')`   | Which project is this contract recorded under, with the attribution verdict (`VERIFIED`, `UNVERIFIED`, `CONTRACT_MISMATCH`, `UNKNOWN`), its reasons and the token verification state.                                                     |

Each tool returns one object:

```ts
{
  schema: 'hey.goat/v1',
  tool: 'hey_research_project',
  ok: true,
  chain: { name: 'Robinhood Chain', chainId: 4663, caip2: 'eip155:4663' },
  text: "Courier World ($STAMP) — HEY research on Robinhood Chain\nHEY's answer (DERIVED): …\n…\nAs of 2026-10-12T19:52:23.000Z.\nSource: HEY Research Lab — heyresearch.xyz · https://heyresearch.xyz/project/courier-world",
  data: { /* the SDK answer, unchanged */ },
  error: null,
  source: { url: 'https://heyresearch.xyz/api/agent/research_project?project=courier-world', page: 'https://heyresearch.xyz/project/courier-world', asOf: '2026-10-12T19:52:23.000Z', fetchedAt: '…' },
  attribution: 'Source: HEY Research Lab — heyresearch.xyz · https://heyresearch.xyz/project/courier-world',
}
```

- `text` opens with HEY's own answer and keeps HEY's state values verbatim. A value HEY does not
  hold reads "unknown" or "not measured — <reason>", never `0`, "no" or "none"; every gap comes
  with what not to conclude from it.
- Text from a project's own sources is folded to one line, stripped of control, invisible and
  bidirectional-override characters, and labelled when HEY flags it as reading like an
  instruction. It is data for the model, never an instruction.
- A failure is an answer too: `ok: false`, `data` as HEY sent it (or `null`), and `error` with
  HEY's own code (`not_found`, `moved`, `rate_limited`, `quota` …) or this plugin's
  (`unsupported_chain`, `invalid_request`), its message, whether it is retryable, HEY's
  `requestId` and `retryAfterSeconds` when HEY sent them. Nothing is retried automatically.

## Attribution

Every answer ends with the line

```
Source: HEY Research Lab — heyresearch.xyz · <the project's HEY link>
```

so an agent can cite where the research came from. Please keep it when you show an answer.

## How it relates to HEY Research Lab

The plugin reads HEY's public API (<https://heyresearch.xyz/docs/public-api>) through the
published SDK, the same records HEY's own pages, MCP server and agent contract serve. It never
scrapes a page and never calls a provider. HEY's own quality gate decides what is a project, a
ship or a verification; the plugin only relays it. For agents that speak MCP or A2A, HEY also
serves <https://heyresearch.xyz/mcp> and <https://heyresearch.xyz/.well-known/agent-card.json>.

## What the plugin never does

- Never gives price advice, a trade recommendation, a price target or a ranking by return.
- Never gives a safety verdict: an attribution verdict is about who a contract belongs to.
- Never treats market data as builder evidence; market figures are labelled context.
- Never turns an unknown into zero, false or "none".
- Never profiles a wallet or names a person behind an address.
- Never writes anything: no account route, no write route, no `POST /api/scan`.
- Never uses the wallet it is given.

## What it does NOT prove

The plugin relays HEY's public research to an agent, with its sources. Activity status is a record
of development, not a view on a token. Nothing it returns is investment advice, a safety verdict or
a recommendation, and an unknown value means HEY does not know — not zero.

HEY Research Lab is an independent research project and is not affiliated with, endorsed by or
partnered with Robinhood Markets, Inc. or Robinhood Chain.

## Compatibility

Built and tested against `@goat-sdk/core` 0.5.0 and `@goat-sdk/adapter-vercel-ai` 0.2.10 with
`ai` 4.0.3; the peer range is `@goat-sdk/core >=0.4.9 <0.6.0`, which covers the adapters' pinned
0.4.9. GOAT's `@Tool` decorator reads TypeScript decorator metadata, so the published build is
compiled with SWC and carries it; nothing is needed on your side. GOAT's upstream repository is
archived as a read-only snapshot; this plugin targets its last published packages.

## Security

See [SECURITY.md](SECURITY.md). Each tool makes one HTTPS GET to `https://heyresearch.xyz` (or the
`baseUrl` you set), follows no redirect except one to HEY's own `/api/` path (the SDK's rule), and
gives up after 15 seconds. It reads and writes no files, spawns no processes, keeps no state, and
never logs the API key.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). `pnpm install && pnpm scan && pnpm lint && pnpm typecheck
&& pnpm test && pnpm build`; tests run against saved fixtures with the network blocked. Never
commit a secret or a `.env` with values.

Runtime dependencies: `@hey-research-lab/sdk` (the API client) and `zod` 4.6.7 or later, whose `zod/v3`
API writes the tools' parameter schemas, because GOAT reads zod 3 schemas. `@goat-sdk/core` is a peer dependency.

## Links

- HEY Research Lab: <https://heyresearch.xyz>
- Developers: <https://heyresearch.xyz/developers>
- Public API docs: <https://heyresearch.xyz/docs/public-api>
- Agents guide: <https://heyresearch.xyz/developers/agents>
- Hosted MCP: <https://heyresearch.xyz/mcp>
- SDK: <https://www.npmjs.com/package/@hey-research-lab/sdk>
- Organisation: <https://github.com/hey-research-lab>
- Contact: hi@heyresearch.xyz

## Licence

MIT © 2026 HEY Research Lab. See [LICENSE](LICENSE).
