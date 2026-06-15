import type { BaseAnalyticsProvider } from "./baseAnalyticsProvider";
import {
    BlockscoutApiError,
    BlockscoutClient,
    type BlockscoutCountersResponse,
    type BlockscoutTransactionItem,
    type BlockscoutTransactionsResponse,
    type BlockscoutTxListItem,
    type BlockscoutTxListResponse,
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
const DEFAULT_FALLBACK_V2_MAX_PAGES = 5;
const HARD_FALLBACK_V2_MAX_PAGES_CAP = 10;

type CachedWalletActivity = {
    activity: BaseWalletActivity;
    expiresAt: number;
};

const walletActivityCache = new Map<string, CachedWalletActivity>();

export class BlockscoutAnalyticsProvider implements BaseAnalyticsProvider {
    constructor(private readonly client: BlockscoutClient = new BlockscoutClient()) {}

    async getWalletActivity(address: string): Promise<BaseWalletActivityResult> {
        const normalizedAddress = normalizeAddress(address);
        const cached = walletActivityCache.get(normalizedAddress);

        if (cached && cached.expiresAt > Date.now()) {
            return {
                activity: cached.activity,
                method: "txlist",
                attempts: 0,
                pagesFetched: 0,
                transactionsProcessed: 0,
            };
        }

        const startedAt = Date.now();
        const [countersResult, txListResult] = await Promise.allSettled([
            this.client.getAddressCounters(normalizedAddress),
            this.client.getAddressTxList(normalizedAddress, "blockscout-txlist"),
        ]);

        const counters = getSettledValue(countersResult);
        const txListResponse = getSettledValue(txListResult);
        const txListItems = unwrapTxListResultSafe(txListResponse);

        if (txListItems.ok) {
            const successfulTransactions = txListItems.value.filter(isSuccessfulTxListTransaction);
            const transactionCount = txListItems.value.length === 0
                ? 0
                : counters
                    ? toNumber(counters.transactions_count)
                    : successfulTransactions.length;
            const activity = buildWalletActivityFromTxList(
                transactionCount,
                txListItems.value,
            );
            const method = successfulTransactions.length === 0 ? "empty-wallet" : "txlist";
            const attempts = getMaxAttempts(countersResult, txListResult);

            setActivityCache(normalizedAddress, activity);
            logProviderResult({
                address: normalizedAddress,
                method,
                attempts,
                durationMs: Date.now() - startedAt,
                transactionsProcessed: txListItems.value.length,
            });

            return {
                activity,
                method,
                attempts,
                pagesFetched: 1,
                transactionsProcessed: txListItems.value.length,
            };
        }

        let fallbackReason = txListItems.error.message;

        try {
            const fallbackStartedAt = Date.now();
            const fallbackResult = await this.fetchTransactionsFallback(normalizedAddress);
            const transactionCount = counters
                ? toNumber(counters.transactions_count)
                : fallbackResult.successfulTransactions.length;
            const activity = buildWalletActivityFromV2(
                transactionCount,
                fallbackResult.transactions,
            );
            const method = fallbackResult.successfulTransactions.length === 0
                ? "empty-wallet"
                : "v2-fallback";
            const attempts = Math.max(
                getSettledAttempts(countersResult),
                getSettledAttempts(txListResult),
            );

            setActivityCache(normalizedAddress, activity);
            logProviderResult({
                address: normalizedAddress,
                method,
                attempts,
                durationMs: Date.now() - fallbackStartedAt,
                transactionsProcessed: fallbackResult.transactions.length,
                pagesFetched: fallbackResult.pagesFetched,
                fallbackReason,
            });

            return {
                activity,
                method,
                attempts,
                fallbackReason,
                pagesFetched: fallbackResult.pagesFetched,
                transactionsProcessed: fallbackResult.transactions.length,
            };
        } catch (fallbackError) {
            fallbackReason = [
                fallbackReason,
                fallbackError instanceof Error ? fallbackError.message : "Unknown v2 fallback error.",
            ].join(" | ");
        }

        if (counters) {
            const transactionCount = toNumber(counters.transactions_count);
            const activity = buildPartialWalletActivity(transactionCount);
            const method = transactionCount === 0 ? "empty-wallet" : "partial";
            const attempts = Math.max(
                getSettledAttempts(countersResult),
                getSettledAttempts(txListResult),
            );

            setActivityCache(normalizedAddress, activity);
            logProviderResult({
                address: normalizedAddress,
                method,
                attempts,
                durationMs: Date.now() - startedAt,
                transactionsProcessed: 0,
                fallbackReason,
            });

            return {
                activity,
                method,
                attempts,
                fallbackReason,
                pagesFetched: 0,
                transactionsProcessed: 0,
            };
        }

        throw new BlockscoutApiError(
            "Failed to load Base wallet stats. Please try again.",
            undefined,
            false,
            getSettledAttempts(txListResult),
            "blockscout-stats-provider",
            fallbackReason,
        );
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

    async getTxListDebug(address: string): Promise<{
        status: string;
        message: string;
        resultType: string;
        resultLength: number | null;
        firstTransactions: BlockscoutTxListItem[];
        providerDurationMs: number;
    }> {
        const debugResponse = await this.client.getAddressTxListDebug(
            normalizeAddress(address),
            "blockscout-txlist-debug",
        );
        const { result } = debugResponse;

        return {
            status: typeof result.status === "string" ? result.status : "",
            message: typeof result.message === "string" ? result.message : "",
            resultType: Array.isArray(result.result) ? "array" : typeof result.result,
            resultLength: Array.isArray(result.result) ? result.result.length : null,
            firstTransactions: Array.isArray(result.result) ? result.result.slice(0, 3) : [],
            providerDurationMs: debugResponse.providerDurationMs,
        };
    }

    private async fetchTransactionsFallback(address: string): Promise<{
        transactions: BlockscoutTransactionItem[];
        successfulTransactions: BlockscoutTransactionItem[];
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
            successfulTransactions: transactions.filter(isSuccessfulV2Transaction),
            pagesFetched,
        };
    }
}

function buildWalletActivityFromTxList(
    transactionCount: number,
    transactions: BlockscoutTxListItem[],
): BaseWalletActivity {
    const successfulTransactions = transactions.filter(isSuccessfulTxListTransaction);
    const timestamps = successfulTransactions
        .map((transaction) => toIsoTimestampFromUnixSeconds(transaction.timeStamp))
        .filter((timestamp) => timestamp.length > 0);
    const sortedTimestamps = [...timestamps].sort();

    return {
        transactionCount,
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
    transactionCount: number,
    transactions: BlockscoutTransactionItem[],
): BaseWalletActivity {
    const successfulTransactions = transactions.filter(isSuccessfulV2Transaction);
    const timestamps = successfulTransactions
        .map((transaction) => toIsoTimestampFromDateString(transaction.timestamp))
        .filter((timestamp) => timestamp.length > 0);
    const sortedTimestamps = [...timestamps].sort();

    return {
        transactionCount,
        contractInteractions: countUniqueContractInteractionsFromV2(successfulTransactions),
        contractsCreated: countUniqueCreatedContractsFromV2(successfulTransactions),
        activeDays: countUniqueDays(timestamps),
        activeWeeks: countUniqueWeeks(timestamps),
        activeMonths: countUniqueMonths(timestamps),
        startOfUse: sortedTimestamps[0] ?? "",
        lastUse: sortedTimestamps.at(-1) ?? "",
    };
}

function buildPartialWalletActivity(transactionCount: number): BaseWalletActivity {
    return {
        transactionCount,
        contractInteractions: 0,
        contractsCreated: 0,
        activeDays: 0,
        activeWeeks: 0,
        activeMonths: 0,
        startOfUse: "",
        lastUse: "",
    };
}

function unwrapTxListResultSafe(
    response: BlockscoutTxListResponse | null,
): { ok: true; value: BlockscoutTxListItem[] } | { ok: false; error: BlockscoutApiError } {
    if (!response) {
        return {
            ok: false,
            error: new BlockscoutApiError("Blockscout txlist returned no response."),
        };
    }

    if (Array.isArray(response.result)) {
        if (response.status === "0" && response.message && response.message !== "No transactions found") {
            return {
                ok: false,
                error: new BlockscoutApiError(
                    `Blockscout txlist provider error: ${response.message}`,
                ),
            };
        }

        return {
            ok: true,
            value: response.result,
        };
    }

    if (response.status === "0" && response.message === "No transactions found") {
        return {
            ok: true,
            value: [],
        };
    }

    return {
        ok: false,
        error: new BlockscoutApiError(
            `Blockscout txlist returned an unexpected response shape: ${typeof response.result}`,
        ),
    };
}

function isSuccessfulTxListTransaction(transaction: BlockscoutTxListItem): boolean {
    return transaction.isError !== "1" && transaction.txreceipt_status !== "0";
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

        if (!toAddress || !input || input === "0x") {
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

function setActivityCache(address: string, activity: BaseWalletActivity): void {
    walletActivityCache.set(address, {
        activity,
        expiresAt: Date.now() + TRANSACTION_CACHE_TTL_MS,
    });
}

function logProviderResult(details: {
    address: string;
    method: BaseWalletActivityResult["method"];
    attempts: number;
    durationMs: number;
    transactionsProcessed: number;
    pagesFetched?: number;
    fallbackReason?: string;
}): void {
    console.log("[Base Stats][Blockscout] stats calculated", details);
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

function getSettledValue<T>(result: PromiseSettledResult<T>): T | null {
    return result.status === "fulfilled" ? result.value : null;
}

function getSettledAttempts<T>(result: PromiseSettledResult<T>): number {
    if (result.status === "rejected" && result.reason instanceof BlockscoutApiError) {
        return result.reason.attempts;
    }

    return 1;
}

function getMaxAttempts(...results: PromiseSettledResult<unknown>[]): number {
    return Math.max(...results.map(getSettledAttempts));
}
