import { NextResponse } from "next/server";

import { BlockscoutAnalyticsProvider } from "../../../../lib/providers/blockscoutAnalyticsProvider";
import { BlockscoutApiError } from "../../../../lib/providers/blockscoutClient";
import { createBaseStatsService } from "../../../../lib/services/baseStatsService";
import type { BaseStats, ErrorResponse } from "../../../../types/baseStats";

type RouteContext = {
    params: Promise<{ address: string }> | { address: string };
};

export async function GET(
    _request: Request,
    context: RouteContext,
): Promise<NextResponse<BaseStats | ErrorResponse>> {
    const startedAt = Date.now();
    const { address } = await Promise.resolve(context.params);

    if (!isValidWalletAddress(address)) {
        return NextResponse.json(
            {
                error: {
                    code: "INVALID_ADDRESS",
                    message:
                        "Address must be a valid 20-byte EVM address on Base.",
                },
            },
            { status: 400 },
        );
    }

    try {
        const baseStatsService = createBaseStatsService(
            new BlockscoutAnalyticsProvider(),
        );
        const result = await baseStatsService.getStatsResult(address);

        console.log("[Base Stats][Route] /api/stats completed", {
            address: result.stats.address,
            durationMs: Date.now() - startedAt,
            cacheSource: result.cacheSource,
            method: result.method,
            pagesFetched: result.pagesFetched,
            transactionsProcessed: result.transactionsProcessed,
        });

        return NextResponse.json(result.stats, { status: 200 });
    } catch (error) {
        if (error instanceof BlockscoutApiError) {
            return NextResponse.json(
                {
                    error: {
                        code: "STATS_PROVIDER_ERROR",
                        message: "Failed to load Base wallet stats.",
                    },
                },
                { status: 502 },
            );
        }

        return NextResponse.json(
            {
                error: {
                    code: "STATS_PROVIDER_ERROR",
                    message: "Failed to load Base wallet stats.",
                },
            },
            { status: 500 },
        );
    }
}

function isValidWalletAddress(address: string): boolean {
    return /^0x[a-fA-F0-9]{40}$/.test(address);
}
