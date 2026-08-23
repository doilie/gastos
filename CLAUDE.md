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

Increment 41 adds the server side of Archive/Delete for envelopes: unlike the Account/Category
split, the referential-integrity shape flips here. `SubEnvelope` gained `isArchived: boolean`
(`packages/shared/src/reference/envelope.ts`), and `archiveSubEnvelope`/`unarchiveSubEnvelope`
mirror `archiveAccount`/`unarchiveAccount` exactly — because `Transaction.subEnvelopeId` is a
required, non-null field (same as `Transaction.accountId`), so a sub-envelope's "delete" must be a
reversible archive, not a hard delete. `archiveSubEnvelope` throws (unwrapped `Error`, surfacing as
500) if given the reserved `SPENDABLE_ENVELOPE_ID` — Spendable can never be archived;
`unarchiveSubEnvelope` has no such restriction. `EnvelopeGroup`, conversely, gets a guarded hard
delete mirroring `deleteCategory` — nothing in the ledger references `EnvelopeGroupId` directly
(only `SubEnvelope.groupId` does), so `reference.deleteEnvelopeGroup` rejects with `BAD_REQUEST`
when any `SubEnvelope` still has a matching `groupId`, otherwise removes it via the store's new
`deleteEnvelopeGroup` (find-and-splice, mirroring `deleteCategory`'s store function).
`reference.archiveSubEnvelope`/`unarchiveSubEnvelope` reuse the existing `replaceSubEnvelope` store
function. No UI wiring yet — Archive/Delete controls in the Envelopes tab are the last remaining
piece of the Envelope CRUD thread.

Increment 42 wires that UI, completing the "Envelope CRUD" thread end-to-end: `SubEnvelopeRow` gets
an Archive/Unarchive toggle plus an `" (archived)"` name suffix, mirroring `more.tsx`'s
`AccountRow` archive pattern exactly (archived sub-envelopes stay visible in the list, not
filtered). `EnvelopeGroupSection`'s heading gets a Delete control with an inline "Delete this
group?" confirmation, mirroring `more.tsx`'s `CategoryRow` delete pattern exactly — including
surfacing the mutation's specific server error message (e.g. "still in use") over a generic
fallback, the same deliberate exception `CategoryDeleteConfirm` already established. The reserved
Spendable envelope never reaches this screen's `SubEnvelopeRow` (already filtered out by
`groupId !== null`), so no UI-side special-casing was needed for its archive rejection. This is
the last piece of the "Envelope CRUD" thread (`req/what-i-want.txt`'s "envelope crud"/"sub-envelope
crud").

Increment 43 begins a new "real database" thread: `packages/db` (`@gastos/db`) is a new,
server-only workspace package holding a Drizzle ORM schema (10 tables covering the Reference/
Ledger Core/Domain layers) plus a lazy-connecting Postgres client factory (`createDbClient`) and
`drizzle-kit` migration tooling, backed by a root `docker-compose.yml` for local Postgres. This is
pure infrastructure — nothing in `apps/server` consumes it yet; `store.ts`'s in-memory arrays are
still the only thing any router reads from. Deliberately kept OUT of `packages/shared` (despite
that package's original Increment-1 placeholder description mentioning "Drizzle types," now
corrected) since `packages/shared` is also bundled into `apps/mobile` via Metro, and this repo has
twice already been bitten by Metro breaking on an incompatible transitive dependency — `packages/db`
is a dependency of `apps/server` only. Column types mirror the branded domain types directly
(branded ids → `text`, `Cents` → `integer`, date strings → `date`); `SubEnvelope.accountIds`
becomes a join table (`sub_envelope_accounts`) since each entry is itself a foreign key, whereas
`PaydaySchedule.paydayDaysOfMonth` uses a native Postgres integer array (no foreign keys involved,
a fixed-shape config value); `CardPurchase`'s `FundingSource` discriminated union is flattened into
`fundingSourceKind` (`NOT NULL`, always one of `"account"`/`"envelope"`/`"none"`) plus two nullable
variant-specific id columns. Testcontainers-based integration tests exist
(`packages/db/src/schema/schema.integration.test.ts`) but are `describe.skip`-marked — Docker is
not installed in this development environment — plus a real, runnable unit test for the client
factory exploiting the `postgres` driver's lazy-connect behavior. The next increments in this
thread: wiring a live Postgres connection into `apps/server` and swapping `store.ts`'s in-memory
functions over to real Drizzle queries, one layer at a time (Reference first).

Increment 44 begins a "Cards tab" enhancement thread with billing-cycle drilldown: the Cards tab
(`apps/mobile/app/(tabs)/cards.tsx`) previously always showed the cycle containing today, with no
navigation. `CreditCardSection` now holds local `referenceDate` state (defaulting to today) and
computes its displayed cycle from that instead — a new `CycleNavigation` sub-component adds "‹
Prev"/"Next ›" controls, using a new `shiftLedgerDateByDays` helper to jump to one day before/after
the currently-displayed cycle's start/end (always landing in the adjacent cycle, since cycles are
contiguous and non-overlapping). "Next ›" disables itself whenever the displayed cycle already
contains the real today — there's nothing further forward to show. This is a UI-only change; no
server/router changes were needed since the cycle math (`cardCycleContaining`) is already a pure
client-callable function of `(cutoffDay, anyReferenceDate)`. Settling a single purchase
(`cards.settleCardPurchase`, wrapping the existing `settleCardPurchase` domain function) and
settling a whole cycle (`cards.settleCardCycle`) are the next, separate increments in this
thread — both need new `cards` router mutations that don't exist yet (today's `cards` router is
entirely read-only).

