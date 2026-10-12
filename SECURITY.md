# Security policy

## Reporting a vulnerability

Please report privately through GitHub's "Report a vulnerability" (Security → Advisories) on this
repository, or email hi@heyresearch.xyz with "security" in the subject. Do not open a public issue.
We aim to acknowledge within 3 working days. There is no bug bounty for this repository.

## Scope

`@hey-research-lab/goat-plugin` is a read-only GOAT SDK plugin over HEY Research Lab's public API.

- **Network:** one HTTPS GET per tool call to `https://heyresearch.xyz`, through the published
  `@hey-research-lab/sdk`. No automatic retries. Redirects are not followed except a single one
  to HEY's own `/api/` path (the SDK's rule). A request is abandoned after 15 seconds. The plugin
  never calls `POST /api/scan`, an account route or a write route, and never fetches a URL found
  inside an answer.
- **Base URL option:** `baseUrl` accepts an `https:` origin, or `http://localhost` /
  `http://127.0.0.1` for development — no credentials, path, query or fragment. `HEY_API_KEY` from
  the environment is sent only to `https://heyresearch.xyz`; a key for any other origin must be
  passed explicitly as `apiKey`.
- **Untrusted input:** tool arguments come from a model. Slugs, addresses, dates and the chain id
  are validated before any request; anything else is refused with `invalid_request` or
  `unsupported_chain` and no request is made.
- **Untrusted output:** project names, release titles and other text from a project's own sources
  are data. In `text` they are stripped of control characters (including terminal escapes),
  invisible and bidirectional-override characters, folded onto one line and bounded; text HEY
  flags as reading like an instruction is labelled as a source's words. `data` relays HEY's answer
  unchanged.
- **The wallet:** GOAT hands every plugin a wallet client. This plugin never reads, signs with or
  sends from it.
- **Local system:** the plugin reads and writes no files, spawns no processes and keeps no state.

## Handling secrets

This project never needs HEY credentials. An optional API key is taken from the `apiKey` option or
the `HEY_API_KEY` environment variable, sent only as a bearer token, never logged, never written
to disk, never placed in a URL and never included in a tool result. Never commit a `.env` with
values.

## Supported versions

The latest 0.x minor receives fixes.
