const BLOCKSCOUT_API_BASE_URL = "https://base.blockscout.com/api/v2";

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

export class BlockscoutApiError extends Error {
    constructor(
        message: string,
        public readonly status?: number,
    ) {
        super(message);
        this.name = "BlockscoutApiError";
    }
}

export class BlockscoutClient {
    constructor(private readonly fetcher: typeof fetch = fetch) {}

    async getAddressCounters(address: string): Promise<BlockscoutCountersResponse> {
        return this.fetchJson<BlockscoutCountersResponse>(
            `/addresses/${address}/counters`,
            undefined,
            "blockscout-address-counters",
        );
    }

    async getAddressTransactions(
        address: string,
        query?: Record<string, string | number | boolean | null | undefined>,
        queryName = "blockscout-address-transactions",
    ): Promise<BlockscoutTransactionsResponse> {
        return this.fetchJson<BlockscoutTransactionsResponse>(
            `/addresses/${address}/transactions`,
            query,
            queryName,
        );
    }

    private async fetchJson<T>(
        path: string,
        query: Record<string, string | number | boolean | null | undefined> | undefined,
        queryName: string,
    ): Promise<T> {
        const url = new URL(`${BLOCKSCOUT_API_BASE_URL}${path}`);

        if (query) {
            for (const [key, value] of Object.entries(query)) {
                if (value === null || value === undefined) {
                    continue;
                }

                url.searchParams.set(key, String(value));
            }
        }

        const response = await this.fetcher(url.toString(), {
            method: "GET",
            cache: "no-store",
        });

        if (!response.ok) {
            const responseBodyText = await response.text();

            console.error("[Base Stats][Blockscout] API error", {
                queryName,
                status: response.status,
                statusText: response.statusText,
                body: responseBodyText,
            });

            throw new BlockscoutApiError(
                `Blockscout API request failed (${response.status}): ${truncate(responseBodyText)}`,
                response.status,
            );
        }

        return (await response.json()) as T;
    }
}

function truncate(value: string, maxLength = 300): string {
    const normalized = value.trim().replace(/\s+/g, " ");
    return normalized.length <= maxLength
        ? normalized
        : `${normalized.slice(0, maxLength)}...`;
}