Increment 45 adds the server side of "settle a single purchase": `cards.settleCardPurchase`
wraps the existing `settleCardPurchase` domain function (`packages/shared/src/domain/
card-settlement.ts`), mirroring `budget.applyBudgetLine`'s established shape exactly — the caller
supplies `accountId`/`subEnvelopeId` explicitly (input `{purchaseId, accountId, subEnvelopeId}`),
the domain function validates them against the purchase's declared `FundingSource`, and any
validation error (unfunded purchase, mismatched account/envelope) propagates unwrapped as a
500/`INTERNAL_SERVER_ERROR`, not a `TRPCError`. For an envelope-funded purchase, the router
resolves the funding `SubEnvelope` from the store itself (not caller-supplied). Like
`applyBudgetLine`, this does not mark the source `CardPurchase` as "settled" — re-settling the
same `purchaseId` creates a second `Transaction` (same accepted limitation, not a bug). No UI
wiring yet — a Settle control per purchase row is the next, separate increment, followed by the
multi-purchase "Settle cycle" batch mutation/UI after that.

Increment 46 wires that UI: each `CardPurchaseRow` (`apps/mobile/app/(tabs)/cards.tsx`) gets a
`CardPurchaseSettleControls` component calling `cards.settleCardPurchase`, mirroring
`budget.tsx`'s `BudgetLineApplyControls`/`AccountPicker` pattern exactly (auto-settle when there's
exactly one candidate account, an inline picker when there's more than one, a disabled button when
there are none). The candidate accounts and the fixed `subEnvelopeId` are derived from the
purchase's `FundingSource`: account-funded purchases always settle against that one account,
defaulting `subEnvelopeId` to the reserved Spendable envelope (this app's established
"defaults to Spendable" convention, see `QuickAddForm`); envelope-funded purchases must settle
against their funding `SubEnvelope`'s own linked accounts, with `subEnvelopeId` fixed to that
envelope's id; unfunded (`"none"`) purchases render only a "Not funded yet" label — no
assign-funding-source flow exists yet, so they can't be settled from this screen. `CardsScreen` now
also queries `reference.subEnvelopes`/`reference.accounts` (new queries this screen didn't
previously make) to resolve envelope-funded candidates and account display names. Same accepted
"not marked settled" limitation as `applyBudgetLine`. The multi-purchase "Settle cycle" batch
mutation/UI remains the last piece of this thread.

