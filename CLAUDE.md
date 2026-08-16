# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Status

Increment 1 (foundation scaffold) is complete: pnpm workspace + Turborepo tooling, shared
TypeScript/ESLint/Prettier config, and minimal skeletons for `apps/server`, `apps/mobile`, and
`packages/shared` all exist and build/lint/typecheck cleanly.

Increment 2 (money primitive) is complete: the branded `Cents` integer type and its arithmetic
live in `packages/shared/src/money` (see Conventions below), with Vitest unit + fast-check
property-based coverage.

Increment 3 (Reference layer, part 1) is complete: `Currency`, `Account`, and `Category` entities
live in `packages/shared/src/reference` — branded id/code types with safe constructors, no stored
balances.

Increment 4 (Reference layer, part 2) is complete: `EnvelopeGroup` and `SubEnvelope` (the
money-holding leaf, allocated over one or more accounts per decision A1) also live in
`packages/shared/src/reference/envelope.ts`. The always-present special "Spendable" envelope is
modeled as a reserved `SubEnvelope` singleton (`SPENDABLE_ENVELOPE_ID`/`createSpendableEnvelope`),
not a separate type. This completes the Reference layer's core entities — `FxRate` and
payday/cut-off config are deferred to later increments.

Increment 5 (Ledger Core, part 1) is complete: `Transaction`, the ledger's single write surface,
lives in `packages/shared/src/ledger-core/transaction.ts` — sign convention (positive = credit,
negative = debit), `LedgerDate` (validated real calendar dates), and derived account/sub-envelope
balances (`deriveAccountBalance`/`deriveSubEnvelopeBalance`, summing transactions per decision A3).
Paired postings/transfers are deferred to a later increment. No database or auth exist yet —
everything so far is in-memory types/validators only.

Increment 6 (Domain layer, part 1) is complete: `FundingSource`, the first Domain-layer type,
lives in `packages/shared/src/domain/funding-source.ts` — a discriminated union (`{kind:"account"}`
/ `{kind:"envelope"}` / `{kind:"none"}`) modeling how a credit-card purchase gets paid (HLD module
M4). Not yet wired into `Transaction`; that lands when Credit Card purchase modeling begins.

Increment 7 (Domain layer, part 2) is complete: `Transaction` now carries a nullable
`counterTransactionId` self-reference (the pairing mechanism, Ledger Core), and
`packages/shared/src/domain/transfer.ts` adds `createTransferPair` (module M5) — builds two linked
`Transaction` legs whose amounts always sum to zero, plus `isPairedTransaction`/
`findCounterTransaction`. `FundingSource` still isn't wired into `Transaction`.

Increment 8 (Credit Card, part 1) is complete: `CreditCard` (per-card statement cutoff day) lives in
`packages/shared/src/reference/credit-card.ts`, and `cardCycleContaining` (billing-cycle window
math, clamping short months and rolling year boundaries) lives in
`packages/shared/src/domain/card-cycle.ts`. Purchase transactions, wiring `FundingSource` into
settlement, and payment allocation are deferred to later increments.

Increment 9 (Credit Card, part 2) is complete: `CardPurchase`
(`packages/shared/src/domain/card-purchase.ts`) records an individual card expense — a positive
amount owed plus an optional `FundingSource` (credit-card budget, another sub-envelope, or
unassigned). `sumCardPurchasesInCycle` totals purchases for a billing cycle, built on the new
`isDateWithinCardCycle` helper in `card-cycle.ts`. Wiring a funded purchase into an actual ledger
`Transaction` and the multi-source "Settle cycle" payment-allocation flow are still deferred.

Increment 11 (Credit Card, part 3) is complete: `settleCardPurchase`
(`packages/shared/src/domain/card-settlement.ts`) turns a funded `CardPurchase` into a real ledger
`Transaction`. Since a `SubEnvelope` can span multiple accounts, neither `FundingSource` variant
alone fully determines both `accountId` and `subEnvelopeId` — the caller always supplies both
explicitly, and the function validates them against the purchase's declared `FundingSource` rather
than deriving either field. The multi-source "Settle cycle" payment-allocation flow (splitting a
whole statement total across purchases/sources) is still deferred.

Increment 12 (Credit Card, part 4) is complete: `settleCardCycle`
(`packages/shared/src/domain/card-cycle-settlement.ts`) is the batch "Settle cycle" flow —
attempts `settleCardPurchase` for every in-cycle purchase, reporting `settledTransactions` versus
`skippedPurchases` (unfunded, or deferred by the caller). Since `CardPurchase` carries exactly one
`FundingSource` (funding is "per expense," not split within a purchase), the HLD's "payment split"
is interpreted as a batch operation across multiple purchases in a cycle, each independently
funded — this completes the credit-card settlement thread (`CreditCard`, `CardCycle`,
`CardPurchase`, `settleCardPurchase`, `settleCardCycle`).

