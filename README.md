# Base Stats

Base Stats is a mobile-friendly Base wallet activity checker built with Next.js.

It uses the free public Blockscout Base API as the primary data provider and returns real wallet activity metrics through `GET /api/stats/[address]`.

The app also includes an unofficial Base Score based on wallet activity. It is not related to any token, reward, airdrop, eligibility system, or official Base ranking.

## Features

- Base wallet activity stats
- Base Score from `0` to `100`
- Fun score level
- Daily Check-in on Base
- Share card PNG download
- Privacy mode
- Wallet connect and manual address input

## Tech

- Next.js App Router
- TypeScript
- Tailwind CSS
- Blockscout Base API for free public data

## Data Provider

- Blockscout Base API

## Important Disclaimer

Base Score is unofficial and not related to any token, reward, airdrop, or official Base ranking.

## Local Setup

1. Install dependencies:

```bash
npm install
```

2. Start the dev server:

```bash
npm run dev -- --webpack
```

3. Open [http://localhost:3000](http://localhost:3000)

## Environment Variables

```bash
NEXT_PUBLIC_CHECKIN_CONTRACT_ADDRESS=TBD
NEXT_PUBLIC_CHECKIN_CHAIN_ID=84532
NEXT_PUBLIC_BASE_BUILDER_CODE=bc_bh8kp8yz
```

Daily Check-in is optional and onchain. If the check-in contract address is not configured yet,
the app keeps working and shows the Daily Check-in section in a disabled configuration-needed state.
For local or testnet check-in, use Base Sepolia chain id `84532`. Production/mainnet check-in
should use Base Mainnet chain id `8453` and a Base mainnet contract address.
If `NEXT_PUBLIC_BASE_BUILDER_CODE` is present, the Daily Check-in write transaction appends
the ERC-8021 attribution suffix for Base Builder Code tracking.

## Checks

Run lint:

```bash
npm run lint
```

Run a production build:

```bash
npm run build
```

## Privacy Notes

- The main app can display a wallet address for active checking
- The downloadable share card never shows a full wallet address
- Share card privacy mode is enabled by default and shows `Private Wallet`
- If privacy is turned off, the share card shows only a shortened wallet address

## Notes

- `/api/stats/[address]` uses Blockscout as the free public provider for Base wallet activity
- The production stats path uses Blockscout's faster Etherscan-compatible `txlist` endpoint
- Blockscout `/api/v2` pagination is kept as a capped fallback for resilience
- CDP debug helpers may still exist under `/api/debug`, but CDP is not used in the normal stats flow
- API debug routes are intentionally grouped under `/api/debug`

## Base Builder Notes

- Base Stats is designed as a small Base App-ready wallet activity checker.
- It uses the Blockscout Base API for wallet stats.
- Base Score is unofficial.
- Daily Check-in is the first optional onchain action for Base Stats.
- Future steps: Base Dashboard registration, Builder Codes / attribution research, and Base App testing.
