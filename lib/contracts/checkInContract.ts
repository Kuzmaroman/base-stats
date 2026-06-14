import {
  createPublicClient,
  createWalletClient,
  custom,
  encodeFunctionData,
  getAddress,
  http,
  isAddress,
  isHex,
  type Address,
  type Chain,
  type Hex,
} from "viem";
import { base, baseSepolia } from "viem/chains";

import { baseStatsCheckInAbi } from "./baseStatsCheckInAbi";

const DEFAULT_CHECKIN_CHAIN_ID = 8453;
const BASE_MAINNET_CHAIN_HEX = "0x2105";
const BASE_SEPOLIA_CHAIN_HEX = "0x14a34";

export interface CheckInChainConfig {
  chain: Chain;
  chainId: 8453 | 84532;
  chainName: "Base" | "Base Sepolia";
  chainHex: Hex;
  rpcUrls: string[];
  blockExplorerUrls: string[];
}

export interface DailyCheckInStats {
  lastCheckInDay: number;
  currentStreak: number;
  longestStreak: number;
  checkedInToday: boolean;
}

export function getCheckInChainConfig(): CheckInChainConfig {
  const configuredChainId = Number(process.env.NEXT_PUBLIC_CHECKIN_CHAIN_ID?.trim() ?? "");

  if (configuredChainId === 84532) {
    return {
      chain: baseSepolia,
      chainId: 84532,
      chainName: "Base Sepolia",
      chainHex: BASE_SEPOLIA_CHAIN_HEX,
      rpcUrls: ["https://sepolia.base.org"],
      blockExplorerUrls: ["https://sepolia.basescan.org"],
    };
  }

  // Default to Base mainnet for production safety.
  // Local or testnet check-in should set NEXT_PUBLIC_CHECKIN_CHAIN_ID=84532.
  return {
    chain: base,
    chainId: DEFAULT_CHECKIN_CHAIN_ID,
    chainName: "Base",
    chainHex: BASE_MAINNET_CHAIN_HEX,
    rpcUrls: ["https://mainnet.base.org"],
    blockExplorerUrls: ["https://basescan.org"],
  };
}

export function getCheckInContractAddress(): Address | null {
  const configuredAddress = process.env.NEXT_PUBLIC_CHECKIN_CONTRACT_ADDRESS?.trim();

  if (!configuredAddress || !isAddress(configuredAddress)) {
    return null;
  }

  return getAddress(configuredAddress);
}

export function isCheckInContractConfigured(): boolean {
  return getCheckInContractAddress() !== null;
}

export async function getDailyCheckInStats(userAddress: string): Promise<DailyCheckInStats> {
  const contractAddress = getRequiredContractAddress();
  const publicClient = getPublicClient();

  const result = await publicClient.readContract({
    address: contractAddress,
    abi: baseStatsCheckInAbi,
    functionName: "getUserStats",
    args: [getAddress(userAddress)],
  });

  return {
    lastCheckInDay: Number(result[0]),
    currentStreak: Number(result[1]),
    longestStreak: Number(result[2]),
    checkedInToday: result[3],
  };
}

export async function submitDailyCheckIn(): Promise<{ hash: Hex }> {
  const contractAddress = getRequiredContractAddress();
  const chainConfig = getCheckInChainConfig();
  const publicClient = getPublicClient();

  if (typeof window === "undefined" || !window.ethereum) {
    throw new Error("Connect your wallet to check in onchain.");
  }

  const walletClient = createWalletClient({
    chain: chainConfig.chain,
    transport: custom(window.ethereum),
  });

  const [account] = await walletClient.getAddresses();

  if (!account) {
    throw new Error("Connect your wallet to check in onchain.");
  }

  const functionData = encodeFunctionData({
    abi: baseStatsCheckInAbi,
    functionName: "checkIn",
  });

  // Daily Check-in is the first optional onchain action for Base Stats.
  // TODO: Replace this suffix handling with the final Base Dashboard Builder Code / ERC-8021
  // attribution format once the app is registered and the final builder code is issued.
  const hash = await walletClient.sendTransaction({
    account,
    chain: chainConfig.chain,
    to: contractAddress,
    data: appendBuilderCodeSuffix(functionData),
  });

  await publicClient.waitForTransactionReceipt({ hash });

  return { hash };
}

export async function getWalletChainId(): Promise<number | null> {
  if (typeof window === "undefined" || !window.ethereum) {
    return null;
  }

  const chainId = await window.ethereum.request({ method: "eth_chainId" });
  return typeof chainId === "string" ? parseInt(chainId, 16) : null;
}

export async function switchToCheckInNetwork(): Promise<void> {
  const chainConfig = getCheckInChainConfig();

  if (typeof window === "undefined" || !window.ethereum) {
    throw new Error("Connect your wallet to switch networks.");
  }

  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: chainConfig.chainHex }],
    });
  } catch (error) {
    if (!isMissingChainError(error)) {
      throw error;
    }

    await window.ethereum.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: chainConfig.chainHex,
          chainName: chainConfig.chainName,
          rpcUrls: chainConfig.rpcUrls,
          nativeCurrency: {
            name: "ETH",
            symbol: "ETH",
            decimals: 18,
          },
          blockExplorerUrls: chainConfig.blockExplorerUrls,
        },
      ],
    });
  }
}

function appendBuilderCodeSuffix(functionData: Hex): Hex {
  const builderCode = process.env.NEXT_PUBLIC_BASE_BUILDER_CODE?.trim();

  if (!builderCode || !isHex(builderCode)) {
    return functionData;
  }

  return `${functionData}${builderCode.slice(2)}` as Hex;
}

function getRequiredContractAddress(): Address {
  const contractAddress = getCheckInContractAddress();

  if (!contractAddress) {
    throw new Error("Daily Check-in contract is not deployed yet.");
  }

  return contractAddress;
}

function getPublicClient() {
  const chainConfig = getCheckInChainConfig();
  const rpcUrl = chainConfig.chain.rpcUrls.default.http[0] ?? chainConfig.rpcUrls[0];

  return createPublicClient({
    chain: chainConfig.chain,
    transport: http(rpcUrl),
  });
}

function isMissingChainError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  return "code" in error && error.code === 4902;
}