Increment 47 adds the server side of "Settle cycle": `cards.settleCardCycle` wraps the existing
`settleCardCycle` domain function (`packages/shared/src/domain/card-cycle-settlement.ts`),
mirroring `budget.applyBudgetLines`'s established batch shape exactly — the caller supplies
`creditCardId` plus the exact `cycleStart`/`cycleEnd` window it computed client-side (the server
never recomputes "today"'s cycle itself, since the user may be viewing a past cycle via the
existing Prev/Next drilldown) and a `settlements` list of `{purchaseId, accountId, subEnvelopeId}`
triples for whichever in-cycle purchases it wants settled right now. An in-cycle purchase that's
unfunded, or whose id is simply absent from `settlements`, lands in the response's
`skippedPurchases` — not an error, mirroring `applyBudgetLines`'s "unlisted item = skipped"
semantics; a genuine domain-level mismatch (e.g. an account not linked to a purchase's funding
envelope) still fails the whole request as an unwrapped 500, same as `settleCardPurchase`. The
router filters the store's `CardPurchase`s to the given `creditCardId`'s own purchases before
calling the domain function, since `settleCardCycle` itself only filters by date window, not by
card. Same accepted "nothing marked settled" limitation as `settleCardPurchase`. No UI wiring
yet — a "Settle cycle" action is the last remaining piece of the Cards tab enhancement thread.

Increment 48 wires that UI, completing the Cards tab enhancement thread end-to-end:
`SettleCycleControls` (`apps/mobile/app/(tabs)/cards.tsx`) settles every UNAMBIGUOUS purchase
(exactly one candidate account) in the currently-displayed cycle in one `cards.settleCardCycle`
call — reusing the exact same `candidateAccountIdsForPurchase`/`settlementSubEnvelopeIdForPurchase`
helpers the per-purchase `CardPurchaseSettleControls` already uses, via a new pure
`buildUnambiguousSettlements` filter. Purchases needing a picker (2+ candidate accounts) or
unfunded ones are deliberately left out of the batch — no new multi-account disambiguation UI was
built for this flow, matching this app's established MVP-first pattern; the server correctly
reports them back in `skippedPurchases`, and the user settles those individually via their own
row's existing control instead. The success summary text reads `settledTransactions.length`/
`skippedPurchases.length` off the mutation's own response, not a local recomputation from what was
sent. This completes the Cards tab enhancement thread: billing-cycle drilldown, single-purchase
settle, and settle-cycle are all now live.

