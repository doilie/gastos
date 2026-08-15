```markdown
# Personal Finance App — High-Level Design

**Source system:** `accounts-v2-2026.xlsx` — 24 sheets, ~2,900 transaction rows, 5 years of structure
**Objective:** a standalone app with functional parity, then room to grow
**MVP scope:** parity only
**Companion document:** `accounts-app-requirements.md` (114 numbered requirements)
**Version:** 1.0 · 2026-08-15

---

## 1. Executive Summary

The workbook is not 24 features. It is **one ledger, aggregated three ways**, wrapped in a
credit-card settlement engine and a monthly pay-allocation ritual.

That single insight collapses the entire migration. Fourteen sheets share the same five columns.
Every summary figure — every net-worth cell, every category total, every card balance — is a
`SUMIFS` over those rows. No balance is ever stored. Reproduce the ledger and the sign convention,
and every derived number follows automatically.

**What the app must preserve:** the ledger, the sign convention, the envelope-over-account grid,
the credit-card cycle mathematics, and the three independent period concepts.

**What the app should fix:** eleven catalogued defects, of which one is actively wrong today —
income totals read zero because the formulas were saved as text.

**What the app makes possible that the sheet cannot:** entry from a phone in three taps, real
reconciliation against bank balances, planned-vs-actual variance, and drill-through from any
number to the rows behind it.

---

## 2. Current State

### 2.1 Structure

| Layer | Sheets | Role |
|---|---|---|
| Ledger | 14 detail sheets | The only place data is entered. `Date · Description · Type · Account · Amount` |
| Derivation | Category Summary, Account Summary | Pure `SUMIFS` aggregation. Zero stored values |
| Settlement | CC Summary, CC Adjustments | Statement cycles, payment allocation |
| Planning | 5 monthly budget sheets | Pay allocation, planned spend |
| Analysis | Spending Patterns | Category matrix, income, daily allowance |
| Unstructured | Installment, RK Therapy | Free-form tracking |

### 2.2 What works well

- **Single-entry discipline.** One row per event, one place to look.
- **Total derivation.** Nothing can drift out of sync because nothing is duplicated.
- **The envelope-over-account grid.** `BDO Peso` simultaneously holds Savings, Insurance, RK,
  Travel and Investment money. The two-dimensional view is genuinely sophisticated.
- **The `Budget` virtual payer.** Marks a card charge as pre-funded so it doesn't double-count
  against cash. Elegant.
- **Paired postings.** A card purchase funded from Savings writes a matching negative row on
  Savings. Manual, but conceptually correct.

### 2.3 Where it breaks

| Class | Problem |
|---|---|
| **Silently wrong** | Income totals read 0 — formulas stored as text. Foreign-currency "Total" adds yen to koruna to pesos |
| **Fragile** | Renaming any account or category zeroes a summary column with no error. Hardcoded overrides sit inside formula ranges |
| **Manual** | Paired entries typed twice. Month sheets duplicated by hand. FX rates buried in description text |
| **Missing** | No planned-vs-actual link. No reconciliation against real balances. No history — only "now" |
| **Unusable on a phone** | Which is where spending actually happens |

Full defect register (D1–D11) in the companion document.

---

## 3. Target Architecture

### 3.1 Core principle

```
Accounts hold real money.
Envelopes are labelled claims on that money.
A transaction names both.
Every balance is a sum. Nothing is stored twice.
```

This makes explicit what the workbook does implicitly, and is what unlocks reconciliation: the sum
of all envelope claims on an account must equal that account's real bank balance.

### 3.2 Layer model

```
┌──────────────────────────────────────────────────┐
│  UI            Home · Ledgers · Cards · Budget · Reports
├──────────────────────────────────────────────────┤
│  Reporting     8 parity reports, all drill-through
├──────────────────────────────────────────────────┤
│  Domain        Envelopes · CC cycles · Budget periods
│                Allocations · FX · Integrity
├──────────────────────────────────────────────────┤
│  Ledger Core   Transactions · pairing · derivation
├──────────────────────────────────────────────────┤
│  Reference     Accounts · Envelopes · Categories
│                Currencies · Rates · Config
└──────────────────────────────────────────────────┘
        Local-first store · sync · Excel import/export
