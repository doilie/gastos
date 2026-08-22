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

Increment 18 (mobile data wiring, part 1) is complete: `apps/mobile/lib/trpc.ts` sets up a tRPC
React Query client typed against `@gastos/server`'s `AppRouter` (type-only import, never bundles
server runtime code), wired into `apps/mobile/app/_layout.tsx` via `trpc.Provider`/
`QueryClientProvider` (hardcoded to `http://localhost:3000/trpc` — dev-only, no env-config system
exists yet). The Today tab now calls `ledger.spendableBalance.useQuery()` and renders real data;
the other 5 tabs are still `PlaceholderScreen` stubs.

Increment 19 (mobile data wiring, part 2) is complete: `apps/mobile/components/QuickAddForm.tsx`
adds the app's P0 quick-add flow to the Today screen, scoped to the "defaults to Spendable" path
(no account/envelope/card picker yet). Entered amounts are always treated as an expense and
negated before calling `ledger.addTransaction`; `findSpendableAccountId` resolves which of
Spendable's linked accounts to post against (the first one — picking among several is deferred).
On success, invalidates `ledger.spendableBalance` via `trpc.useUtils()` so the balance updates
immediately.

Increment 20 (mobile data wiring, part 3) is complete: the Envelopes tab
(`apps/mobile/app/(tabs)/envelopes.tsx`) shows envelope groups → sub-envelopes, each with its
derived balance fetched per-item via `trpc.useQueries` (the correct pattern for a dynamic number
of parallel queries — never call a tRPC query hook in a `.map()`/loop directly). The reserved
Spendable envelope is excluded (already shown on Today).

Increment 21 (mobile data wiring, part 4) is complete: the Cards tab
(`apps/mobile/app/(tabs)/cards.tsx`) shows each `CreditCard`'s current billing cycle — date range,
total spend, and purchase list — computed client-side via the existing pure `cardCycleContaining`/
`sumCardPurchasesInCycle`/`isDateWithinCardCycle` functions (no new server endpoints). Drilling
into past cycles and settlement/payment-allocation UI are later increments. Budget/Reports/More
are still `PlaceholderScreen` stubs.

Increment 22 begins the Budget/Payday domain thread (nothing existed for it before): `PaydaySchedule`
(`packages/shared/src/reference/payday-schedule.ts`) models the configured day(s)-of-month
payday(s) happen, reusing the same clamp-to-last-day-of-month technique as `CreditCard.cutoffDay`
so "last day of month" falls out of a day-31 entry naturally. `paydaysInMonth` computes actual
payday dates for a given month. The HLD's own open item (non-banking-day shift rule) is
deliberately unresolved — raw calendar days only. `BudgetLine`/allocation logic (`packages/shared/src/domain/budget-line.ts`) is now built:
`BudgetLine` is the allocation record ("this much of this payday's salary goes to this
sub-envelope"), and `applyBudgetLine` turns a confirmed line into a real ledger `Transaction`,
mirroring `CardPurchase`/`settleCardPurchase`'s caller-supplies-the-account-explicitly pattern but
without a `FundingSource` union (a budget line always targets exactly one sub-envelope). Unlike
`settleCardPurchase`, it does not negate the amount — allocating is a credit. `applyBudgetLines`
(same file) is the batch version — mirrors `settleCardCycle`'s resolve-and-report pattern, but
with no automatic "unfunded"-style skip (every `BudgetLine` is inherently ready to apply, unlike a
`CardPurchase`) and no built-in period/payday filtering (the caller pre-scopes the list). This
completes the Budget thread's core logic: `PaydaySchedule` → `BudgetPeriod` → `PaydayWindow` →
`BudgetLine`/`applyBudgetLine`/`applyBudgetLines`. A read-only `budget` router
(`apps/server/src/routers/budget.ts` — `paydaySchedules`/`budgetLines`) exposes the seeded
`PaydaySchedule` and 2 `BudgetLine`s. `budget.applyBudgetLine`
applies a single seeded `BudgetLine` into the ledger (mirroring `ledger.addTransaction`'s
validation style); it does not mark the line as "applied," so re-applying the same id currently
creates a second transaction (accepted limitation, not part of the current data model). `budget.applyBudgetLines` is the batch version — mirrors `applyBudgetLines`/`settleCardCycle`'s
resolve-per-item pattern; since tRPC input is JSON, the caller-supplied `{budgetLineId,
accountId}` list becomes the resolver itself (every seeded `BudgetLine` is attempted; any id
absent from the list lands in `skippedLines`, not an error). The Budget tab UI landed in
Increment 25.

Increment 23 continues the Budget thread: `BudgetPeriod`
(`packages/shared/src/domain/budget-period.ts`) is the calendar-month budgeting window — unlike a
card cycle or the upcoming `PaydayWindow`, it never straddles a month boundary (it IS the calendar
month), so no cutoff-day clamping or cross-month shifting is needed. `budgetPeriodContaining`/
`budgetPeriodRange`/`isDateWithinBudgetPeriod` mirror `CardCycle`'s pure-derived-value shape (no
id).

