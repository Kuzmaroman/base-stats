import type { BaseAnalyticsProvider } from "./baseAnalyticsProvider";
import { CdpSqlApiError, CdpSqlClient } from "./cdpSqlClient";
import {
    countUniqueDays,
    countUniqueMonths,
    countUniqueWeeks,
} from "../utils/activityPeriods";
import type {
    BaseActivityPeriods,
    BaseWalletActivity,
    BaseWalletActivityResult,
    BaseTransactionSummary,
    BaseTransactionsSchemaSample,
} from "../../types/baseStats";

interface CdpTransactionSummaryRow {
    transaction_count?: number | string | null;
    start_of_use?: string | null;
    last_use?: string | null;
}

interface CdpActivityPeriodsRow {
    active_days?: number | string | null;
    active_weeks?: number | string | null;
    active_months?: number | string | null;
}

interface CdpTimestampRow {
    timestamp?: string | null;
}

interface CdpWalletSampleRow {
    transaction_hash?: string | null;
    timestamp?: string | null;
    from_address?: string | null;
    to_address?: string | null;
    action?: number | string | null;
}

export class CdpAnalyticsProvider implements BaseAnalyticsProvider {
    constructor(private readonly sqlClient: CdpSqlClient = new CdpSqlClient()) {}

    async getWalletActivity(address: string): Promise<BaseWalletActivityResult> {
        const [transactionSummary, activityPeriods] = await Promise.all([
            this.getTransactionSummary(address),
            this.getActivityPeriods(address),
        ]);

        const activity: BaseWalletActivity = {
            transactionCount: transactionSummary.transactionCount,
            contractInteractions: 0,
            contractsCreated: 0,
            activeDays: activityPeriods.activeDays,
            activeWeeks: activityPeriods.activeWeeks,
            activeMonths: activityPeriods.activeMonths,
            startOfUse: transactionSummary.startOfUse,
            lastUse: transactionSummary.lastUse,
        };

        return {
            activity,
            method: "cdp",
            pagesFetched: 0,
            transactionsProcessed: 0,
        };
    }

    async getTransactionSummary(address: string): Promise<BaseTransactionSummary> {
        const normalizedAddress = normalizeAddress(address);
        const cutoffDateTime = getCutoffDateTime();
        const rows = await this.sqlClient.runQuery<CdpTransactionSummaryRow>(
            buildTransactionSummaryQuery(normalizedAddress, cutoffDateTime),
            "transaction-summary-last-365-days",
        );
        const row = rows[0];

        return {
            transactionCount: toNumber(row?.transaction_count),
            startOfUse: toIsoTimestamp(row?.start_of_use),
            lastUse: toIsoTimestamp(row?.last_use),
        };
    }

    async getActivityPeriods(address: string): Promise<BaseActivityPeriods> {
        const normalizedAddress = normalizeAddress(address);
        const cutoffDateTime = getCutoffDateTime();

        try {
            const rows = await this.sqlClient.runQuery<CdpActivityPeriodsRow>(
                buildActivityPeriodsQuery(normalizedAddress, cutoffDateTime),
                "activity-periods-last-365-days",
            );
            const row = rows[0];

            return {
                activeDays: toNumber(row?.active_days),
                activeWeeks: toNumber(row?.active_weeks),
                activeMonths: toNumber(row?.active_months),
            };
        } catch (error) {
            if (!(error instanceof CdpSqlApiError)) {
                throw error;
            }

            console.warn("[Base Stats][CDP] Falling back to timestamp-based activity calculation", {
                queryName: "activity-periods-last-365-days",
                reason: error.message,
            });

            const fallbackRows = await this.sqlClient.runQuery<CdpTimestampRow>(
                buildActivityTimestampsFallbackQuery(normalizedAddress, cutoffDateTime),
                "activity-periods-fallback-timestamps-last-365-days",
            );
            const timestamps = fallbackRows
                .map((row) => toIsoTimestamp(row.timestamp))
                .filter((timestamp) => timestamp.length > 0);

            return {
                activeDays: countUniqueDays(timestamps),
                activeWeeks: countUniqueWeeks(timestamps),
                activeMonths: countUniqueMonths(timestamps),
            };
        }
    }

