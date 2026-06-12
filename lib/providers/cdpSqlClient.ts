const CDP_SQL_API_URL = "https://api.cdp.coinbase.com/platform/v2/data/query/run";

interface CdpSqlResponse<T> {
    schema?: {
        columns?: Array<{
            name: string;
            type?: string;
        }>;
    };
    metadata?: {
        cached?: boolean;
        executionTimeMs?: number;
        rowCount?: number;
    };
    result?: T[];
}

export interface CdpSqlQueryResult<T> {
    columns: string[];
    rows: T[];
}

export class MissingCdpClientApiKeyError extends Error {
    constructor(message = "CDP_CLIENT_API_KEY is required to query the CDP SQL API.") {
        super(message);
        this.name = "MissingCdpClientApiKeyError";
    }
}

export class CdpSqlApiError extends Error {
    constructor(
        message: string,
        public readonly status?: number,
    ) {
        super(message);
        this.name = "CdpSqlApiError";
    }
}

export class CdpSqlClient {
    constructor(
        private readonly apiKey: string | undefined = process.env.CDP_CLIENT_API_KEY,
        private readonly fetcher: typeof fetch = fetch,
    ) {}

    async runQuery<T>(sql: string, queryName: string): Promise<T[]> {
        const result = await this.runQueryWithMetadata<T>(sql, queryName);
        return result.rows;
    }

    async runQueryWithMetadata<T>(
        sql: string,
        queryName: string,
    ): Promise<CdpSqlQueryResult<T>> {
        const apiKey = this.apiKey?.trim();

        if (!apiKey) {
            throw new MissingCdpClientApiKeyError();
        }

        const response = await this.fetcher(CDP_SQL_API_URL, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ sql }),
            cache: "no-store",
        });

        if (!response.ok) {
            const responseBodyText = await response.text();

            console.error("[Base Stats][CDP] SQL API error", {
                queryName,
                status: response.status,
                statusText: response.statusText,
                body: responseBodyText,
            });

            throw new CdpSqlApiError(
                `CDP SQL API request failed (${response.status}): ${truncate(responseBodyText)}`,
                response.status,
            );
        }

        const payload = (await response.json()) as CdpSqlResponse<T>;

        if (!Array.isArray(payload.result)) {
            throw new CdpSqlApiError("CDP SQL API returned an unexpected response shape.");
        }

        return {
            columns: payload.schema?.columns?.map((column) => column.name) ?? [],
            rows: payload.result,
        };
    }
}

function truncate(value: string, maxLength = 300): string {
    const normalized = value.trim().replace(/\s+/g, " ");
    return normalized.length <= maxLength
        ? normalized
        : `${normalized.slice(0, maxLength)}...`;
}
