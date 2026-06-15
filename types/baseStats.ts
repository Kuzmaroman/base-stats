export interface BaseStats {
    address: string;
    transactionCount: number;
    contractInteractions: number;
    contractsCreated: number;
    activeDays: number;
    activeWeeks: number;
    activeMonths: number;
    startOfUse: string;
    lastUse: string;
    baseScore: number;
    baseScoreLevel: BaseScoreLevel;
    scoreBreakdown: BaseScoreBreakdown;
}

export interface BaseWalletActivity {
    transactionCount: number;
    contractInteractions: number;
    contractsCreated: number;
    activeDays: number;
    activeWeeks: number;
    activeMonths: number;
    startOfUse: string;
    lastUse: string;
}

export interface BaseScoreBreakdown {
    transactions: number;
    activeDays: number;
    activeWeeks: number;
    contractInteractions: number;
    contractsCreated: number;
    longevity: number;
    recency: number;
}

export type BaseScoreLevel =
    | "Fresh Wallet 🐣"
    | "Base Tourist 🧳"
    | "Gas Sniffer ⛽"
    | "Chain Walker 👟"
    | "Contract Curious 🧪"
    | "Onchain Regular 🔁"
    | "Base Grinder ⚙️"
    | "Contract Goblin 👹"
    | "Based Chad 🟦"
    | "Base Native 🧬";

export type BaseScoreInput = Pick<
    BaseStats,
    | "transactionCount"
    | "contractInteractions"
    | "contractsCreated"
    | "activeDays"
    | "activeWeeks"
    | "activeMonths"
    | "startOfUse"
    | "lastUse"
>;

export interface BaseScoreResult {
    baseScore: number;
    baseScoreLevel: BaseScoreLevel;
    scoreBreakdown: BaseScoreBreakdown;
}

export interface BaseWalletActivityResult {
    activity: BaseWalletActivity;
    method:
        | "txlist"
        | "v2-fallback"
        | "counters-only"
        | "partial"
        | "empty-wallet"
        | "cdp";
    attempts: number;
    fallbackReason?: string;
    pagesFetched: number;
    transactionsProcessed: number;
}

export type BaseStatsCacheSource = "memory" | "file" | "fresh";

export interface BaseStatsResult {
    stats: BaseStats;
    cacheSource: BaseStatsCacheSource;
    method:
        | "txlist"
        | "v2-fallback"
        | "counters-only"
        | "partial"
        | "empty-wallet"
        | "cdp"
        | "cache";
    attempts: number;
    fallbackReason?: string;
    pagesFetched: number;
    transactionsProcessed: number;
}

export interface BaseTransactionSummary {
    transactionCount: number;
    startOfUse: string;
    lastUse: string;
}

export interface BaseActivityPeriods {
    activeDays: number;
    activeWeeks: number;
    activeMonths: number;
}

export interface BaseTransactionsSchemaSample {
    columns: string[];
    sampleRow: Record<string, unknown> | null;
}

export interface BaseWalletTransaction {
    hash: string;
    timestamp: string;
    success: boolean;
    interactedContract?: string | null;
}

export interface BaseContractCreation {
    txHash: string;
    contractAddress: string;
    timestamp: string;
    success: boolean;
}

export interface ErrorResponse {
    error: {
        code: string;
        message: string;
    };
}

/*
Example success response shape:

{
  "address": "0x1234...abcd",
  "transactionCount": 0,
  "contractInteractions": 0,
  "contractsCreated": 0,
  "activeDays": 0,
  "activeWeeks": 0,
  "activeMonths": 0,
  "startOfUse": "",
  "lastUse": "",
  "baseScore": 0,
  "baseScoreLevel": "Fresh Wallet 🐣",
  "scoreBreakdown": {
    "transactions": 0,
    "activeDays": 0,
    "activeWeeks": 0,
    "contractInteractions": 0,
    "contractsCreated": 0,
    "longevity": 0,
    "recency": 0
  }
}
*/
