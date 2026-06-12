import type {
    BaseScoreBreakdown,
    BaseScoreInput,
    BaseScoreLevel,
    BaseScoreResult,
} from "../../types/baseStats";

export function calculateBaseScore(stats: BaseScoreInput): BaseScoreResult {
    // Base Score is an unofficial activity score.
    // It is not related to any token, reward, airdrop, or official Base ranking.
    // These levels are fun unofficial activity labels.
    // They are not related to any airdrop, token, reward, or official Base ranking.
    const transactions = roundScorePart(
        scaleLogarithmic(stats.transactionCount, 3000) * 20,
    );
    const activeDays = roundScorePart(scaleLinear(stats.activeDays, 500) * 25);
    const activeWeeks = roundScorePart(scaleLinear(stats.activeWeeks, 130) * 15);
    const contractInteractions = roundScorePart(
        scaleLinear(stats.contractInteractions, 300) * 20,
    );
    const contractsCreated = roundScorePart(
        scaleLinear(stats.contractsCreated, 10) * 10,
    );
    const longevity = roundScorePart(scaleLinear(getMonthsActive(stats.startOfUse), 30) * 5);
    const recency = calculateRecencyScore(stats.lastUse);

    const scoreBreakdown: BaseScoreBreakdown = {
        transactions,
        activeDays,
        activeWeeks,
        contractInteractions,
        contractsCreated,
        longevity,
        recency,
    };

    const baseScore = clampScore(
        Math.round(
        scoreBreakdown.transactions +
            scoreBreakdown.activeDays +
            scoreBreakdown.activeWeeks +
            scoreBreakdown.contractInteractions +
            scoreBreakdown.contractsCreated +
            scoreBreakdown.longevity +
            scoreBreakdown.recency,
        ),
    );

    return {
        baseScore,
        baseScoreLevel: getBaseScoreLevel(baseScore),
        scoreBreakdown,
    };
}

function scaleLinear(value: number, maxReference: number): number {
    if (maxReference <= 0) {
        return 0;
    }

    return Math.min(1, Math.max(0, value) / maxReference);
}

function scaleLogarithmic(value: number, maxReference: number): number {
    if (value <= 0 || maxReference <= 0) {
        return 0;
    }

    return Math.min(1, Math.log10(value + 1) / Math.log10(maxReference + 1));
}

function roundScorePart(value: number): number {
    return Math.round(value);
}

function clampScore(score: number): number {
    return Math.max(0, Math.min(100, score));
}

function getMonthsActive(startOfUse: string): number {
    const start = new Date(startOfUse);

    if (Number.isNaN(start.getTime())) {
        return 0;
    }

    const now = new Date();
    const yearDiff = now.getUTCFullYear() - start.getUTCFullYear();
    const monthDiff = now.getUTCMonth() - start.getUTCMonth();
    let months = yearDiff * 12 + monthDiff;

    if (now.getUTCDate() < start.getUTCDate()) {
        months -= 1;
    }

    return Math.max(0, months);
}

function calculateRecencyScore(lastUse: string): number {
    const lastUseDate = new Date(lastUse);

    if (Number.isNaN(lastUseDate.getTime())) {
        return 0;
    }

    const now = Date.now();
    const daysSinceLastUse = Math.floor(
        (now - lastUseDate.getTime()) / (24 * 60 * 60 * 1000),
    );

    if (daysSinceLastUse <= 30) {
        return 5;
    }

    if (daysSinceLastUse <= 90) {
        return 3;
    }

    if (daysSinceLastUse <= 180) {
        return 1;
    }

    return 0;
}

function getBaseScoreLevel(score: number): BaseScoreLevel {
    if (score <= 10) {
        return "Fresh Wallet 🐣";
    }

    if (score <= 20) {
        return "Base Tourist 🧳";
    }

    if (score <= 30) {
        return "Gas Sniffer ⛽";
    }

    if (score <= 40) {
        return "Chain Walker 👟";
    }

    if (score <= 50) {
        return "Contract Curious 🧪";
    }

    if (score <= 60) {
        return "Onchain Regular 🔁";
    }

    if (score <= 70) {
        return "Base Grinder ⚙️";
    }

    if (score <= 80) {
        return "Contract Goblin 👹";
    }

    if (score <= 90) {
        return "Based Chad 🟦";
    }

    return "Base Native 🧬";
}
