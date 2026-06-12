import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { type BaseAnalyticsProvider } from "../providers/baseAnalyticsProvider";
import { calculateBaseScore } from "../utils/baseScore";
import type {
    BaseStats,
    BaseStatsCacheSource,
    BaseStatsResult,
} from "../../types/baseStats";

const CACHE_TTL_MS = 30 * 60 * 1000;
const CACHE_DIR = path.join(process.cwd(), ".cache", "base-stats");
const ENABLE_FILE_CACHE = process.env.NODE_ENV !== "production";
const CACHE_VERSION = "v2";

type CachedStatsEntry = {
    version: string;
    cachedAt: string;
    stats: BaseStats;
    pagesFetched: number;
    transactionsProcessed: number;
};

type MemoryCacheEntry = CachedStatsEntry & {
    expiresAt: number;
};

const statsMemoryCache = new Map<string, MemoryCacheEntry>();

export class BaseStatsService {
    constructor(private readonly provider: BaseAnalyticsProvider) {}

    async getStats(address: string): Promise<BaseStats> {
        const result = await this.getStatsResult(address);
        return result.stats;
    }

    async getStatsResult(address: string): Promise<BaseStatsResult> {
        const normalizedAddress = normalizeAddress(address);

        const memoryEntry = statsMemoryCache.get(normalizedAddress);
        if (memoryEntry && memoryEntry.expiresAt > Date.now()) {
            console.log("[Base Stats][Cache] hit", { address: normalizedAddress, source: "memory" });
            return toStatsResult(memoryEntry, "memory");
        }

        const fileEntry = await readFileCache(normalizedAddress);
        if (fileEntry) {
            console.log("[Base Stats][Cache] hit", { address: normalizedAddress, source: "file" });
            setMemoryCache(normalizedAddress, fileEntry);
            return toStatsResult(fileEntry, "file");
        }

        console.log("[Base Stats][Cache] miss", { address: normalizedAddress });

        const walletActivityResult = await this.provider.getWalletActivity(normalizedAddress);
        const walletActivity = walletActivityResult.activity;
        const baseStatsInput = {
            address: normalizedAddress,
            transactionCount: walletActivity.transactionCount,
            contractInteractions: walletActivity.contractInteractions,
            contractsCreated: walletActivity.contractsCreated,
            activeDays: walletActivity.activeDays,
            activeWeeks: walletActivity.activeWeeks,
            activeMonths: walletActivity.activeMonths,
            startOfUse: walletActivity.startOfUse,
            lastUse: walletActivity.lastUse,
        };
        const score = calculateBaseScore(baseStatsInput);
        const stats: BaseStats = {
            ...baseStatsInput,
            ...score,
        };

        const cacheEntry: CachedStatsEntry = {
            version: CACHE_VERSION,
            cachedAt: new Date().toISOString(),
            stats,
            pagesFetched: walletActivityResult.pagesFetched,
            transactionsProcessed: walletActivityResult.transactionsProcessed,
        };

        setMemoryCache(normalizedAddress, cacheEntry);
        await writeFileCache(normalizedAddress, cacheEntry);

        return toStatsResult(cacheEntry, "fresh");
    }
}

export function createBaseStatsService(provider: BaseAnalyticsProvider): BaseStatsService {
    return new BaseStatsService(provider);
}

function normalizeAddress(address: string): string {
    return address.toLowerCase();
}

function toStatsResult(
    entry: CachedStatsEntry,
    cacheSource: BaseStatsCacheSource,
): BaseStatsResult {
    return {
        stats: entry.stats,
        cacheSource,
        pagesFetched: entry.pagesFetched,
        transactionsProcessed: entry.transactionsProcessed,
    };
}

function setMemoryCache(address: string, entry: CachedStatsEntry): void {
    statsMemoryCache.set(address, {
        ...entry,
        expiresAt: Date.now() + CACHE_TTL_MS,
    });
}

async function readFileCache(address: string): Promise<CachedStatsEntry | null> {
    if (!ENABLE_FILE_CACHE) {
        return null;
    }

    try {
        const filePath = getCacheFilePath(address);
        const raw = await readFile(filePath, "utf8");
        const parsed = JSON.parse(raw) as CachedStatsEntry;

        if (parsed.version !== CACHE_VERSION) {
            return null;
        }

        if (!parsed.cachedAt || Date.now() - new Date(parsed.cachedAt).getTime() > CACHE_TTL_MS) {
            return null;
        }

        return parsed;
    } catch {
        return null;
    }
}

async function writeFileCache(address: string, entry: CachedStatsEntry): Promise<void> {
    if (!ENABLE_FILE_CACHE) {
        return;
    }

    try {
        await mkdir(CACHE_DIR, { recursive: true });
        await writeFile(
            getCacheFilePath(address),
            JSON.stringify(entry, null, 2),
            "utf8",
        );
    } catch (error) {
        console.warn("[Base Stats][Cache] failed to write file cache", {
            address,
            error: error instanceof Error ? error.message : "unknown",
        });
    }
}

function getCacheFilePath(address: string): string {
    return path.join(CACHE_DIR, `${address}.json`);
}
