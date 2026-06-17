# Crypto Tax Sweden Loop

## Purpose

Turn `apps/crypto-tax-sweden` from a calculator demo into a usable Sweden-first crypto tax app.

The product target is an actual workflow: user account, profile setup, password/auth boundary, wallet/public-address imports, CSV upload, period-based transaction review, tax calculation, and export/review support.

## Product Direction

- User profile and password setup for local/app accounts.
- Transaction import through CSV upload.
- Public wallet/address import where supported by public APIs or explorers.
- Never ask for or store private keys, seed phrases, exchange withdrawal secrets, or signing credentials.
- Transaction list filtered by selected tax period.
- Review states for imported rows, warnings, missing cost basis, income, fees, and suspicious negative holdings.
- Swedish tax assumptions must stay visible and verified before changing calculation behavior.
- The app should feel like a real product, not a pasted-CSV toy.

## Cadence

- Fast run: every 72 hours from the project controller.
- Full run: before committing app workflow changes.

## Commands

```bash
npm run typecheck -w @agent/crypto-tax-sweden
npm run lint -w @agent/crypto-tax-sweden
npm run build -w @agent/crypto-tax-sweden
```

## Agent Contract

1. Read this file and `loops/crypto-tax-sweden/PROMPT.md`.
2. Inspect the current app and choose one small product slice.
3. Prefer slices that move toward account/profile setup, imports, period review, or transaction workflow.
4. Verify Swedish tax logic against current Skatteverket guidance before changing tax assumptions.
5. Do not add private-key, seed-phrase, or live wallet-signing handling.
6. Run typecheck, lint, and build before committing.
7. Commit locally only when green.
8. Message David when blocked, when tax guidance needs a human decision, or when a slice lands.

## Stop Condition

The loop is healthy when:

- The app builds.
- A user can import transactions and inspect a selected period.
- Tax warnings and assumptions remain visible.
- Any blocker is reported instead of silently parked.

## Expansion Points

- Add durable auth/session storage.
- Add profile settings for tax year, base currency, and country assumptions.
- Add exchange-specific CSV mappers.
- Add public chain address import adapters.
- Add K4-style export/review package.
