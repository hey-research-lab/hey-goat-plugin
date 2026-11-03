# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/).

## Unreleased

- Security: `zod` moves from `^3.24.1` to `^4.6.7` (GHSA-mrhx-c7xc-m3w5, memory exhaustion on large
  arrays, fixed only in 4.6.6). The parameter schemas import `zod/v3`, the zod 3 API zod 4 still ships,
  because GOAT's peer is zod 3; the tools and their schemas are unchanged.
- README: the package is not on npm yet, so Install says how to build it from this repository and
  install the packed tarball.
- Development: vitest 4.1.12.

## 0.1.0 — 2026-10-13 (not on npm)

First release.

- `heyResearch({ apiKey?, baseUrl?, includeData?, fetchImpl? })`: a GOAT SDK plugin (`PluginBase`
  with a `@Tool` service and `createToolParameters` schemas), chain-agnostic in GOAT's sense
  (`supportsChain` accepts every chain), answering for Robinhood Chain (4663) only.
- Six tools, each one read of `@hey-research-lab/sdk` 0.2.0: `hey_research_project`,
  `hey_find_projects`, `hey_what_changed`, `hey_project_ships`, `hey_chain_overview` and
  `hey_lookup_contract`.
- Every result (`hey.goat/v1`) carries HEY's answer as text, the SDK answer unchanged as `data`,
  the as-of time, the HEY link and the line "Source: HEY Research Lab — heyresearch.xyz".
  Unknown values read "unknown" or "not measured — <reason>", never zero; failures and refusals
  come back as `ok: false` with HEY's code, message, request id and retry delay.
- Built for `@goat-sdk/core` `>=0.4.9 <0.6.0`; tested with core 0.5.0, the Vercel AI adapter
  0.2.10 and `ai` 4.0.3.