Increment 10 (UI shell) is complete: `apps/mobile` now has a real 6-tab Expo Router shell (Today,
Envelopes, Cards, Budget, Reports, More — `apps/mobile/app/(tabs)/`), replacing the Increment-1
placeholder screen. Screens are stubs sharing one `PlaceholderScreen` component, no live data yet
(`apps/server` has no domain tRPC router). `react-native-web` was added so the app also runs as a
static web export. Jest + React Native Testing Library (`jest-expo` preset) were set up for
`apps/mobile` for the first time, with smoke tests for every screen.

Increment 13 (server layer, part 1) is complete: `apps/server` now has an in-memory seed store
(`apps/server/src/store.ts` — no database, resets on restart) built from `@gastos/shared`'s
factories, and a read-only `reference` tRPC router (`apps/server/src/routers/reference.ts`)
exposing `Account`/`Category`/`EnvelopeGroup`/`SubEnvelope` as no-input queries. Transactions are
seeded but not yet exposed by any router; balance queries and all mutation procedures are deferred
to later increments.

Increment 14 (server layer, part 2) is complete: a read-only `ledger` tRPC router
(`apps/server/src/routers/ledger.ts`) exposes the `Transaction` list and the Spendable envelope's
derived balance (`deriveSubEnvelopeBalance`) as no-input queries — the number the Today screen
needs. Parameterized balance queries (per-account, per-sub-envelope) need Zod input validation, a
first for this codebase, and are deferred along with all mutation procedures.

"gastos" is Spanish for "expenses." It is a personal, single-user finance app intended to replace
a 5-year-old, 24-sheet Excel workbook (see `req/accounts-xls-hld.md` and
`req/what-i-want.txt` for the full spec and rationale).

## Commands

Run from the repo root (Node >=22, pnpm via corepack — see below).

```
pnpm install                          # install all workspaces
pnpm lint                             # turbo run lint      (all packages)
pnpm typecheck                        # turbo run typecheck (all packages)
pnpm build                            # turbo run build     (all packages)
pnpm test                             # turbo run test      (all packages)

pnpm --filter @gastos/server dev      # Fastify + tRPC dev server (tsx watch)
pnpm --filter @gastos/mobile start    # Expo dev server
```

Each script above can be scoped to one workspace with `--filter <pkg-name>` (e.g.
`pnpm --filter @gastos/shared typecheck`).

### Provisioning pnpm

pnpm is not installed globally in this environment; it's provisioned via corepack. If `pnpm` is
not on PATH:

```
corepack enable --install-directory ./.corepack-bin   # or a global dir if writable
export PATH="$PWD/.corepack-bin:$PATH"
corepack prepare pnpm@latest --activate
```

`package.json`'s `packageManager` field pins the exact version corepack will activate
(currently `pnpm@11.21.0`).

## Workspace layout

pnpm workspaces + Turborepo, TypeScript everywhere.

```
apps/server        Fastify + tRPC API server (Node, ESM). No database yet.
apps/mobile         Expo (React Native) + Expo Router.
packages/shared     Zod schemas, Drizzle types, domain logic. Consumed as TypeScript
                    source directly (no build step) — apps import from "@gastos/shared".
packages/config     Shared ESLint (flat config), Prettier, and Knip config.
```

- Root `tsconfig.base.json` sets `strict`, `noUncheckedIndexedAccess`, and
  `exactOptionalPropertyTypes`. Every package/app's own `tsconfig.json` extends it.
- `packages/shared`'s `package.json` `main`/`exports` point straight at `src/*.ts` — apps consume
  it as source (via `tsx` in the server, via Metro in the mobile app), not a built artifact.
  `apps/server`'s `tsup` build force-bundles `@gastos/shared` (see `apps/server/tsup.config.ts`,
  `noExternal: [/^@gastos\//]`) since a plain `node` runtime can't resolve a `.ts` main on its own.
