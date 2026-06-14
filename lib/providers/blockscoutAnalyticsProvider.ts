import type { BaseAnalyticsProvider } from "./baseAnalyticsProvider";
import {
    BlockscoutApiError,
    BlockscoutClient,
    type BlockscoutCountersResponse,
    type BlockscoutTransactionItem,
    type BlockscoutTransactionsResponse,
    type BlockscoutTxListItem,
} from "./blockscoutClient";
import {
    countUniqueDays,
    countUniqueMonths,
    countUniqueWeeks,
} from "../utils/activityPeriods";
import type {
    BaseWalletActivity,
    BaseWalletActivityResult,
} from "../../types/baseStats";

const TRANSACTION_CACHE_TTL_MS = 30 * 60 * 1000;
const DEFAULT_FALLBACK_V2_MAX_PAGES = 10;
const HARD_FALLBACK_V2_MAX_PAGES_CAP = 50;

type CachedWalletActivity = {
    activity: BaseWalletActivity;
    expiresAt: number;
};

const walletActivityCache = new Map<string, CachedWalletActivity>();

export class BlockscoutAnalyticsProvider implements BaseAnalyticsProvider {
    constructor(private readonly client: BlockscoutClient = new BlockscoutClient()) {}

    async getWalletActivity(address: string): Promise<BaseWalletActivityResult> {
        // Blockscout is the primary free provider for Base Stats V1.
        // Use the faster Etherscan-compatible txlist endpoint first for production safety.
        // Keep v2 pagination as a capped fallback while preserving local/dev debugging options.
        // Swap volume is intentionally excluded from V1 and can be added later with a decoded swaps provider.
        const normalizedAddress = normalizeAddress(address);
        const cached = walletActivityCache.get(normalizedAddress);

        if (cached && cached.expiresAt > Date.now()) {
            return {
                activity: cached.activity,
                method: "txlist",
                pagesFetched: 0,
                transactionsProcessed: 0,
            };
        }

        const startedAt = Date.now();
        const counters = await this.client.getAddressCounters(normalizedAddress);

        try {
            const txListResponse = await this.client.getAddressTxList(
                normalizedAddress,
                "blockscout-txlist",
            );
            const txListItems = unwrapTxListResult(txListResponse);
            const activity = buildWalletActivityFromTxList(counters, txListItems);

            walletActivityCache.set(normalizedAddress, {
                activity,
                expiresAt: Date.now() + TRANSACTION_CACHE_TTL_MS,
            });

            const durationMs = Date.now() - startedAt;
            console.log("[Base Stats][Blockscout] stats calculated", {
                address: normalizedAddress,
                method: "txlist",
                durationMs,
                transactionsProcessed: txListItems.length,
            });

            return {
                activity,
                method: "txlist",
                pagesFetched: 1,
                transactionsProcessed: txListItems.length,
            };
        } catch (error) {
            if (!(error instanceof BlockscoutApiError)) {
                throw error;
            }

            const fallbackStartedAt = Date.now();
            const transactionFetchResult = await this.fetchTransactionsFallback(normalizedAddress);
            const activity = buildWalletActivityFromV2(counters, transactionFetchResult.transactions);

            walletActivityCache.set(normalizedAddress, {
                activity,
                expiresAt: Date.now() + TRANSACTION_CACHE_TTL_MS,
            });

            const durationMs = Date.now() - fallbackStartedAt;
            console.log("[Base Stats][Blockscout] stats calculated", {
                address: normalizedAddress,
                method: "v2-fallback",
                pagesFetched: transactionFetchResult.pagesFetched,
                durationMs,
                transactionsProcessed: transactionFetchResult.transactions.length,
            });

            return {
                activity,
                method: "v2-fallback",
                pagesFetched: transactionFetchResult.pagesFetched,
                transactionsProcessed: transactionFetchResult.transactions.length,
            };
        }
    }

    async getCounters(address: string): Promise<BlockscoutCountersResponse> {
        return this.client.getAddressCounters(normalizeAddress(address));
    }

