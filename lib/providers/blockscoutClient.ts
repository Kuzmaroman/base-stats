const BLOCKSCOUT_API_BASE_URL = "https://base.blockscout.com/api/v2";
const BLOCKSCOUT_COMPAT_API_URL = "https://base.blockscout.com/api";
const REQUEST_TIMEOUT_MS = 12_000;
const RETRY_DELAYS_MS = [500, 1500];
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

export interface BlockscoutCountersResponse {
    transactions_count?: string;
    token_transfers_count?: string;
    gas_usage_count?: string;
    validations_count?: string;
    [key: string]: unknown;
}

export interface BlockscoutAddressRef {
    hash?: string | null;
    is_contract?: boolean | null;
    [key: string]: unknown;
}

export interface BlockscoutCreatedContractRef {
    hash?: string | null;
    address?: string | null;
    [key: string]: unknown;
}

export interface BlockscoutTransactionItem {
    hash?: string | null;
    timestamp?: string | null;
    status?: string | null;
    result?: string | null;
    method?: string | null;
    transaction_types?: string[] | null;
    from?: BlockscoutAddressRef | null;
    to?: BlockscoutAddressRef | null;
    created_contract?: string | BlockscoutCreatedContractRef | null;
    [key: string]: unknown;
}

export interface BlockscoutTransactionsResponse {
    items?: BlockscoutTransactionItem[];
    next_page_params?: Record<string, string | number | boolean> | null;
    [key: string]: unknown;
}

export interface BlockscoutTxListItem {
    hash?: string | null;
    timeStamp?: string | null;
    from?: string | null;
    to?: string | null;
    input?: string | null;
    contractAddress?: string | null;
    isError?: string | null;
    txreceipt_status?: string | null;
    [key: string]: unknown;
}

export interface BlockscoutTxListResponse {
    status?: string;
    message?: string;
    result?: BlockscoutTxListItem[] | string | null;
}

export interface BlockscoutRequestMeta {
    attempts: number;
    durationMs: number;
}

export interface BlockscoutDebugTxListResponse {
    providerDurationMs: number;
    result: BlockscoutTxListResponse;
}

export class BlockscoutApiError extends Error {
    constructor(
        message: string,
        public readonly status?: number,
        public readonly retryable = false,
        public readonly attempts = 1,
        public readonly queryName?: string,
        public readonly responseBody?: string,
    ) {
        super(message);
        this.name = "BlockscoutApiError";
    }
}

export class BlockscoutClient {
    constructor(private readonly fetcher: typeof fetch = fetch) {}

    async getAddressCounters(address: string): Promise<BlockscoutCountersResponse> {
        return this.fetchJson<BlockscoutCountersResponse>(
            buildV2Url(`/addresses/${address}/counters`, undefined),
            "blockscout-address-counters",
        );
    }

    async getAddressTransactions(
        address: string,
        query?: Record<string, string | number | boolean | null | undefined>,
        queryName = "blockscout-address-transactions",
    ): Promise<BlockscoutTransactionsResponse> {
        return this.fetchJson<BlockscoutTransactionsResponse>(
            buildV2Url(`/addresses/${address}/transactions`, query),
            queryName,
        );
    }

    async getAddressTxList(
        address: string,
        queryName = "blockscout-address-txlist",
    ): Promise<BlockscoutTxListResponse> {
        return this.fetchJson<BlockscoutTxListResponse>(
            buildCompatUrl({
                module: "account",
                action: "txlist",
                address,
                startblock: 0,
                endblock: 99999999,
                sort: "asc",
                page: 1,
                offset: 10000,
            }),
            queryName,
        );
    }

    async getAddressTxListDebug(
        address: string,
        queryName = "blockscout-address-txlist-debug",
    ): Promise<BlockscoutDebugTxListResponse> {
        const startedAt = Date.now();
        const result = await this.getAddressTxList(address, queryName);

        return {
            providerDurationMs: Date.now() - startedAt,
            result,
        };
    }