Increment 49 adds month navigation to the Reports tab (`apps/mobile/app/(tabs)/reports.tsx`),
which previously always showed the current calendar month with no way to browse others.
`ReportsScreen` now holds local `period` state (`{year, month}`, defaulting to the current month)
instead of computing it fresh on every render, and a new `MonthNavigation` component adds Prev/Next
controls mirroring `cards.tsx`'s `CycleNavigation` pattern exactly — Next disables itself once back
at the real current month. A new pure `shiftYearMonth` helper (reimplementing the same
year-rollover technique as `card-cycle.ts`'s internal, unexported `shiftMonth`) handles the
month-arithmetic. This was UI-only — no server changes were needed since
`reporting.categorySpending` already accepted an arbitrary `{year, month}` and returns an empty
report for months with no data rather than erroring.

Increment 50 fixes a real bug that was previously documented as an accepted limitation:
`budget.applyBudgetLine` didn't mark a `BudgetLine` as applied, so re-applying the same id silently
created a second ledger `Transaction` (double-posting the allocation). `BudgetLine` now carries a
persisted `isApplied: boolean` (`packages/shared/src/domain/budget-line.ts`, mirroring
`Account.isArchived`), with a new `markBudgetLineApplied` setter. `applyBudgetLine` now throws
(unwrapped `Error`, surfacing as 500) when called on an already-applied line — checked before its
existing account/envelope-mismatch validation. The batch `applyBudgetLines` auto-skips
already-applied lines straight into `skippedLines` without even calling the resolver, mirroring
`settleCardCycle`'s auto-skip of unfunded purchases. `apps/server/src/store.ts`'s `budgetLines`
array is now mutable with a new `replaceBudgetLine`, and both router mutations persist the applied
state via `markBudgetLineApplied`/`replaceBudgetLine` for every line actually applied. Fixing this
broke several pre-existing tests that relied on the old (buggy) ability to re-apply the same seeded
`BudgetLine` safely across test cases — since no `createBudgetLine` mutation exists to mint fresh
fixtures, `apps/server/src/routers/budget.test.ts` now deliberately budgets each of the 2 seeded
lines to exactly one successful application across the whole file's declaration order, documented
inline. No UI wiring yet — the Budget tab's `BudgetLineApplyControls` still only tracks "applied"
transiently per-component-lifetime; reflecting the now-real, persisted `isApplied` state (and
disabling re-apply) is the next, separate increment.

Increment 51 wires that UI, completing the `BudgetLine.isApplied` fix thread: `BudgetLineRow`
passes `line.isApplied` (real, server-persisted state from the `budget.budgetLines` query) into
`BudgetLineApplyControls`, which now renders ONLY a persistent "Applied" label — no button, nothing
clickable — whenever `isApplied` is `true`; the existing auto-apply/picker/disabled-when-no-
candidates logic (unchanged) moved into a new `PendingApplyControls` sub-component for the
not-yet-applied path. `applyBudgetLine`'s `onSuccess` now also invalidates `utils.budget.budgetLines`
alongside its existing invalidations — this is what makes a row transition to the persistent
"Applied" label via the query refetch, rather than the old transient `isSuccess`-only signal that
reset on remount. The old transient "Applied ✓" success text was removed as redundant (the transient
error text is unchanged). This directly fixes the specific bug the previous "accepted limitation"
described: navigating away from the Budget tab and back now correctly shows an already-applied
line as applied, instead of resetting to a fresh, re-postable "Apply" button.

Increment 52 begins consuming `packages/db` (scaffolded at Increment 43) for real: the Reference
layer (`Account`/`Category`/`EnvelopeGroup`/`SubEnvelope`) in `apps/server/src/store.ts` is no
longer an in-memory array — it's backed by a real Postgres connection via a new
`createReferenceStore(db)` factory (`apps/server/src/reference-store.ts`), with row↔branded-type
mapping done directly (`xFromString` constructors, not `createX` factories, since a DB row is
already trusted data). `apps/server/src/db.ts` loads `DATABASE_URL` from the repo-root `.env`
(resolved relative to the file, not the process cwd, since `pnpm --filter` may run with cwd set to
the package directory), exports the production `db`/`referenceStore` singletons, a migration
runner (`runMigrations`, applying `packages/db/drizzle` via `drizzle-orm/postgres-js/migrator`),
and an idempotent seed (`seedReferenceData`, `.onConflictDoNothing()`-based) reproducing the exact
fixture rows the old in-memory arrays hardcoded. `apps/server/src/index.ts`'s `start()` now runs
migrations then seeds before `fastify.listen`; `buildServer()` itself stays synchronous with no DB
side effects, so tests control migration/seed timing themselves. Every router touching
Reference-layer ids for validation (`reference.ts`, `budget.ts`, `cards.ts`, `ledger.ts`,
`reporting.ts`) was converted to `async`/`await`, fetching each list at most once per handler and
reusing it (each call is now a real DB round trip) rather than the old pattern of calling the same
getter multiple times per handler. `Transaction`/`CreditCard`/`CardPurchase`/`PaydaySchedule`/
`BudgetLine` are NOT yet DB-backed — they stay in-memory, now pointing at fixed id constants
exported from `db.ts` (`CHECKING_ACCOUNT_ID` etc.) instead of the old local `Account`/`Category`
objects; wiring those layers is deferred to later increments, "one layer at a time" per the
Increment-43 plan. Since every router now requires a real, seeded Postgres to resolve
Reference-layer lookups, `apps/server`'s router test files (`store.test.ts`,
`routers/{reference,budget,cards,ledger,reporting}.test.ts`) were converted from pure in-memory
unit tests to testcontainers-backed integration tests — each file spins its own ephemeral
`postgres:16-alpine` container in a `beforeAll` (setting `process.env.DATABASE_URL` before
dynamically `import()`-ing `../db`/`../store`/`../index`, since `db.ts` builds its singletons
eagerly at module-import time), migrates and seeds it, then tears it down in `afterAll` — this
moves these files from this codebase's ~65% unit tier into the ~22% testcontainers-integration
tier the test pyramid always budgeted for, not a scope regression. `packages/db/src/schema/
schema.integration.test.ts` (written at Increment 43 but `describe.skip`-marked because Docker
wasn't installed in this environment) is un-skipped and passing for real now that Docker Desktop is
available. A local dev Postgres is provisioned via the existing root `docker-compose.yml`
(`docker compose up -d`) plus a root `.env` copied from `.env.example`.

Increment 53 finishes the "real database" thread: every remaining table (`Transaction`/
`CreditCard`/`PaydaySchedule`/`CardPurchase`/`BudgetLine`) is now Postgres-backed too, following
Increment 52's `reference-store.ts` pattern exactly. `apps/server/src/ledger-store.ts`
(`createLedgerStore(db)`, `Transaction`) and `apps/server/src/domain-store.ts`
(`createDomainStore(db)`, `CreditCard`/`PaydaySchedule`/`CardPurchase`/`BudgetLine`) are the two new
store files — `CreditCard`/`PaydaySchedule` are schema-wise Reference-layer tables, but
`apps/server/src/store.ts` has always grouped them with `CardPurchase`/`BudgetLine` as one bucket,
so `domainStore` keeps doing so rather than folding them into `reference-store.ts`. Only `getX`/
`addTransaction`/`replaceBudgetLine` exist — no new mutation capability (`createCardPurchase`,
`createBudgetLine`, etc.) was added; this increment only ports what already existed as
read/write surface. `packages/db/src/schema/domain.ts`'s `budgetLines` table was missing the
`isApplied` column entirely (added to the shared `BudgetLine` type back at Increment 50, never
added to the DB schema) — added now (`packages/db/drizzle/0002_quick_harry_osborn.sql`), with no
DB-side default, matching this schema's existing convention for `isArchived`/`isIncome` (every
fixture/seed row sets it explicitly rather than relying on a default). `apps/server/src/db.ts`
gained a second idempotent seed function, `seedRemainingFixtureData` — deliberately kept separate
from `seedReferenceData` rather than merged into it, so seeding order stays explicit (it depends on
`seedReferenceData` having already populated the accounts/categories/sub-envelopes its rows'
foreign keys point at) and existing test files only needed one additional call, not a rewrite.
`apps/server/src/store.ts` is now a pure re-export barrel with no local state at all — every table
this app reads/writes lives behind `./db`'s three store singletons
(`referenceStore`/`ledgerStore`/`domainStore`). Every router touching these tables
(`ledger.ts`/`budget.ts`/`cards.ts`/`reporting.ts`) was converted to `async`/`await`, and several
helper functions that used to call a store getter directly from inside a synchronous resolver
callback (`resolveBudgetLineAndSubEnvelope`, `parseAndValidateApplications`, `findCardPurchase`,
`parseAndValidateSettlements`) were refactored to take an already-fetched list as a parameter
instead — the same pattern `findFundingSubEnvelope`/`resolveFundingSubEnvelope` already established
at Increment 52, since `applyBudgetLinesToLedger`/`settleCardCycleInLedger`'s resolver contract is
synchronous and can't itself `await`. The 6 testcontainers-backed test files from Increment 52 each
gained one additional `await dbModule.seedRemainingFixtureData(dbModule.db);` call in their
`beforeAll`, right after the existing `seedReferenceData` call. `apps/server/src/index.ts`'s
`start()` now runs `seedRemainingFixtureData(db)` after `seedReferenceData(db)`, before
`fastify.listen`. This completes the "real database" thread that began at Increment 43 — the
in-memory `store.ts` arrays are gone entirely, and every table (all 10 in `packages/db`'s schema)
is real, persisted, Postgres-backed data.

Increment 54 begins the "Transaction CRUD" thread (`req/what-i-want.txt`: "spendable transaction
crud", "other envelope transaction crud" — both are just `Transaction`, which doesn't structurally
distinguish spendable from envelope postings, so one CRUD surface covers both). Create/Read already
existed (`ledger.addTransaction`/`ledger.transactions`); this adds Update/Delete. `updateTransaction`
(`packages/shared/src/ledger-core/transaction.ts`) mirrors `updateAccount`'s partial-update
pattern exactly — `id` and `counterTransactionId` are excluded from the `updates` parameter's type
entirely (not just skipped at runtime), so misuse is a compile error; `counterTransactionId` is
excluded because transfer-pair editing (via `createTransferPair`, never actually invoked by any
router today) is out of scope for this increment, not because of any deeper invariant.
`ledger.updateTransaction`/`ledger.deleteTransaction` tRPC mutations wrap it and a new
`replaceTransaction`/`deleteTransaction` pair on `LedgerStore` (`apps/server/src/ledger-store.ts`),
following the same `NOT_FOUND`/unwrapped-`Error`-propagation conventions as `reference.ts`'s
`updateAccount`. `deleteTransaction` is a plain, unconditional hard delete with no
referential-integrity check — confirmed nothing else in this schema references a `Transaction.id`
by foreign key, unlike `Account`/`SubEnvelope`'s archive-based "delete." No UI wiring yet — a
transaction list with edit/delete controls is the next, separate increment in this thread (no
screen currently lists/edits individual transactions at all; the Today tab only shows the
Spendable balance and the create-only `QuickAddForm`).

Increment 55 wires that UI, completing the "Transaction CRUD" thread end-to-end: the Today tab
(`apps/mobile/app/(tabs)/index.tsx`) gained a `TransactionsSection` below the existing
Spendable-balance header/`QuickAddForm` — the full `Transaction` list, sorted most-recent-first by
date, each row with inline Edit/Delete controls mirroring `more.tsx`'s `AccountRow`/`CategoryRow`
pattern exactly. The screen's outer container switched from a fixed centered `View` to a
`ScrollView` (matching `more.tsx`/`reports.tsx`) since the list can now grow arbitrarily long; the
balance header still gates on its own query independently, so a slow transactions/categories fetch
never blocks it. The Edit form is **deliberately narrower than the underlying mutation**: only
`date`/`description`/`amount` are editable (mirroring `QuickAddForm`'s own "no account/envelope/
category picker yet" scope) — `categoryId`/`accountId`/`subEnvelopeId` show as read-only detail
text (category resolved to a friendly name via a `reports.tsx`-style `categoryName` helper,
`"Uncategorized"` for `null`). The amount field round-trips through `formatCents`/`parseCents`
directly (pre-filled with the real signed value, sent back as-is) rather than `QuickAddForm`'s
always-negate-a-positive-input convention, since here the user edits the true signed amount, not a
hardcoded-expense input. Delete mirrors `CategoryDeleteConfirm`'s inline confirmation shape, but
with only a generic fallback error message (no server-message passthrough) since
`deleteTransaction` can never produce a meaningful specific rejection reason (unconditional hard
delete, no referential-integrity check). This completes `req/what-i-want.txt`'s "spendable
transaction crud"/"other envelope transaction crud" — create (prior increments), read (this list),
update and delete (this thread) are all now live on the Today tab. Account/envelope/category
pickers on the edit form remain a separate, later, not-yet-scoped increment.

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
packages/shared     Zod schemas, domain logic. Consumed as TypeScript source directly
                    (no build step) — apps import from "@gastos/shared".
packages/db         Drizzle ORM schema and Postgres client. Server-only — apps/server
                    depends on it, apps/mobile never does (avoids bundling
                    Postgres-specific code into Metro's build).
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
  `@gastos/mobile`, `@gastos/db`).
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
feature list. A Postgres/Drizzle schema now exists (`packages/db`, Increment 43) but is not yet
wired into `apps/server` — the in-memory store is still authoritative; this file will grow
conventions as each increment lands.
