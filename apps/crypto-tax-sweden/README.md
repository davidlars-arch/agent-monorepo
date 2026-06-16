# Skattkarta Crypto

Sweden-first cryptocurrency tax calculator SaaS prototype.

## What it does now

- Parses a simple exchange-style CSV pasted into the browser.
- Tracks average cost basis per crypto asset.
- Treats sales and crypto-to-crypto trades as disposals.
- Estimates Swedish capital gains tax impact with 30% tax on taxable capital.
- Applies 70% deductibility to capital losses in the summary.
- Produces K4-style disposal rows for review.
- Flags income, fee-only rows, missing trade targets, and negative holdings.

## CSV shape

```csv
date,type,asset,quantity,total_sek,fee_sek,received_asset,received_quantity,source,note
2025-01-08,buy,BTC,0.08,36000,99,,,Kraken,initial buy
2025-05-02,trade,ETH,0.35,13200,49,SOL,22.4,Wallet,ETH to SOL swap
2025-08-19,sell,BTC,0.025,14200,59,,,Kraken,partial sale
```

## Swedish tax assumptions

This prototype follows the public Skatteverket guidance used for a first calculation pass:

- Crypto disposals are calculated as sale proceeds minus cost basis.
- Crypto-to-crypto trades are treated as disposals using market value.
- Average cost method is used for cost basis.
- Capital gains are generally taxed at 30%.
- Capital losses are generally deductible at 70%.

Sources:

- https://www.skatteverket.se/privat/skatter/vardepapper/andratillgangar/kryptovalutor.4.15532c7b1442f256bae11b60.html
- https://www.skatteverket.se/privat/skatter/vardepapper/andratillgangar.4.233f91f71260075abe8800099480.html
- https://www.skatteverket.se/privat/etjansterochblanketter/svarpavanligafragor/vardepapper.4.18e1b10334ebe8bc80001694.html

This is not tax advice. The app should keep a review queue and evidence trail before anyone uses it for a real filing.

## Run

```bash
npm run dev -w @agent/crypto-tax-sweden
```
