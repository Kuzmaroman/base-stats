import { NextResponse } from "next/server";

import { BlockscoutApiError } from "../../../../../lib/providers/blockscoutClient";
import { BlockscoutAnalyticsProvider } from "../../../../../lib/providers/blockscoutAnalyticsProvider";
import type { ErrorResponse } from "../../../../../types/baseStats";

type RouteContext = {
    params: Promise<{ address: string }> | { address: string };
};

export async function GET(
    _request: Request,
    context: RouteContext,
): Promise<NextResponse<Record<string, unknown> | ErrorResponse>> {
    const { address } = await Promise.resolve(context.params);

    if (!isValidWalletAddress(address)) {
        return NextResponse.json(
            {
                error: {
                    code: "INVALID_ADDRESS",
                    message: "Address must be a valid 20-byte EVM address on Base.",
                },
            },
            { status: 400 },
        );
    }

    try {
        const provider = new BlockscoutAnalyticsProvider();
        const counters = await provider.getCounters(address);

        return NextResponse.json(counters as Record<string, unknown>, { status: 200 });
    } catch (error) {
        if (error instanceof BlockscoutApiError) {
            return NextResponse.json(
                {
                    error: {
                        code: "BLOCKSCOUT_API_ERROR",
                        message: "Failed to load Blockscout counters.",
                    },
                },
                { status: 502 },
            );
        }

        return NextResponse.json(
            {
                error: {
                    code: "INTERNAL_SERVER_ERROR",
                    message: "Failed to load Blockscout counters.",
                },
            },
            { status: 500 },
        );
    }
}

function isValidWalletAddress(address: string): boolean {
    return /^0x[a-fA-F0-9]{40}$/.test(address);
}