Increment 24 completes the period-math piece of the Budget thread: `PaydayWindow`
(`packages/shared/src/domain/payday-window.ts`) is the "how much can I spend per day" period —
one payday through the day before the next. Unlike `CardCycle`/`BudgetPeriod`, a `PaydaySchedule`
can configure multiple paydays per month, so `paydayWindowContaining` gathers candidate paydays
from the previous, current, and next month before bracketing the target date; a strict `>`
comparison correctly handles the case where two different configured days clamp to the same
actual date in a short month, with no explicit dedup step needed. `BudgetLine`/allocation logic
(tying a payday's income to envelope allocations and the ledger) is the remaining piece of this
thread.

Increment 25 wires the Budget tab (`apps/mobile/app/(tabs)/budget.tsx`) to live data, replacing its
`PlaceholderScreen` stub — read-only display of every seeded `PaydaySchedule` (name plus configured
payday days) and `BudgetLine` (target sub-envelope resolved to a friendly name via
`trpc.reference.subEnvelopes`, falling back to the raw id if unmatched, plus description/date/
amount), mirroring how Envelopes/Cards were wired before it. No apply/confirm mutation UI yet —
wiring `budget.applyBudgetLine`/`applyBudgetLines` into the screen is a deliberate follow-up
increment, the same pattern Today's quick-add form followed after its own initial read-only
wiring. This is the last of the 6 tabs to move off `PlaceholderScreen` except Reports/More, which
have no underlying domain data yet.

Increment 26 adds that follow-up: each `BudgetLineRow` now has an "Apply" control wiring
`budget.applyBudgetLine` into the ledger. Since a `SubEnvelope` can span multiple accounts, the
control auto-applies against the target sub-envelope's one linked account when there's exactly
one, or reveals an inline account-name picker (`trpc.reference.accounts`) when there's more than
one, or disables Apply when there are none — mirroring `QuickAddForm`'s collapsed-button-to-
inline-controls pattern rather than introducing a new picker component. Success/error render as
transient per-row status text only; per the already-documented accepted limitation that
`applyBudgetLine` doesn't mark a line "applied" server-side, this status intentionally does not
persist past the component's lifetime (it resets on navigating away and back), and re-tapping
Apply on an already-applied line still creates a second transaction. This completes the Budget
thread's UI. Only Reports/More remain as `PlaceholderScreen` stubs.

Increment 27 wires the More tab (`apps/mobile/app/(tabs)/more.tsx`) to live data, replacing its
`PlaceholderScreen` stub — read-only display of every `Account` (name, currency) and `Category`
(name, with an inline `" (income)"` suffix when `isIncome`), using the existing
`trpc.reference.accounts`/`categories` queries with no server-side changes. No settings, no CRUD,
no archived-account filtering/styling — all deliberately out of scope, same "read-only display
first" pattern every other tab followed. Only Reports remains as a `PlaceholderScreen` stub.

Increment 28 begins the Reporting thread — the topmost layer in this codebase's one-directional
layering (Reporting → Domain → Ledger Core → Reference), previously empty. Its directory,
`apps/server/src/reporting/**`, was already mapped in `packages/config/eslint.config.mjs`'s
`eslint-plugin-boundaries` config (allowed to import Domain/Ledger Core/Reference/money) but had no
files until now. `buildCategorySpendingReport`
(`apps/server/src/reporting/category-spending.ts`) is the pure aggregator behind
`req/what-i-want.txt`'s "spending per category per month vs income per month" report: sums
transaction amounts per non-income category (only categories with a contributing transaction are
listed, sorted by id) and separately across income categories, for a given `BudgetPeriod`.
Transactions with `categoryId: null` (e.g. envelope allocations from `applyBudgetLine`) or an
unresolvable `categoryId` are silently skipped — this is a pure aggregator, not a validator.
Totals stay signed per the existing `Transaction.amount` convention (a spending category's total
is typically negative; no flip to an absolute "amount spent" figure). No server router or UI
wiring yet — mirrors how the Budget thread started with pure domain logic before any server/UI
work.

Increment 29 exposes that report via a new read-only `reporting` tRPC router
(`apps/server/src/routers/reporting.ts`) — `reporting.categorySpending` takes Zod-validated
`{year, month}` and calls `buildCategorySpendingReport` against the store's transactions and
categories. An out-of-range or nonexistent year/month is not an error, it just yields an empty
report (mirroring `deriveAccountBalance`/`deriveSubEnvelopeBalance`'s zero-for-no-match behavior);
only Zod schema violations (e.g. `month` outside 1-12) return `BAD_REQUEST`. Live-verified via curl
against the seeded 2026-08 data before handoff. The Reports tab UI is the remaining piece of this
thread.

Increment 30 wires the Reports tab (`apps/mobile/app/(tabs)/reports.tsx`) to live data, replacing
its `PlaceholderScreen` stub — read-only display of the current calendar month's income total and
per-category spending (`reporting.categorySpending`), category ids resolved to friendly names via
`trpc.reference.categories` (fallback to the raw id if unmatched, same pattern as every other
tab). No month picker/navigation to past or future months — current month only, matching the "MVP
read-only first" scope every other tab followed (Cards shows only the current billing cycle,
Budget has no apply-tracking). This is the last of the 6 tabs to move off `PlaceholderScreen`,
completing the Reporting thread's UI. `apps/mobile/app/(tabs)/screens.test.tsx` (the shared
placeholder-screen smoke test) was deleted — its `it.each` table had gone empty once every tab
graduated to its own dedicated test file, which made `it.each([])` throw and broke the mobile
suite; this was a real bug caught and fixed as part of this increment, not a hypothetical.
`PlaceholderScreen` itself and its own test remain, available for any future stub screen.

