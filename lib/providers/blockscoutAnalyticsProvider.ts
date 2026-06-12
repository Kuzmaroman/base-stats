import type { BaseAnalyticsProvider } from "./baseAnalyticsProvider";
import {
    BlockscoutClient,
    type BlockscoutCountersResponse,
    type BlockscoutTransactionItem,
    type BlockscoutTransactionsResponse,
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

const MAX_TRANSACTION_PAGES = 50;
const TRANSACTION_CACHE_TTL_MS = 30 * 60 * 1000;

type CachedWalletActivity = {
    activity: BaseWalletActivity;
    expiresAt: number;
};

const walletActivityCache = new Map<string, CachedWalletActivity>();

export class BlockscoutAnalyticsProvider implements BaseAnalyticsProvider {
    constructor(private readonly client: BlockscoutClient = new BlockscoutClient()) {}

    async getWalletActivity(address: string): Promise<BaseWalletActivityResult> {
        // Blockscout is the primary free provider for Base Stats V1.
        // Full-history pagination is acceptable for MVP/local development when paired with cache.
        // Full-history wallet indexing should move to background storage for production.
        // Swap volume is intentionally excluded from V1 and can be added later with a decoded swaps provider.
        const normalizedAddress = normalizeAddress(address);
        const cached = walletActivityCache.get(normalizedAddress);

        if (cached && cached.expiresAt > Date.now()) {
            return {
                activity: cached.activity,
                pagesFetched: 0,
                transactionsProcessed: 0,
            };
        }

        const startedAt = Date.now();
        const [counters, transactionFetchResult] = await Promise.all([
            this.client.getAddressCounters(normalizedAddress),
            this.fetchAllTransactions(normalizedAddress),
        ]);
        const { transactions, pagesFetched } = transactionFetchResult;

        const activity = buildWalletActivity(counters, transactions);
        const durationMs = Date.now() - startedAt;

        walletActivityCache.set(normalizedAddress, {
            activity,
            expiresAt: Date.now() + TRANSACTION_CACHE_TTL_MS,
        });

        console.log("[Base Stats][Blockscout] stats calculated", {
            address: normalizedAddress,
            pagesFetched,
            transactionsProcessed: transactions.length,
            durationMs,
        });

        return {
            activity,
            pagesFetched,
            transactionsProcessed: transactions.length,
        };
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

    private async fetchAllTransactions(address: string): Promise<{
        transactions: BlockscoutTransactionItem[];
        pagesFetched: number;
    }> {
        const transactions: BlockscoutTransactionItem[] = [];
        let nextPageParams: Record<string, string | number | boolean> | null | undefined;
        let pagesFetched = 0;

        for (let page = 0; page < MAX_TRANSACTION_PAGES; page += 1) {
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

            if (page === MAX_TRANSACTION_PAGES - 1) {
                console.warn("[Base Stats][Blockscout] Reached transaction pagination cap", {
                    address,
                    maxPages: MAX_TRANSACTION_PAGES,
                });
            }
        }

        return {
            transactions,
            pagesFetched,
        };
    }
}

function buildWalletActivity(
    counters: BlockscoutCountersResponse,
    transactions: BlockscoutTransactionItem[],
): BaseWalletActivity {
    const successfulTransactions = transactions.filter(isSuccessfulTransaction);
    const timestamps = successfulTransactions
        .map((transaction) => toIsoTimestamp(transaction.timestamp))
        .filter((timestamp) => timestamp.length > 0);
    const sortedTimestamps = [...timestamps].sort();

    return {
        transactionCount: toNumber(counters.transactions_count),
        contractInteractions: countUniqueContractInteractions(successfulTransactions),
        contractsCreated: countUniqueCreatedContracts(successfulTransactions),
        activeDays: countUniqueDays(timestamps),
        activeWeeks: countUniqueWeeks(timestamps),
        activeMonths: countUniqueMonths(timestamps),
        // TODO: startOfUse is based on fetched pages only. Move full-history indexing into background cache/storage for production.
        startOfUse: sortedTimestamps[0] ?? "",
        lastUse: sortedTimestamps.at(-1) ?? "",
    };
}

function isSuccessfulTransaction(transaction: BlockscoutTransactionItem): boolean {
    return (
        normalizeStatus(transaction.status) === "ok" ||
        normalizeStatus(transaction.result) === "success"
    );
}

function countUniqueContractInteractions(
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

function countUniqueCreatedContracts(
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

function toIsoTimestamp(value?: string | null): string {
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