```

Strictly downward dependencies. Reporting never reaches past the domain layer; the domain layer
never stores a balance.

### 3.3 Key decisions

| # | Decision | Why it matters |
|---|---|---|
| A1 | Envelopes are virtual allocations over accounts | Enables reconciliation; matches the existing grid |
| A2 | Three independent period types, all first-class | Budget month, card cycle, and payday window genuinely differ. Unifying them would break all three |
| A3 | Balances always derived, never stored | Preserves the workbook's central invariant |
| A4 | Integer centavos everywhere | Kills floating-point residue permanently |
| A5 | Parity gate blocks release | Every figure must match the workbook to the centavo |
| A6 | Config becomes typed settings; FX becomes a dated series | Removes magic cells |
| A7 | Money is multi-currency at transaction level | 8 currencies exist today, not 2 |
| A8 | FX rate is a field, not prose | Makes realised gain/loss computable |
| A9 | Split `Type` into `category` and `currency` | One overloaded column currently means both |

### 3.4 The three period types

Deliberately **not** unified. Each answers a different question.

| Period | Boundary | Answers | Drives |
|---|---|---|---|
| **Budget month** | Calendar month | "How do I allocate this month's pay?" | Budget sheets, Advance Budget allotment |
| **Card cycle** | Cut-off day (17th) | "What do I owe this card, and from where?" | CC statement, payment split |
| **Payday window** | Payday → next payday − 1 (13–16 days, variable) | "How much can I spend per day?" | Daily allowance |

Every report states which window it is using. The UI never blurs them.

---

## 4. Module Map

| # | Module | Responsibility | MVP |
|---|---|---|---|
| M1 | Reference & Config | Accounts, envelopes, categories, currencies, rates, paydays, cut-off | ✅ |
| M2 | Ledger Core | Transaction store, sign rules, pairing, balance derivation | ✅ |
| M3 | Envelope Ledgers | Per-envelope entry and Category × Account matrix | ✅ |
| M4 | Credit Card | Purchases, funding links, cycles, payment allocation | ✅ |
| M5 | Transfers & Allocations | Paired postings, payday allocation, FX conversion | ✅ |
| M6 | Budget Periods | Template-driven monthly budget, pay allocation | ◑ parity subset |
| M7 | Analytics & Forecast | Category matrix, income, daily allowance | ✅ |
| M8 | Net Worth | Account × Envelope grid, currency and type rollup | ✅ |
| M9 | Data Integrity | Validation, assertions, audit log | ◑ partial |
| M10 | Platform | Local-first storage, import, export, auth | ✅ |
| M11 | UI / UX | Navigation, entry surfaces, grids, states | ✅ |
| M12 | Reporting | Report catalogue, drill-through, export | ◑ parity subset |

**Deferred to post-MVP:** planned-vs-actual variance · bank reconciliation · net-worth time series ·
installment automation · trend analytics · receipt capture.

---

## 5. Domain Model (overview)

```
Party ─────────┐
               ├─< Account >──┐
Currency ──────┘              │
   │                          │
   └─< FxRate                 │
                              ├─< Transaction >──┬── Envelope
Category ─────────────────────┘                  ├── FundingSource
                                                 └── counter_txn (self)

BudgetPeriod ──< BudgetLine >── Account
CardCycle ─────< Transaction (by window)
PaydayWindow ──< derived from PaydaySchedule
```

**Transaction** is the single write surface. Everything else reads.

**FundingSource** is a discriminated union replacing the `Paying Account` text column:

```
{ kind: "account",  account_id }    → real cash settles the card
{ kind: "envelope", envelope_id }   → Advance Budget pre-funded it   (was "Budget")
{ kind: "none" }                    → unassigned                     (was blank)
```

Same arithmetic as the sheet, with no phantom account leaking into net worth.

---

## 6. Delivery Plan

| Phase | Delivers | Exit criteria |
|---|---|---|
| **0 · Foundation** | Reference data, transaction store, derivation engine, Excel importer | All ~2,900 rows imported; **every** workbook figure reproduced to the centavo |
| **1 · Entry** | Envelope ledgers, quick-add, pickers, transfers | A full week logged in the app without touching the workbook |
| **2 · Cards** | Purchases with paired postings, cycles, payment allocation | One card cycle paid entirely from the app |
| **3 · Planning** | Budget periods from template, payday allocation wizard | One month's pay allocated in the app |
| **4 · Insight** | Net worth grid, category matrix, income, allowance, 8 reports | Parity checklist fully green; workbook retired to backup |

Phase 0 is the whole risk. If the importer cannot reproduce the workbook exactly, nothing
downstream can be trusted.

---

## 7. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Import doesn't reconcile | Fatal — no trust, no migration | Parity gate as a hard release blocker; per-figure diff report |
| Paired entries can't be reconstructed from `From Sheet` | Broken cross-envelope history | Match on date + amount + category; hand-review the residue before go-live |
| Hidden logic in cells not yet read | Silent behaviour loss | Sweep every formula, not only the summary tables, during Phase 0 |
| Entry friction exceeds the spreadsheet's | Abandonment | Three-tap quick-add is a P0 requirement, not a nice-to-have |
| Scope creep into the deferred list | Parity slips indefinitely | Post-MVP list is frozen; parity checklist is the only definition of done |
| Multi-currency introduced late | Rework across ledger, reports, net worth | A7 settled up front, even though balances are small today |

---

## 8. Success Criteria

1. Every figure in the workbook is reproduced exactly — **the definition of parity.**
2. A routine expense is logged in three taps on a phone.
3. Any number on screen can be drilled to the transactions behind it in two taps.
4. Income totals are correct — the workbook currently shows zero.
5. All foreign-currency holdings reach net worth in base currency.
6. A card cycle can be settled end to end without opening Excel.
7. The workbook still imports and exports, so nothing is one-way.

---

## 9. Open Items

Six narrow questions remain, none blocking design:

1. Payday shift rule when the 15th or month-end is a non-banking day
2. Whether to hardcode a PH holiday calendar or adjust per occurrence
3. Rate sourcing for the six small travel currencies — manual is likely sufficient
4. Whether recurring Forex fees are expensed to a category or stay in the envelope
5. Whether `Installment` and `RK Therapy` migrate or are scratch space
6. Whether the app opens on the current calendar month's budget or the latest created

Resolved decisions and full reasoning: `accounts-app-requirements.md` §7.
```