    async getTransactionsSchemaSample(): Promise<BaseTransactionsSchemaSample> {
        const result = await this.sqlClient.runQueryWithMetadata<Record<string, unknown>>(
            buildTransactionsSchemaQuery(),
            "transactions-schema-sample",
        );
        const sampleRow = result.rows[0] ?? null;

        return {
            columns: result.columns.length > 0 ? result.columns : Object.keys(sampleRow ?? {}),
            sampleRow,
        };
    }

    async getWalletSample(address: string): Promise<Record<string, unknown>[]> {
        const normalizedAddress = normalizeAddress(address);
        const cutoffDateTime = getCutoffDateTime();
        const rows = await this.sqlClient.runQuery<CdpWalletSampleRow>(
            buildWalletSampleQuery(normalizedAddress, cutoffDateTime),
            "wallet-sample-last-365-days",
        );

        return rows.map((row) => ({
            transaction_hash: row.transaction_hash ?? "",
            timestamp: toIsoTimestamp(row.timestamp),
            from_address: row.from_address ?? "",
            to_address: row.to_address ?? "",
            action: toNumber(row.action),
        }));
    }
}

function buildTransactionSummaryQuery(address: string, cutoffDateTime: string): string {
    return `
        SELECT
            COUNT(*) AS transaction_count,
            MIN(t.timestamp) AS start_of_use,
            MAX(t.timestamp) AS last_use
        FROM base.transactions t
        WHERE ${buildBaseTransactionsWhereClause(address, cutoffDateTime)}
    `;
}

function buildActivityPeriodsQuery(address: string, cutoffDateTime: string): string {
    return `
        SELECT
            COUNT(DISTINCT DATE(t.timestamp)) AS active_days,
            COUNT(DISTINCT DATE_TRUNC('week', t.timestamp)) AS active_weeks,
            COUNT(DISTINCT DATE_TRUNC('month', t.timestamp)) AS active_months
        FROM base.transactions t
        WHERE ${buildBaseTransactionsWhereClause(address, cutoffDateTime)}
    `;
}

function buildTransactionsSchemaQuery(): string {
    return `
        SELECT *
        FROM base.transactions
        LIMIT 1
    `;
}

function buildActivityTimestampsFallbackQuery(address: string, cutoffDateTime: string): string {
    return `
        SELECT
            t.timestamp
        FROM base.transactions t
        WHERE ${buildBaseTransactionsWhereClause(address, cutoffDateTime)}
        ORDER BY t.timestamp DESC
        LIMIT 100
    `;
}

function buildWalletSampleQuery(address: string, cutoffDateTime: string): string {
    return `
        SELECT
            t.transaction_hash,
            t.timestamp,
            t.from_address,
            t.to_address,
            t.action
        FROM base.transactions t
        WHERE ${buildBaseTransactionsWhereClause(address, cutoffDateTime)}
        ORDER BY t.timestamp DESC
        LIMIT 5
    `;
}

function buildBaseTransactionsWhereClause(address: string, cutoffDateTime: string): string {
    // base.transactions has no separate status column in the confirmed schema.
    // For now, action = 1 plus the 365-day window keeps debugging queries lightweight.
    return `
        LOWER(t.from_address) = LOWER('${address}')
        AND t.action = 1
        AND t.timestamp >= toDateTime('${cutoffDateTime}')
    `;
}

function getCutoffDateTime(): string {
    // TODO: This temporary 365-day window avoids full-table scans while debugging.
    // TODO: Restore all-time support with an optimized query plan or indexed source.
    return toCdpDateTime(
        new Date(Date.now() - 365 * 24 * 60 * 60 * 1000),
    );
}

function toCdpDateTime(date: Date): string {
    return date.toISOString().slice(0, 19).replace("T", " ");
}

function normalizeAddress(address: string): string {
    return address.toLowerCase();
}

function toIsoTimestamp(value?: string | null): string {
    if (!value) {
        return "";
    }

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function toNumber(value?: number | string | null): number {
    if (typeof value === "number") {
        return Number.isFinite(value) ? value : 0;
    }

    if (typeof value === "string") {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : 0;
    }

    return 0;
}
