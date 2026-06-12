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
  type Hex,
} from "viem";
import { base } from "viem/chains";

import { baseStatsCheckInAbi } from "./baseStatsCheckInAbi";

const BASE_RPC_URL = base.rpcUrls.default.http[0] ?? "https://mainnet.base.org";

const publicClient = createPublicClient({
  chain: base,
  transport: http(BASE_RPC_URL),
});

export interface DailyCheckInStats {
  lastCheckInDay: number;
  currentStreak: number;
  longestStreak: number;
  checkedInToday: boolean;
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

  if (typeof window === "undefined" || !window.ethereum) {
    throw new Error("Connect your wallet to check in onchain.");
  }

  const walletClient = createWalletClient({
    chain: base,
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
    chain: base,
    to: contractAddress,
    data: appendBuilderCodeSuffix(functionData),
  });

  await publicClient.waitForTransactionReceipt({ hash });

  return { hash };
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