- **`pnpm-workspace.yaml` sets `nodeLinker: hoisted`.** Metro (Expo's bundler) can't
  resolve several of Expo's own transitive dependencies under pnpm's default strict/symlinked
  `node_modules`; hoisted linking is Expo's own documented fix for pnpm monorepos
  (https://docs.expo.dev/guides/monorepos/). Don't switch back to isolated linking without
  re-verifying `pnpm --filter @gastos/mobile build`.
- `apps/mobile/metro.config.js` adds the monorepo-aware `watchFolders`/`nodeModulesPaths` config
  Expo's monorepo guide recommends, so Metro can see `packages/shared`.
- Mobile dependency versions (`expo`, `react`, `react-native`, `typescript`, etc.) are pinned to
  whatever `expo install --fix` resolves as SDK-compatible — don't bump them with a plain
  `pnpm add`; use `pnpm --filter @gastos/mobile exec expo install <pkg>` instead, or the versions
  will drift out of Expo SDK compatibility (this bit us once during scaffolding: a bare
  `pnpm add react-native` pulled a newer react-native than Expo SDK 57's bundled Metro config
  supported, and the bundler failed with `Cannot find module '.../react-native/rn-get-polyfills'`).
- **Mobile testing:** `apps/mobile` uses Jest with the `jest-expo` preset (see the `"jest"` key in
  `apps/mobile/package.json`) plus React Native Testing Library. Install `jest`/`jest-expo`
  together via `expo install jest-expo jest` — installing a bare `jest` separately can resolve a
  major version `jest-expo` isn't built against (its own `dependencies` pin `jest-runtime`/
  `jest-mock`/etc. to a specific major), causing runtime errors like `this._moduleMocker
  .clearMocksOnScope is not a function`.
- `apps/mobile/metro.config.js`'s `resolver.blockList` excludes `*.test.tsx`/`*.spec.tsx` files
  from Metro's bundle. Expo Router's `require.context` globs every route candidate under `app/`,
  including colocated test files, and would otherwise try to bundle test-only deps (e.g.
  `@testing-library/react-native`) into the production/dev bundle. This only affects Metro; Jest
  resolves test files independently via its own config.
- `packages/config/knip.json`'s `apps/mobile` entry has `"ignoreDependencies": ["@gastos/shared"]`
  — it's genuinely unused by today's stub screens (per Increment 10) but deliberately pre-declared
  for the data-wiring increments to come. Remove the ignore once a screen actually imports it.

## Conventions

- **Layering (one direction only): Reporting → Domain → Ledger Core → Reference.** A layer may
  import from itself or layers to its right, never "up" the stack. Enforced by
  `eslint-plugin-boundaries` in `packages/config/eslint.config.mjs` (rule: `boundaries/element-types`).
  None of the layer directories exist yet — see `packages/config/README.md` for the directory →
  layer mapping that will apply once `packages/shared/src/{reference,ledger-core,domain}` and
  `apps/server/src/reporting` are created.
- **Money is always the branded `Cents` type** from `packages/shared/src/money`
  (`centsFromInt`, `parseCents`/`formatCents`, `addCents`/`subtractCents`/`negateCents`/
  `sumCents`, `multiplyCents` for splits — rounds half away from zero, `compareCents`/
  `isZeroCents`). No raw `number` arithmetic on currency values, no `parseFloat`/`Number()` on a
  money string outside the shared parser, no adding amounts across currencies without an explicit
  `FxRate` (not yet implemented — future Reference-layer work).
- **Reference entities** (`packages/shared/src/reference/`): `Currency`/`Account`/`Category`
  (`currency.ts`/`account.ts`/`category.ts`) and `EnvelopeGroup`/`SubEnvelope`
  (`envelope.ts`) — all branded id types with `xFromString` safe constructors and a `createX`
  factory that trims/validates. `Account` and `SubEnvelope` deliberately carry no balance field
  (decision A3). The always-present "Spendable" envelope is `createSpendableEnvelope`, a reserved
  `SubEnvelope` singleton (`SPENDABLE_ENVELOPE_ID`), not a separate type.
- **Balances are always derived** (SUM/GROUP BY over the transaction ledger), never stored as a
  column or duplicated field.
- **No magic numbers** for cutoff day, payday, or currency codes — these belong in
  `packages/shared/config` (not yet created).
- Lint enforces `no-explicit-any` (error), `no-non-null-assertion` (error), `complexity` capped at
  10, and `max-lines-per-function` capped at 60 (see `packages/config/eslint.config.mjs`).
- Package scope is `@gastos/*` (`@gastos/shared`, `@gastos/config`, `@gastos/server`,
  `@gastos/mobile`).
- **Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/)**
  (`feat:`, `fix:`, `chore:`, `docs:`, `test:`, `refactor:`, etc.).
- **Once an increment's exit criteria are verified (lint/typecheck/build/test clean),
  commit the changes and push to `origin`.** This is an orchestrator-level action, not
  something `gastos-coder`/`gastos-tester` do themselves — per the delegation protocol,
  neither agent self-certifies its own work as done, so committing/pushing happens only
  after independent verification, by whoever is running the orchestrator session.

## Architecture reference

The target architecture (accounts, envelopes, ledger, credit-card cycles, budget periods,
reporting) is documented in `req/accounts-xls-hld.md` — read §3 (Target Architecture) and §4
(Module Map) before implementing domain logic. `req/what-i-want.txt` has the original informal
feature list. Neither the database schema nor any domain module exists yet; this file will grow
conventions as each increment lands.
