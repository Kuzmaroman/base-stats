const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function countUniqueDays(timestamps: string[]): number {
    return collectUniqueKeys(timestamps, toUtcDayKey).size;
}

export function countUniqueWeeks(timestamps: string[]): number {
    return collectUniqueKeys(timestamps, toUtcWeekKey).size;
}

export function countUniqueMonths(timestamps: string[]): number {
    return collectUniqueKeys(timestamps, toUtcMonthKey).size;
}

function collectUniqueKeys(
    timestamps: string[],
    getKey: (date: Date) => string,
): Set<string> {
    const uniqueKeys = new Set<string>();

    for (const timestamp of timestamps) {
        const date = new Date(timestamp);

        if (Number.isNaN(date.getTime())) {
            continue;
        }

        uniqueKeys.add(getKey(date));
    }

    return uniqueKeys;
}

function toUtcDayKey(date: Date): string {
    return date.toISOString().slice(0, 10);
}

function toUtcMonthKey(date: Date): string {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, "0");

    return `${year}-${month}`;
}

function toUtcWeekKey(date: Date): string {
    const midnightUtc = Date.UTC(
        date.getUTCFullYear(),
        date.getUTCMonth(),
        date.getUTCDate(),
    );
    const dayOfWeek = (date.getUTCDay() + 6) % 7;
    const mondayUtc = new Date(midnightUtc - dayOfWeek * MS_PER_DAY);

    return toUtcDayKey(mondayUtc);
}
