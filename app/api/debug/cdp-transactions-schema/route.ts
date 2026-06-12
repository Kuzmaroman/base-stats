import { NextResponse } from "next/server";

import { CdpAnalyticsProvider } from "../../../../lib/providers/cdpAnalyticsProvider";
import {
    CdpSqlApiError,
    MissingCdpClientApiKeyError,
} from "../../../../lib/providers/cdpSqlClient";
import type {
    BaseTransactionsSchemaSample,
    ErrorResponse,
} from "../../../../types/baseStats";

export async function GET(): Promise<
    NextResponse<BaseTransactionsSchemaSample | ErrorResponse>
> {
    try {
        const provider = new CdpAnalyticsProvider();
        const schemaSample = await provider.getTransactionsSchemaSample();

        return NextResponse.json(schemaSample, { status: 200 });
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
                        message: "Failed to inspect the CDP transactions schema.",
                    },
                },
                { status: 502 },
            );
        }

        return NextResponse.json(
            {
                error: {
                    code: "INTERNAL_SERVER_ERROR",
                    message: "Failed to inspect the CDP transactions schema.",
                },
            },
            { status: 500 },
        );
    }
}