    async getTransactionsFirstPage(address: string): Promise<BlockscoutTransactionsResponse> {
        return this.client.getAddressTransactions(
            normalizeAddress(address),
            undefined,
            "blockscout-transactions-first-page",
        );
    }

    private async fetchTransactionsFallback(address: string): Promise<{
        transactions: BlockscoutTransactionItem[];
        pagesFetched: number;
    }> {
        const transactions: BlockscoutTransactionItem[] = [];
        let nextPageParams: Record<string, string | number | boolean> | null | undefined;
        let pagesFetched = 0;
        const maxPages = getFallbackV2MaxPages();

        for (let page = 0; page < maxPages; page += 1) {
            const queryName = `blockscout-transactions-page-${page + 1}`;
            const response = await this.client.getAddressTransactions(
                address,
                nextPageParams ?? undefined,
                queryName,
            );

            pagesFetched += 1;
            transactions.push(...(response.items ?? []));
            nextPageParams = response.next_page_params;

            if (!nextPageParams) {
                break;
            }

            if (page === maxPages - 1) {
                console.warn("[Base Stats][Blockscout] Reached fallback transaction pagination cap", {
                    address,
                    maxPages,
                });
            }
        }

        return {
            transactions,
            pagesFetched,
        };
    }
}

function buildWalletActivityFromTxList(
    counters: BlockscoutCountersResponse,
    transactions: BlockscoutTxListItem[],
): BaseWalletActivity {
    const successfulTransactions = transactions.filter(isSuccessfulTxListTransaction);
    const timestamps = successfulTransactions
        .map((transaction) => toIsoTimestampFromUnixSeconds(transaction.timeStamp))
        .filter((timestamp) => timestamp.length > 0);
    const sortedTimestamps = [...timestamps].sort();

    return {
        transactionCount: toNumber(counters.transactions_count),
        contractInteractions: countUniqueContractInteractionsFromTxList(successfulTransactions),
        contractsCreated: countUniqueCreatedContractsFromTxList(successfulTransactions),
        activeDays: countUniqueDays(timestamps),
        activeWeeks: countUniqueWeeks(timestamps),
        activeMonths: countUniqueMonths(timestamps),
        startOfUse: sortedTimestamps[0] ?? "",
        lastUse: sortedTimestamps.at(-1) ?? "",
    };
}

function buildWalletActivityFromV2(
    counters: BlockscoutCountersResponse,
    transactions: BlockscoutTransactionItem[],
): BaseWalletActivity {
    const successfulTransactions = transactions.filter(isSuccessfulV2Transaction);
    const timestamps = successfulTransactions
        .map((transaction) => toIsoTimestampFromDateString(transaction.timestamp))
        .filter((timestamp) => timestamp.length > 0);
    const sortedTimestamps = [...timestamps].sort();

    return {
        transactionCount: toNumber(counters.transactions_count),
        contractInteractions: countUniqueContractInteractionsFromV2(successfulTransactions),
        contractsCreated: countUniqueCreatedContractsFromV2(successfulTransactions),
        activeDays: countUniqueDays(timestamps),
        activeWeeks: countUniqueWeeks(timestamps),
        activeMonths: countUniqueMonths(timestamps),
        startOfUse: sortedTimestamps[0] ?? "",
        lastUse: sortedTimestamps.at(-1) ?? "",
    };
}

function unwrapTxListResult(response: {
    status?: string;
    result?: BlockscoutTxListItem[] | string | null;
}): BlockscoutTxListItem[] {
    if (Array.isArray(response.result)) {
        return response.result;
    }

    if (typeof response.result === "string") {
        const normalized = response.result.toLowerCase();

        if (normalized.includes("no transactions")) {
            return [];
        }
    }

    if (response.status === "0" && response.result == null) {
        return [];
    }

    throw new BlockscoutApiError("Blockscout txlist returned an unexpected response shape.");
}

