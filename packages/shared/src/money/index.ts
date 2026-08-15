// Cents type and money math land here.
//
// Per repo convention (see CLAUDE.md): all money values use a branded `Cents`
// integer type. No raw `number` arithmetic on currency values, no
// `parseFloat`/`Number()` on a money string outside a shared parser here, and
// no cross-currency addition without an explicit `FxRate`. Not implemented in
// this increment (foundation scaffold only) — this file exists so
// `@gastos/shared/money` resolves as an import target.

export {};