    private async fetchJson<T>(url: URL, queryName: string): Promise<T> {
        let lastError: BlockscoutApiError | null = null;

        for (let attemptIndex = 0; attemptIndex <= RETRY_DELAYS_MS.length; attemptIndex += 1) {
            const attempt = attemptIndex + 1;

            try {
                return await this.fetchJsonOnce<T>(url, queryName, attempt);
            } catch (error) {
                const blockscoutError = toBlockscoutApiError(error, queryName, attempt);
                lastError = blockscoutError;

                if (!blockscoutError.retryable || attemptIndex === RETRY_DELAYS_MS.length) {
                    throw blockscoutError;
                }

                await wait(RETRY_DELAYS_MS[attemptIndex]);
            }
        }

        throw lastError ?? new BlockscoutApiError("Unknown Blockscout error.", undefined, false, 1, queryName);
    }

    private async fetchJsonOnce<T>(
        url: URL,
        queryName: string,
        attempt: number,
    ): Promise<T> {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

        try {
            const response = await this.fetcher(url.toString(), {
                method: "GET",
                cache: "no-store",
                signal: controller.signal,
            });
            const responseText = await response.text();

            if (!response.ok) {
                console.error("[Base Stats][Blockscout] API error", {
                    queryName,
                    attempt,
                    status: response.status,
                    statusText: response.statusText,
                    body: responseText,
                });

                throw new BlockscoutApiError(
                    `Blockscout API request failed (${response.status}): ${truncate(responseText)}`,
                    response.status,
                    RETRYABLE_STATUSES.has(response.status),
                    attempt,
                    queryName,
                    responseText,
                );
            }

            try {
                return JSON.parse(responseText) as T;
            } catch {
                console.error("[Base Stats][Blockscout] Invalid JSON response", {
                    queryName,
                    attempt,
                    body: responseText,
                });

                throw new BlockscoutApiError(
                    "Blockscout returned invalid JSON.",
                    response.status,
                    true,
                    attempt,
                    queryName,
                    responseText,
                );
            }
        } catch (error) {
            if (error instanceof BlockscoutApiError) {
                throw error;
            }

            if (isAbortError(error)) {
                throw new BlockscoutApiError(
                    "Blockscout request timed out.",
                    undefined,
                    true,
                    attempt,
                    queryName,
                );
            }

            throw new BlockscoutApiError(
                error instanceof Error ? error.message : "Blockscout network error.",
                undefined,
                true,
                attempt,
                queryName,
            );
        } finally {
            clearTimeout(timeout);
        }
    }
}

function buildV2Url(
    path: string,
    query: Record<string, string | number | boolean | null | undefined> | undefined,
): URL {
    const url = new URL(`${BLOCKSCOUT_API_BASE_URL}${path}`);

    if (query) {
        for (const [key, value] of Object.entries(query)) {
            if (value === null || value === undefined) {
                continue;
            }

            url.searchParams.set(key, String(value));
        }
    }

    return url;
}

function buildCompatUrl(
    query: Record<string, string | number | boolean | null | undefined>,
): URL {
    const url = new URL(BLOCKSCOUT_COMPAT_API_URL);

    for (const [key, value] of Object.entries(query)) {
        if (value === null || value === undefined) {
            continue;
        }

        url.searchParams.set(key, String(value));
    }

    return url;
}

function toBlockscoutApiError(
    error: unknown,
    queryName: string,
    attempts: number,
): BlockscoutApiError {
    if (error instanceof BlockscoutApiError) {
        return error;
    }

    return new BlockscoutApiError(
        error instanceof Error ? error.message : "Unknown Blockscout error.",
        undefined,
        true,
        attempts,
        queryName,
    );
}

function isAbortError(error: unknown): boolean {
    return error instanceof Error && error.name === "AbortError";
}

function truncate(value: string, maxLength = 300): string {
    const normalized = value.trim().replace(/\s+/g, " ");
    return normalized.length <= maxLength
        ? normalized
        : `${normalized.slice(0, maxLength)}...`;
}

function wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