function isSuccessfulTxListTransaction(transaction: BlockscoutTxListItem): boolean {
    const hasReceiptFailure = transaction.txreceipt_status === "0";
    return transaction.isError !== "1" && !hasReceiptFailure;
}

function isSuccessfulV2Transaction(transaction: BlockscoutTransactionItem): boolean {
    return (
        normalizeStatus(transaction.status) === "ok" ||
        normalizeStatus(transaction.result) === "success"
    );
}

function countUniqueContractInteractionsFromTxList(
    transactions: BlockscoutTxListItem[],
): number {
    const contractAddresses = new Set<string>();

    for (const transaction of transactions) {
        const toAddress = normalizeOptionalAddress(transaction.to);
        const input = typeof transaction.input === "string" ? transaction.input : "";

        if (!toAddress || input.length === 0 || input === "0x") {
            continue;
        }

        contractAddresses.add(toAddress);
    }

    return contractAddresses.size;
}

function countUniqueCreatedContractsFromTxList(
    transactions: BlockscoutTxListItem[],
): number {
    const createdContracts = new Set<string>();

    for (const transaction of transactions) {
        const contractAddress = normalizeOptionalAddress(transaction.contractAddress);

        if (contractAddress) {
            createdContracts.add(contractAddress);
        }
    }

    return createdContracts.size;
}

function countUniqueContractInteractionsFromV2(
    transactions: BlockscoutTransactionItem[],
): number {
    const contractAddresses = new Set<string>();

    for (const transaction of transactions) {
        if (transaction.to?.is_contract !== true) {
            continue;
        }

        const contractAddress = normalizeOptionalAddress(transaction.to?.hash);

        if (contractAddress) {
            contractAddresses.add(contractAddress);
        }
    }

    return contractAddresses.size;
}

function countUniqueCreatedContractsFromV2(
    transactions: BlockscoutTransactionItem[],
): number {
    const createdContracts = new Set<string>();

    for (const transaction of transactions) {
        const contractAddress = extractCreatedContractAddress(transaction.created_contract);

        if (contractAddress) {
            createdContracts.add(contractAddress);
        }
    }

    return createdContracts.size;
}

function extractCreatedContractAddress(
    createdContract: BlockscoutTransactionItem["created_contract"],
): string | null {
    if (typeof createdContract === "string") {
        return normalizeOptionalAddress(createdContract);
    }

    if (createdContract && typeof createdContract === "object") {
        return (
            normalizeOptionalAddress(createdContract.hash) ??
            normalizeOptionalAddress(createdContract.address)
        );
    }

    return null;
}

function toIsoTimestampFromUnixSeconds(value?: string | null): string {
    if (!value) {
        return "";
    }

    const unixSeconds = Number(value);

    if (!Number.isFinite(unixSeconds)) {
        return "";
    }

    return new Date(unixSeconds * 1000).toISOString();
}

function toIsoTimestampFromDateString(value?: string | null): string {
    if (!value) {
        return "";
    }

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function toNumber(value?: string | number | null): number {
    if (typeof value === "number") {
        return Number.isFinite(value) ? value : 0;
    }

    if (typeof value === "string") {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : 0;
    }

    return 0;
}

function normalizeAddress(address: string): string {
    return address.toLowerCase();
}

function normalizeOptionalAddress(address?: string | null): string | null {
    return typeof address === "string" && address.length > 0
        ? address.toLowerCase()
        : null;
}

function normalizeStatus(value?: string | null): string {
    return typeof value === "string" ? value.toLowerCase() : "";
}

function getFallbackV2MaxPages(): number {
    const parsed = Number(process.env.BLOCKSCOUT_V2_MAX_PAGES ?? DEFAULT_FALLBACK_V2_MAX_PAGES);

    if (!Number.isFinite(parsed) || parsed <= 0) {
        return DEFAULT_FALLBACK_V2_MAX_PAGES;
    }

    return Math.min(Math.floor(parsed), HARD_FALLBACK_V2_MAX_PAGES_CAP);
}