Increment 31 begins the "More tab CRUD" thread (`req/what-i-want.txt`: "account crud", "category
crud") with a Create-only slice: `reference.createAccount`/`createCategory` tRPC mutations.
Update/Archive/Delete are deferred to later increments. Both generate the entity id server-side via
`randomUUID()`, build it through the existing `@gastos/shared` factory, and append to the store
(`accounts`/`categories` are now internally-mutable arrays, mirroring `transactions`). Validation
errors (a malformed currency code, an empty name) propagate unwrapped as plain `Error`s rather than
`TRPCError`s — surfacing as 500/`INTERNAL_SERVER_ERROR`, not 400/`BAD_REQUEST` — matching
`ledger.addTransaction`'s existing convention for domain-level validation failures (only Zod
shape-validation failures return `BAD_REQUEST`). No UI wiring yet — the More tab's "+ Add" forms
are the next piece of this thread.

Increment 32 wires that UI: the More tab (`apps/mobile/app/(tabs)/more.tsx`) now has inline "+ Add
account" and "+ Add category" forms below each section's list, calling
`reference.createAccount`/`createCategory` and mirroring `QuickAddForm`'s collapsed-button-to-
inline-controls pattern. Currency is auto-uppercased as the user types and locally validated to
exactly 3 letters before Save enables (client-side shape check, ahead of the server's own
`currencyCodeFromString` validation). The income/expense toggle is a plain `Pressable` flipping a
local boolean (not React Native's `Switch` — nothing else in this codebase uses it). This completes
the Create half of the "More tab CRUD" thread; Update and Archive/Delete remain separate, later,
not-yet-scoped increments.

Increment 33 adds the server side of Update: `updateAccount`/`updateCategory`
(`packages/shared/src/reference/account.ts`/`category.ts`) apply a partial update (`name`/
`currency` for accounts, `name`/`isIncome` for categories) — `id` and, for accounts, `isArchived`
are never touched by these functions (`isArchived` belongs to the separate, not-yet-scoped
"Archive" increment). `reference.updateAccount`/`updateCategory` tRPC mutations wrap them with the
existing `assertIdExists`/`NOT_FOUND` lookup pattern and the same unwrapped-`Error`-propagation
convention as `createAccount`/`createCategory` (a malformed currency or empty name surfaces as
500, not 400). `apps/server/src/store.ts` gained `replaceAccount`/`replaceCategory`
(findIndex-and-overwrite, mirroring `addAccount`/`addCategory`'s trust-the-caller-already-
validated split). Live-verified via curl. No UI wiring yet — edit controls in the More tab are the
next piece of this thread.

Increment 34 wires that UI: each account/category row in the More tab now has an "Edit" control
that reveals pre-filled `name`/`currency` (accounts) or `name`/`isIncome` (categories) fields,
mirroring the existing "+ Add" forms' structure but pre-populated and calling
`reference.updateAccount`/`updateCategory`. Cancel reverts any uncommitted changes back to the
row's current saved values (not a blank state) and exits edit mode without saving. This completes
the "More tab CRUD" thread's Create+Update UI; Archive/Delete remains a separate, later,
not-yet-scoped increment.

Increment 35 completes the server side of the "More tab CRUD" thread: `archiveAccount`/
`unarchiveAccount` (`packages/shared/src/reference/account.ts`) toggle only `isArchived`, exposed
via `reference.archiveAccount`/`unarchiveAccount` mutations. An account's "delete" is this
reversible archive rather than a hard delete, since historical `Transaction.accountId` values must
keep resolving. `reference.deleteCategory` is a real removal from the store — but rejected with
`BAD_REQUEST` when any `Transaction` or `CardPurchase` still references the category's id (checked
via `getTransactions()`/`getCardPurchases()`), for the identical referential-integrity reason;
`Category` has no `isArchived` field, so unlike accounts, an unreferenced category is genuinely
deleted, not archived. `apps/server/src/store.ts` gained `deleteCategory` (find-and-splice).
Live-verified via curl. No UI wiring yet — Archive/Delete controls in the More tab are the
remaining piece before this thread reaches the app.

