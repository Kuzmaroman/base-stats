"use client";

import { toPng } from "html-to-image";
import type { FormEvent, RefObject } from "react";
import { useEffect, useRef, useState, useTransition } from "react";

import type { BaseScoreBreakdown, BaseStats } from "../types/baseStats";

type ApiError = {
  error?: {
    code?: string;
    message?: string;
  };
};

export default function Home() {
  const shareCardRef = useRef<HTMLDivElement | null>(null);
  const exportShareCardRef = useRef<HTMLDivElement | null>(null);
  const [address, setAddress] = useState("");
  const [stats, setStats] = useState<BaseStats | null>(null);
  const [error, setError] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");
  const [isDownloadingImage, setIsDownloadingImage] = useState(false);
  const [hideWalletOnShareCard, setHideWalletOnShareCard] = useState(true);
  const [walletProviderDetected, setWalletProviderDetected] = useState(false);
  const [walletStatusMessage, setWalletStatusMessage] = useState(
    "Wallet not detected. You can paste an address manually.",
  );
  const [isConnectingWallet, setIsConnectingWallet] = useState(false);

  useEffect(() => {
    let isMounted = true;

    function initializeWallet() {
      if (typeof window === "undefined" || !window.ethereum) {
        if (isMounted) {
          setWalletProviderDetected(false);
          setWalletStatusMessage("Wallet not detected. You can paste an address manually.");
        }
        return;
      }

      if (isMounted) {
        setWalletProviderDetected(true);
        setWalletStatusMessage("Wallet detected. Connect or switch accounts anytime.");
      }
    }

    const handleAccountsChanged = (accounts: string[]) => {
      const nextAccount = accounts[0];

      if (nextAccount) {
        setAddress(nextAccount);
        setWalletStatusMessage("Connected wallet detected.");
        return;
      }

      setWalletStatusMessage("Wallet disconnected. You can paste an address manually.");
    };

    initializeWallet();
    window.ethereum?.on?.("accountsChanged", handleAccountsChanged);

    return () => {
      isMounted = false;
      window.ethereum?.removeListener?.("accountsChanged", handleAccountsChanged);
    };
  }, []);

  async function fetchStats(walletAddress: string) {
    setIsLoading(true);
    setError("");
    setCopyState("idle");

    try {
      const response = await fetch(`/api/stats/${walletAddress.trim()}`, {
        method: "GET",
        cache: "no-store",
      });
      const payload = (await response.json()) as BaseStats | ApiError;

      if (!response.ok) {
        throw new Error(
          "error" in payload && payload.error?.message
            ? payload.error.message
            : "Failed to load Base stats.",
        );
      }

      startTransition(() => {
        setStats(payload as BaseStats);
      });
    } catch (fetchError) {
      setStats(null);
      setError(
        fetchError instanceof Error
          ? fetchError.message
          : "Failed to load Base stats.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  async function handleCopyShareText() {
    if (!stats) {
      return;
    }

    const shareText = buildShareText(stats);

    try {
      await navigator.clipboard.writeText(shareText);
      setCopyState("copied");
    } catch {
      setCopyState("error");
    }
  }

  async function handleDownloadImage() {
    if (!exportShareCardRef.current || !stats) {
      return;
    }

    setIsDownloadingImage(true);

    try {
      const dataUrl = await toPng(exportShareCardRef.current, {
        cacheBust: true,
        pixelRatio: 2,
        canvasWidth: 1200,
        canvasHeight: 675,
        backgroundColor: "#030712",
      });
      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = `base-stats-${toShareFileSlug(stats.address)}.png`;
      link.click();
    } finally {
      setIsDownloadingImage(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isValidWalletAddress(address)) {
      setError("Enter a valid Base wallet address.");
      return;
    }
    void fetchStats(address);
  }

  async function handleConnectWallet() {
    if (!window.ethereum) {
      setWalletProviderDetected(false);
      setWalletStatusMessage("Wallet not detected. You can paste an address manually.");
      return;
    }

    setIsConnectingWallet(true);
    setError("");

    try {
      const accounts = await requestEthereumAccounts("eth_requestAccounts");
      const connectedAddress = accounts[0];

      if (!connectedAddress) {
        setWalletStatusMessage("No wallet account was returned. You can paste an address manually.");
        return;
      }

      setWalletProviderDetected(true);
      setWalletStatusMessage("Connected wallet detected.");
      setAddress(connectedAddress);
      await fetchStats(connectedAddress);
    } catch (connectError) {
      setWalletStatusMessage("Wallet connection was cancelled or unavailable.");
      setError(
        connectError instanceof Error
          ? connectError.message
          : "Failed to connect wallet.",
      );
    } finally {
      setIsConnectingWallet(false);
    }
  }

  const isBusy = isLoading || isPending || isConnectingWallet;

  return (
    <main className="min-h-screen w-full overflow-x-hidden bg-[radial-gradient(circle_at_top,_rgba(0,82,255,0.18),_transparent_35%),linear-gradient(180deg,#07101f_0%,#050915_55%,#02050c_100%)] text-white">
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col px-4 py-5 sm:max-w-2xl sm:px-5 lg:max-w-6xl lg:px-8">
        <section className="mb-5 w-full rounded-[28px] border border-white/10 bg-white/5 p-4 shadow-[0_20px_80px_rgba(0,0,0,0.35)] backdrop-blur sm:p-6 lg:p-8">
          <div className="mb-6 flex flex-col gap-3">
            <div className="inline-flex w-fit items-center rounded-full border border-blue-400/30 bg-blue-500/10 px-3 py-1 text-xs font-medium tracking-[0.2em] text-blue-200 uppercase">
              Base App
            </div>
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                Base Stats
              </h1>
              <p className="mt-2 max-w-xl text-sm leading-6 text-slate-300 sm:text-base">
                Unofficial Base wallet activity checker
              </p>
            </div>
          </div>

          <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
            <div className="flex w-full min-w-0 flex-col gap-3 lg:flex-row">
              <label className="min-w-0 flex-1">
                <span className="sr-only">Wallet address</span>
                <input
                  className="w-full min-w-0 rounded-2xl border border-white/12 bg-slate-950/70 px-4 py-3 text-xs text-white outline-none ring-0 transition placeholder:text-slate-500 focus:border-blue-400/80 sm:text-sm"
                  value={address}
                  onChange={(event) => setAddress(event.target.value)}
                  placeholder="Paste wallet address"
                  spellCheck={false}
                  autoCapitalize="off"
                  autoCorrect="off"
                />
              </label>
              <button
                type="button"
                onClick={handleConnectWallet}
                disabled={isBusy}
                className="inline-flex w-full items-center justify-center rounded-2xl border border-blue-400/30 bg-blue-500/12 px-5 py-3 text-sm font-semibold text-blue-100 transition hover:bg-blue-500/20 disabled:cursor-not-allowed disabled:opacity-70 lg:w-auto"
              >
                {isConnectingWallet ? "Connecting..." : "Connect Wallet"}
              </button>
              <button
                type="submit"
                disabled={isBusy}
                className="inline-flex w-full items-center justify-center rounded-2xl bg-blue-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-70 lg:w-auto"
              >
                {isLoading || isPending ? "Checking..." : "Check Stats"}
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
              <span
                className={`inline-flex rounded-full px-2.5 py-1 ${
                  walletProviderDetected
                    ? "border border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
                    : "border border-white/10 bg-white/5 text-slate-300"
                }`}
              >
                {walletProviderDetected ? "Wallet available" : "Manual mode"}
              </span>
              <span>{walletStatusMessage}</span>
            </div>
          </form>

          {error ? (
            <div className="mt-4 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
              {error}
            </div>
          ) : null}
        </section>

        {stats ? (
          <div className="grid w-full gap-4 lg:grid-cols-[1.28fr_0.72fr]">
            <section className="w-full rounded-[28px] border border-blue-400/20 bg-[linear-gradient(135deg,rgba(0,82,255,0.22),rgba(7,16,31,0.92))] p-5 shadow-[0_20px_60px_rgba(0,82,255,0.18)] sm:p-6 md:p-7">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-blue-100/90">Base Score</p>
                  <div className="mt-4 flex flex-col gap-3">
                    <div className="flex flex-wrap items-end gap-2 text-white">
                      <span className="text-5xl font-semibold tracking-tight sm:text-6xl">
                        {stats.baseScore}
                      </span>
                      <span className="pb-1 text-xl text-blue-100/80 sm:text-2xl">/100</span>
                    </div>
                    <div className="inline-flex max-w-full rounded-full border border-white/10 bg-white/10 px-3 py-2 text-sm font-medium text-white">
                      <span className="break-words">{stats.baseScoreLevel}</span>
                    </div>
                  </div>
                </div>
                <div className="w-full rounded-3xl border border-white/10 bg-white/8 px-4 py-3 text-left sm:w-auto sm:text-right">
                  <p className="text-xs uppercase tracking-[0.2em] text-blue-100/60">
                    Wallet
                  </p>
                  <p className="mt-2 break-all text-xs text-slate-200 sm:text-sm">
                    {shortAddress(stats.address)}
                  </p>
                </div>
              </div>

              <div className="mt-6 h-2 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-[linear-gradient(90deg,#60a5fa_0%,#38bdf8_100%)]"
                  style={{ width: `${stats.baseScore}%` }}
                />
              </div>

              <p className="mt-4 max-w-2xl text-sm leading-6 break-words text-slate-200/85">
                Unofficial activity score. Not related to any token, reward,
                airdrop, or official Base ranking.
              </p>
            </section>

            <section className="w-full rounded-[28px] border border-white/10 bg-white/5 p-5 backdrop-blur sm:p-6">
              <div className="mb-4">
                <p className="text-sm font-medium text-slate-200">Timeline</p>
                <p className="mt-1 text-xs text-slate-400">
                  How long this wallet has been active on Base
                </p>
              </div>
              <div className="space-y-4">
                <TimelineRow label="Active since" value={formatDate(stats.startOfUse)} />
                <TimelineRow label="Last active" value={formatDate(stats.lastUse)} />
              </div>
            </section>

            <section className="w-full rounded-[28px] border border-white/10 bg-white/5 p-5 backdrop-blur lg:col-span-2 sm:p-6">
              <div className="mb-4">
                <p className="text-sm font-medium text-slate-200">Wallet Stats</p>
                <p className="mt-1 text-xs text-slate-400">
                  Core Base activity metrics from the live backend
                </p>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-6">
                <StatCard label="Transactions" value={formatNumber(stats.transactionCount)} />
                <StatCard label="Active Days" value={formatNumber(stats.activeDays)} />
                <StatCard label="Active Weeks" value={formatNumber(stats.activeWeeks)} />
                <StatCard label="Active Months" value={formatNumber(stats.activeMonths)} />
                <StatCard label="Contracts" value={formatNumber(stats.contractInteractions)} />
                <StatCard label="Created" value={formatNumber(stats.contractsCreated)} />
              </div>
            </section>

            <section className="w-full rounded-[28px] border border-white/10 bg-white/5 p-5 backdrop-blur lg:col-span-2 sm:p-6">
              <div className="mb-4">
                <p className="text-sm font-medium text-slate-200">Score Breakdown</p>
                <p className="mt-1 text-xs text-slate-400">
                  Where the unofficial activity score comes from
                </p>
              </div>

              <div className="space-y-3">
                <BreakdownRow label="Transactions" max={20} value={stats.scoreBreakdown.transactions} />
                <BreakdownRow label="Active Days" max={25} value={stats.scoreBreakdown.activeDays} />
                <BreakdownRow label="Active Weeks" max={15} value={stats.scoreBreakdown.activeWeeks} />
                <BreakdownRow
                  label="Contract Interactions"
                  max={20}
                  value={stats.scoreBreakdown.contractInteractions}
                />
                <BreakdownRow
                  label="Contracts Created"
                  max={10}
                  value={stats.scoreBreakdown.contractsCreated}
                />
                <BreakdownRow label="Longevity" max={5} value={stats.scoreBreakdown.longevity} />
                <BreakdownRow label="Recency" max={5} value={stats.scoreBreakdown.recency} />
              </div>
            </section>

            <section className="w-full rounded-[28px] border border-white/10 bg-white/5 p-5 backdrop-blur lg:col-span-2 sm:p-6">
              <div className="mb-5 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-200">Share your Base Stats</p>
                  <p className="mt-1 text-xs leading-6 text-slate-400">
                    Download a social-ready score card or copy a compact text summary.
                  </p>
                </div>
                <div className="flex flex-col gap-3 md:items-end">
                  <label className="inline-flex items-center gap-3 text-sm text-slate-300">
                    <button
                      type="button"
                      aria-pressed={hideWalletOnShareCard}
                      onClick={() => setHideWalletOnShareCard((current) => !current)}
                      className={`relative inline-flex h-7 w-12 items-center rounded-full border transition ${
                        hideWalletOnShareCard
                          ? "border-blue-400/60 bg-blue-500/35"
                          : "border-white/12 bg-slate-900/70"
                      }`}
                    >
                      <span
                        className={`h-5 w-5 rounded-full bg-white shadow transition ${
                          hideWalletOnShareCard ? "translate-x-6" : "translate-x-1"
                        }`}
                      />
                    </button>
                    <span>Hide wallet on share card</span>
                  </label>
                  <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
                    <button
                      type="button"
                      onClick={handleDownloadImage}
                      disabled={isDownloadingImage}
                      className="inline-flex w-full items-center justify-center rounded-2xl bg-blue-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-70 sm:w-auto"
                    >
                      {isDownloadingImage ? "Generating image..." : "Download image"}
                    </button>
                    <button
                      type="button"
                      onClick={handleCopyShareText}
                      className="inline-flex w-full items-center justify-center rounded-2xl border border-blue-400/30 bg-blue-500/12 px-4 py-3 text-sm font-medium text-blue-100 transition hover:bg-blue-500/20 sm:w-auto"
                    >
                      {copyState === "copied"
                        ? "Copied"
                        : copyState === "error"
                          ? "Copy failed"
                          : "Copy share text"}
                    </button>
                  </div>
                </div>
              </div>

              <div className="block sm:hidden rounded-2xl border border-white/8 bg-slate-950/45 px-4 py-3 text-sm text-slate-300">
                Preview hidden on mobile. Download image still works.
              </div>

              <div className="hidden w-full sm:block">
                <ShareCard
                  hideWallet={hideWalletOnShareCard}
                  mode="preview"
                  shareRef={shareCardRef}
                  stats={stats}
                />
              </div>
            </section>
          </div>
        ) : (
          <section className="rounded-[28px] border border-dashed border-white/10 bg-white/3 p-5 text-center text-sm text-slate-400 sm:p-8">
            {isBusy ? <LoadingState /> : "Enter a wallet address to load Base activity stats."}
          </section>
        )}

        {stats ? (
          <div className="pointer-events-none fixed left-[-9999px] top-0 h-0 w-0 overflow-hidden">
            <ShareCard
              hideWallet={hideWalletOnShareCard}
              mode="export"
              shareRef={exportShareCardRef}
              stats={stats}
            />
          </div>
        ) : null}

        <footer className="mt-6 w-full rounded-[24px] border border-white/10 bg-white/4 px-4 py-4 text-sm text-slate-300 sm:px-5">
          <p className="leading-6 text-slate-200">
            Base Stats is an unofficial community-built tool. It is not affiliated with
            Base, Coinbase, or any official rewards or airdrop program.
          </p>
          <div className="mt-3 flex flex-col gap-2 text-xs uppercase tracking-[0.18em] text-slate-400 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
            <span>Built on Base</span>
            <span>Data from Blockscout</span>
            <span>Unofficial community tool</span>
          </div>
        </footer>
      </div>
    </main>
  );
}

async function requestEthereumAccounts(method: "eth_requestAccounts"): Promise<string[]> {
  if (!window.ethereum) {
    return [];
  }

  const response = await window.ethereum.request({ method });
  return Array.isArray(response) ? response.filter(isString) : [];
}

function isValidWalletAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address.trim());
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

type ShareCardProps = {
  hideWallet: boolean;
  mode: "preview" | "export";
  stats: BaseStats;
  shareRef: RefObject<HTMLDivElement | null>;
};

const ShareCard = ({ hideWallet, mode, stats, shareRef }: ShareCardProps) => {
  const isExport = mode === "export";

  return (
    <div
      className={`relative overflow-hidden border border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.35),_transparent_34%),radial-gradient(circle_at_bottom_right,_rgba(14,165,233,0.22),_transparent_30%),linear-gradient(160deg,#07111f_0%,#020611_58%,#02040b_100%)] text-white shadow-[0_30px_80px_rgba(0,0,0,0.45)] ${
        isExport
          ? "h-[675px] w-[1200px] rounded-[36px] p-8"
          : "aspect-video w-full rounded-[28px] p-4 sm:p-5"
      }`}
      ref={shareRef}
    >
      <div
        className={`absolute rounded-full bg-blue-500/18 blur-3xl ${
          isExport ? "-top-20 right-[-70px] h-72 w-72" : "-top-12 right-[-38px] h-40 w-40"
        }`}
      />
      <div
        className={`absolute rounded-full bg-cyan-400/12 blur-3xl ${
          isExport ? "bottom-[-110px] left-[-40px] h-72 w-72" : "bottom-[-44px] left-[-18px] h-36 w-36"
        }`}
      />

      <div className="relative z-10 flex h-full flex-col justify-between">
        <div className={`flex items-start justify-between ${isExport ? "gap-6" : "gap-3"}`}>
          <div className="min-w-0">
            <div
              className={`inline-flex items-center rounded-full border border-blue-300/30 bg-blue-500/10 font-semibold tracking-[0.24em] text-blue-100 uppercase ${
                isExport ? "px-3 py-1 text-[11px]" : "px-2.5 py-1 text-[10px]"
              }`}
            >
              Base Stats
            </div>
            <p
              className={`${isExport ? "mt-4 text-sm" : "mt-2 text-[11px] leading-4"} text-slate-300`}
            >
              Unofficial Base wallet activity checker
            </p>
          </div>
          <div
            className={`rounded-3xl border border-white/10 bg-white/8 text-right ${
              isExport ? "px-4 py-3" : "max-w-[8.5rem] px-3 py-2"
            }`}
          >
            <p className={`${isExport ? "text-[11px]" : "text-[10px]"} uppercase tracking-[0.22em] text-slate-400`}>
              Wallet
            </p>
            <p
              className={`font-medium text-white ${
                isExport ? "mt-2 text-base" : "mt-1 text-xs leading-4 break-words"
              }`}
            >
              {hideWallet ? "Private Wallet" : shortAddress(stats.address)}
            </p>
          </div>
        </div>

        <div className={`relative z-10 grid ${isExport ? "grid-cols-[1.15fr_0.85fr] gap-6" : "grid-cols-1 gap-3 sm:grid-cols-[1.05fr_0.95fr]"}`}>
          <div className={`rounded-[30px] border border-white/10 bg-white/7 ${isExport ? "p-6" : "p-4"}`}>
            <p className={`${isExport ? "text-sm" : "text-xs"} font-medium text-blue-100`}>
              Base Score
            </p>
            <div className={`flex items-end ${isExport ? "mt-4 gap-4" : "mt-3 gap-2"}`}>
              <span className={`${isExport ? "text-7xl" : "text-4xl sm:text-5xl"} font-semibold tracking-tight text-white`}>
                {stats.baseScore}
              </span>
              <span className={`${isExport ? "pb-3 text-2xl" : "pb-1 text-lg"} text-blue-100/80`}>/100</span>
            </div>
            <div className={`${isExport ? "mt-4" : "mt-3"} inline-flex max-w-full rounded-full border border-white/10 bg-white/10 ${isExport ? "px-4 py-2 text-base" : "px-3 py-1.5 text-xs"} font-medium text-white`}>
              <span className="break-words">{stats.baseScoreLevel}</span>
            </div>
          </div>

          <div className={`grid grid-cols-2 ${isExport ? "gap-3" : "gap-2.5"}`}>
            <ShareStatTile compact={!isExport} label="Transactions" value={formatNumber(stats.transactionCount)} />
            <ShareStatTile compact={!isExport} label="Active Days" value={formatNumber(stats.activeDays)} />
            <ShareStatTile
              compact={!isExport}
              label="Contract Interactions"
              value={formatNumber(stats.contractInteractions)}
            />
            <ShareStatTile
              compact={!isExport}
              label="Contracts Created"
              value={formatNumber(stats.contractsCreated)}
            />
          </div>
        </div>

        <div className={`relative z-10 flex ${isExport ? "items-end justify-between gap-6" : "flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"}`}>
          <div className={`grid grid-cols-2 ${isExport ? "gap-3 text-sm" : "gap-2 text-xs"} text-slate-300`}>
            <div className={`rounded-2xl border border-white/8 bg-white/5 ${isExport ? "px-4 py-3" : "px-3 py-2.5"}`}>
              <p className={`${isExport ? "text-[11px]" : "text-[10px]"} uppercase tracking-[0.18em] text-slate-400`}>Active since</p>
              <p className={`${isExport ? "mt-2 text-base" : "mt-1 text-sm"} font-medium text-white`}>{formatDate(stats.startOfUse)}</p>
            </div>
            <div className={`rounded-2xl border border-white/8 bg-white/5 ${isExport ? "px-4 py-3" : "px-3 py-2.5"}`}>
              <p className={`${isExport ? "text-[11px]" : "text-[10px]"} uppercase tracking-[0.18em] text-slate-400`}>Last active</p>
              <p className={`${isExport ? "mt-2 text-base" : "mt-1 text-sm"} font-medium text-white`}>{formatDate(stats.lastUse)}</p>
            </div>
          </div>
          <p
            className={`text-slate-300 ${
              isExport
                ? "max-w-xs text-right text-sm leading-6"
                : "max-w-[11rem] text-right text-[11px] leading-5 sm:self-end"
            }`}
          >
            Unofficial Base activity score
          </p>
        </div>
      </div>
    </div>
  );
};

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl border border-white/8 bg-slate-950/55 p-4">
      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-3 text-2xl font-semibold tracking-tight text-white">{value}</p>
    </div>
  );
}

function TimelineRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl border border-white/8 bg-slate-950/55 p-4">
      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-3 text-lg font-medium text-white">{value}</p>
    </div>
  );
}

function BreakdownRow({
  label,
  max,
  value,
}: {
  label: keyof BaseScoreBreakdown | string;
  max: number;
  value: number;
}) {
  const width = Math.max(8, (value / max) * 100);

  return (
    <div className="flex items-center justify-between rounded-2xl border border-white/8 bg-slate-950/45 px-4 py-3">
      <div className="min-w-0 flex-1 pr-3">
        <div className="flex items-center justify-between gap-3">
          <span className="truncate text-sm text-slate-300">{label}</span>
          <span className="rounded-full bg-blue-500/15 px-3 py-1 text-sm font-semibold whitespace-nowrap text-blue-100">
            {value} pts
          </span>
        </div>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/8">
          <div
            className="h-full rounded-full bg-[linear-gradient(90deg,#60a5fa_0%,#38bdf8_100%)]"
            style={{ width: `${width}%` }}
          />
        </div>
      </div>
    </div>
  );
}

function ShareStatTile({
  compact = false,
  label,
  value,
}: {
  compact?: boolean;
  label: string;
  value: string;
}) {
  return (
    <div className={`rounded-3xl border border-white/8 bg-slate-950/50 ${compact ? "p-3" : "p-4"}`}>
      <p
        className={`${compact ? "text-[10px] leading-4" : "text-[11px]"} break-words uppercase tracking-[0.18em] text-slate-400`}
      >
        {label}
      </p>
      <p
        className={`${compact ? "mt-2 text-lg sm:text-xl" : "mt-3 text-2xl"} font-semibold tracking-tight text-white`}
      >
        {value}
      </p>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="space-y-3">
      <div className="mx-auto h-4 w-40 animate-pulse rounded-full bg-white/8" />
      <div className="mx-auto h-16 w-full max-w-sm animate-pulse rounded-3xl bg-white/6" />
      <div className="mx-auto h-16 w-full max-w-sm animate-pulse rounded-3xl bg-white/6" />
    </div>
  );
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatDate(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function shortAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function toShareFileSlug(address: string): string {
  return `${address.slice(0, 6)}-${address.slice(-4)}`.toLowerCase();
}

function buildShareText(stats: BaseStats): string {
  return [
    `My Base Score is ${stats.baseScore}/100 — ${stats.baseScoreLevel}`,
    `${formatNumber(stats.transactionCount)} transactions`,
    `${formatNumber(stats.activeDays)} active days`,
    `${formatNumber(stats.contractInteractions)} contract interactions`,
    `${formatNumber(stats.contractsCreated)} contracts created`,
    "Built with Base Stats",
  ].join("\n");
}
