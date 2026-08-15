# @gastos/config

Shared tooling configuration for the gastos monorepo: ESLint (flat config), Prettier, and Knip.

## Usage

```js
// <package>/eslint.config.mjs
import gastosConfig from "@gastos/config/eslint";

export default [
  ...gastosConfig,
  {
    // package-specific overrides, if any
  },
];
```

```js
// <package>/prettier.config.mjs
export { default } from "@gastos/config/prettier";
```

## Layer boundaries

`eslint.config.mjs` encodes the one-directional layering from the architecture doc
(`req/accounts-xls-hld.md` §3.2) via `eslint-plugin-boundaries`:

```
Reporting → Domain → Ledger Core → Reference
```

A layer may only import from itself or the layers to its right. Never "up" the stack (e.g.
Reference must never import from Ledger Core, Domain, or Reporting).

None of these directories exist yet as of Increment 1 (foundation scaffold) — the rule is wired
up in advance so that as the domain code lands, the boundary is enforced from the first file
rather than retrofitted. Directory-to-layer mapping (all paths relative to the repo root):

| Layer | Directory | Notes |
|---|---|---|
| Reference | `packages/shared/src/reference/**` | Accounts, envelopes, categories, currencies, rates, paydays, cut-off config. No dependencies on any other layer. |
| Ledger Core | `packages/shared/src/ledger-core/**` | Transaction store, sign rules, pairing, balance derivation. May depend on Reference. |
| Domain | `packages/shared/src/domain/**` | Envelope logic, CC cycles, budget periods, allocations, FX, integrity. May depend on Ledger Core and Reference. |
| Reporting | `apps/server/src/reporting/**` | Report catalogue, drill-through, aggregation endpoints. May depend on Domain, Ledger Core, and Reference. |

`packages/shared/src/money/**` (the branded `Cents` type and money math) sits underneath all
four layers as a primitive utility and may be imported by any of them.