Increment 36 wires that UI, completing the "More tab CRUD" thread end-to-end: each account row
gets an Archive/Unarchive toggle (label reflects `isArchived`, no confirmation since it's
reversible) plus an `" (archived)"` suffix on the currency line when archived — archived accounts
are not filtered out of the list, just labeled. Each category row gets a Delete control that
reveals an inline "Delete this category?" confirmation before calling the mutation (Cancel never
mutates); on rejection it surfaces the mutation's actual server error message (e.g. "still in
use") via `error?.message`, falling back to a generic message only if that's empty, rather than
always showing a generic error like every other form in this app does — a deliberate exception,
since this rejection reason is specific and user-actionable. This is the last piece of the "More
tab CRUD" thread (`req/what-i-want.txt`'s "account crud"/"category crud").

Increment 37 begins the "Envelope CRUD" thread (`req/what-i-want.txt`: "envelope crud",
"sub-envelope crud"), following the same phased pattern as the completed "More tab CRUD" thread —
Create first. `reference.createEnvelopeGroup`/`createSubEnvelope` tRPC mutations wrap the
`EnvelopeGroup`/`SubEnvelope` factories already in `packages/shared/src/reference/envelope.ts`
(no new shared domain logic needed this time — those factories already existed and already
validate name/`accountIds`). `createSubEnvelope` validates `groupId` and every `accountIds` entry
resolve to a real `EnvelopeGroup`/`Account` (`NOT_FOUND` otherwise) before calling the factory,
which does its own non-empty-name/no-duplicate-`accountIds`/reserved-Spendable-id checks
(propagating unwrapped as 500, same convention as `createAccount`/`createCategory`). Update and
Archive/Delete for envelopes are separate, later, not-yet-scoped increments — same sequencing as
Account/Category followed. No UI wiring yet. Live-verified via curl.

Increment 38 wires that UI: the Envelopes tab (`apps/mobile/app/(tabs)/envelopes.tsx`) gets a
top-level "+ Add group" form and a per-group "+ Add sub-envelope" form (the enclosing
`EnvelopeGroupSection` supplies `groupId` implicitly — no group picker needed), mirroring the More
tab's "+ Add" pattern. Since `createSubEnvelope` requires a non-empty `accountIds`, its form adds
an `AccountMultiSelect` — one `Pressable` row per `Account` (a new query this screen didn't
previously make), tapping toggles membership in a local selected set (marked with a "✓ " prefix),
unlike `budget.tsx`'s single-select `AccountPicker` which closes on pick. Update and
Archive/Delete for envelopes remain separate, later, not-yet-scoped increments.

Increment 39 adds the server side of Update for envelopes: `updateEnvelopeGroup`/
`updateSubEnvelope` (`packages/shared/src/reference/envelope.ts`) mirror `updateAccount`/
`updateCategory` — partial `name` update for `EnvelopeGroup`, partial `name`/`accountIds` update
for `SubEnvelope`. Neither `id` nor (for `SubEnvelope`) `groupId` is ever touched — moving a
sub-envelope to a different group is a separate, later increment. `reference.updateEnvelopeGroup`/
`updateSubEnvelope` tRPC mutations wrap them with the same `NOT_FOUND`/unwrapped-`Error`
conventions used throughout `reference.ts`. `apps/server/src/store.ts` gained
`replaceEnvelopeGroup`/`replaceSubEnvelope`. Live-verified via curl. No UI wiring yet — Archive/
Delete for envelopes is the remaining piece of this thread's server side, and edit controls in the
Envelopes tab are the remaining UI piece.

