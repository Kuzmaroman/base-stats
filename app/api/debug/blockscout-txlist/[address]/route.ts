import { NextResponse } from "next/server";

import { BlockscoutAnalyticsProvider } from "../../../../../lib/providers/blockscoutAnalyticsProvider";

type RouteContext = {
    params: Promise<{ address: string }> | { address: string };
};

export async function GET(
    _request: Request,
    context: RouteContext,
): Promise<NextResponse> {
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
        const result = await provider.getTxListDebug(address);
        return NextResponse.json(result, { status: 200 });
    } catch (error) {
        return NextResponse.json(
            {
                error: {
                    code: "BLOCKSCOUT_TXLIST_DEBUG_ERROR",
                    message: error instanceof Error
                        ? error.message
                        : "Failed to load Blockscout txlist debug data.",
                },
            },
            { status: 502 },
        );
    }
}

function isValidWalletAddress(address: string): boolean {
    return /^0x[a-fA-F0-9]{40}$/.test(address);
}
