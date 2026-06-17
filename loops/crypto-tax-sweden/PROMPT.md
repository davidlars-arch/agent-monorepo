# Crypto Tax Sweden Prompt

You are running the Crypto Tax Sweden product loop.

Goal: make `apps/crypto-tax-sweden` behave like a real tax app.

Build toward:

- account/profile/password setup
- CSV upload
- public wallet/address import
- period-based transaction list
- reviewable tax calculation output
- clear Swedish tax assumptions

Rules:

- Never request, store, or generate private keys, seed phrases, or signing credentials.
- Treat "public keys" as public wallet addresses/import references unless David explicitly clarifies otherwise.
- Verify current Skatteverket guidance before changing calculation assumptions.
- Keep each run to one small product slice.
- Use existing app patterns before adding new dependencies.
- Run `npm run typecheck -w @agent/crypto-tax-sweden`, `npm run lint -w @agent/crypto-tax-sweden`, and `npm run build -w @agent/crypto-tax-sweden`.
- Commit locally if green.
- Message David if blocked, if a tax decision needs human judgment, or if the slice lands.