Increment 40 wires that UI: the Envelopes tab (`apps/mobile/app/(tabs)/envelopes.tsx`) gets inline
Edit controls mirroring the More tab's edit pattern — `EnvelopeGroupSection`'s heading gets an
"Edit" control revealing a pre-filled name input, and each `SubEnvelopeRow` gets an "Edit" control
that fully replaces its balance display with a pre-filled name input plus the existing
`AccountMultiSelect` (pre-selected to the sub-envelope's current `accountIds`). Both mirror
`more.tsx`'s collapsed-button-to-inline-fields pattern: Cancel reverts to the saved values (never
blanks) without calling the mutation, Save calls `updateEnvelopeGroup`/`updateSubEnvelope`. This
completes the Envelopes tab's Create+Update UI; Archive/Delete for envelopes remains the last
unstarted piece of the Envelope CRUD thread, on both the server and UI sides.

`apps/server` registers `@fastify/cors` (`{ origin: true }`, permissive — no deployment/auth
exists yet) in `index.ts`, before the tRPC plugin. Without it, `apps/mobile`'s web build (a browser
context) silently fails to read any API response — `curl` doesn't enforce CORS so it looks fine,
but a browser blocks the fetch, which surfaced as Today/Envelopes stuck on "Loading…" forever. If
a screen is stuck loading, check (1) is `apps/server`'s dev server actually running
(`pnpm --filter @gastos/server dev`), then (2) does the response carry
`access-control-allow-origin` for a cross-origin request — `apps/server/src/index.test.ts` guards
against a regression of the latter.

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

Increment 15 (server layer, part 3) is complete: `ledger.accountBalance`/`ledger.subEnvelopeBalance`
are the first tRPC procedures in this codebase to take input, using Zod for shape validation plus
a shared `assertIdExists` helper that throws a `NOT_FOUND` `TRPCError` when an id doesn't
correspond to a real seeded entity (the underlying `deriveAccountBalance`/
`deriveSubEnvelopeBalance` correctly return zero for no matches, which is right for those pure
functions but wrong for an API — this distinguishes "zero balance" from "doesn't exist"). All
mutation procedures are still deferred.

Increment 16 (server layer, part 4) is complete: the store now seeds a `CreditCard` and 3
`CardPurchase`s (one per `FundingSource` kind — account/envelope/none), exposed read-only via a
new `cards` router (`creditCards`/`cardPurchases`). Cycle computation
(`cardCycleContaining`/`sumCardPurchasesInCycle`) is left to the client, called directly against
this raw data. All read endpoints a UI needs now exist.

Increment 17 (server layer, part 5) is complete: `ledger.addTransaction` is the first mutation
procedure in this codebase — the app's quick-add write path, covering both the Spendable and
envelope cases. `amount` is a signed decimal string parsed via `parseCents` (matching what a human
types), the transaction id is generated server-side, and every referenced id is validated to exist
via the existing `NOT_FOUND` pattern. The store's `transactions` array is now internally mutable
(`addTransaction` in `store.ts`) while `getTransactions()` still returns a readonly view. A
separate credit-card-purchase-creating mutation, and CRUD for reference entities, are still
deferred.

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
- **Non-route files must live outside `apps/mobile/app/`.** Expo Router's route root is `app/`
  (confirmed via the dev bundle's `transform.routerRoot=app` query param) — any `.tsx` file under
  it becomes a route, including plain shared components, *even inside a leading-underscore
  directory* (e.g. `app/(tabs)/_components/`) — that convention does NOT exclude a directory from
  routing here, only `_layout.tsx`/similar special filenames are special-cased, plus whatever
  `metro.config.js`'s `resolver.blockList` explicitly excludes (currently just `*.test.tsx`/
  `*.spec.tsx`). This bit us once: `PlaceholderScreen.tsx` inside `_components/` was picked up as
  its own route with no default export, producing a spurious extra tab that errored on navigation.
  Shared/non-screen components belong in `apps/mobile/components/` (sibling to `app/`), never
  inside the route tree.
- **`@testing-library/react-native@14`'s `fireEvent.press`/`fireEvent.changeText` are async and
  must be `await`ed.** Without `await`, the `act()`-wrapped state update doesn't flush before the
  next assertion — the press/change silently appears to do nothing (no thrown error, just a stale
  query result). Every interactive RNTL test in this repo must `await fireEvent...(...)`.

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
