import type {
    BaseWalletActivityResult,
} from "../../types/baseStats";

export interface BaseAnalyticsProvider {
    getWalletActivity(address: string): Promise<BaseWalletActivityResult>;
}

export class ProviderNotConfiguredError extends Error {
    constructor(message = "Base analytics provider is not configured.") {
        super(message);
        this.name = "ProviderNotConfiguredError";
    }
}

export class UnconfiguredBaseAnalyticsProvider implements BaseAnalyticsProvider {
    async getWalletActivity(address: string): Promise<BaseWalletActivityResult> {
        void address;
        // TODO: Replace with a real Base wallet activity provider such as Blockscout or another source.
        throw new ProviderNotConfiguredError();
    }
}
