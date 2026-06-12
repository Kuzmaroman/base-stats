import { NextResponse } from "next/server";

import { CdpAnalyticsProvider } from "../../../../../lib/providers/cdpAnalyticsProvider";
import {
    CdpSqlApiError,
    MissingCdpClientApiKeyError,
} from "../../../../../lib/providers/cdpSqlClient";
import type { ErrorResponse } from "../../../../../types/baseStats";

type RouteContext = {
    params: Promise<{ address: string }> | { address: string };
};

export async function GET(
    _request: Request,
    context: RouteContext,
): Promise<NextResponse<Record<string, unknown>[] | ErrorResponse>> {
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
        const provider = new CdpAnalyticsProvider();
        const rows = await provider.getWalletSample(address);

        return NextResponse.json(rows, { status: 200 });
    } catch (error) {
        if (error instanceof MissingCdpClientApiKeyError) {
            return NextResponse.json(
                {
                    error: {
                        code: "MISSING_CDP_CLIENT_API_KEY",
                        message:
                            "CDP_CLIENT_API_KEY is missing. Add it to .env.local before calling this endpoint.",
                    },
                },
                { status: 503 },
            );
        }

        if (error instanceof CdpSqlApiError) {
            return NextResponse.json(
                {
                    error: {
                        code: "CDP_SQL_API_ERROR",
                        message: "Failed to load wallet sample transactions from CDP SQL API.",
                    },
                },
                { status: 502 },
            );
        }

        return NextResponse.json(
            {
                error: {
                    code: "INTERNAL_SERVER_ERROR",
                    message: "Failed to load wallet sample transactions.",
                },
            },
            { status: 500 },
        );
    }
}

function isValidWalletAddress(address: string): boolean {
    return /^0x[a-fA-F0-9]{40}$/.test(address);
}
