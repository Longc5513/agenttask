"use client";

import { createAccount, createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { TransactionStatus } from "genlayer-js/types";
import type { TxResult } from "./types";

declare global {
  interface Window {
    ethereum?: {
      request: (input: { method: string; params?: unknown[] }) => Promise<unknown>;
    };
  }
}

type RuntimeClient = {
  readContract: (input: {
    address: `0x${string}`;
    functionName: string;
    args: unknown[];
  }) => Promise<unknown>;
  writeContract: (input: {
    address: `0x${string}`;
    functionName: string;
    args: unknown[];
    value: bigint;
  }) => Promise<string>;
  waitForTransactionReceipt: (input: {
    hash: `0x${string}`;
    status: TransactionStatus;
    interval: number;
    retries: number;
    fullTransaction: boolean;
  }) => Promise<Record<string, unknown>>;
  getTransaction: (input: { hash: `0x${string}` }) => Promise<Record<string, unknown>>;
};

const STORAGE_KEY = "agenttask.contract.v1";
const envAddress = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || "0x33E354284635b4462Eb3e9491923D7EC259a7712";
const readClient = createClient({
  chain: studionet,
  account: createAccount(),
}) as unknown as RuntimeClient;

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object"
    ? value as Record<string, unknown>
    : undefined;
}

function decodeContractReturn(transaction: Record<string, unknown>): string | undefined {
  const consensus = asRecord(transaction.consensus_data);
  const receipts = consensus?.leader_receipt;
  if (!Array.isArray(receipts)) return undefined;
  const receipt = asRecord(receipts[0]);
  const result = asRecord(receipt?.result);
  const payload = asRecord(result?.payload);
  const readable = payload?.readable;
  if (typeof readable !== "string") return undefined;
  try {
    const decoded = JSON.parse(readable) as unknown;
    return typeof decoded === "string" ? decoded : undefined;
  } catch {
    return readable;
  }
}

export function contractAddress(): `0x${string}` | "" {
  if (typeof window === "undefined") return envAddress as `0x${string}` | "";
  return (window.localStorage.getItem(STORAGE_KEY) || envAddress) as `0x${string}` | "";
}

export function saveContractAddress(value: string) {
  const clean = value.trim();
  if (clean) window.localStorage.setItem(STORAGE_KEY, clean);
  else window.localStorage.removeItem(STORAGE_KEY);
}

export async function connectWallet(): Promise<TxResult> {
  if (!window.ethereum) {
    return { success: false, error: "Install a browser wallet to sign Studionet transactions." };
  }
  try {
    const chainId = `0x${studionet.id.toString(16)}`;
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId }],
      });
    } catch {
      await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [{
          chainId,
          chainName: "GenLayer Studio Network",
          nativeCurrency: { name: "GEN Token", symbol: "GEN", decimals: 18 },
          rpcUrls: ["https://studio.genlayer.com/api"],
          blockExplorerUrls: ["https://explorer-studio.genlayer.com"],
        }],
      });
    }
    const accounts = await window.ethereum.request({
      method: "eth_requestAccounts",
      params: [],
    }) as string[];
    return accounts[0]
      ? { success: true, data: accounts[0] }
      : { success: false, error: "No wallet account selected." };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Wallet connection failed.",
    };
  }
}

export async function readContract(
  functionName: string,
  args: unknown[] = [],
): Promise<TxResult> {
  const address = contractAddress();
  if (!address) return { success: false, error: "Set a Studionet contract address first." };
  try {
    const data = await readClient.readContract({ address, functionName, args });
    return { success: true, data };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Contract read failed.",
    };
  }
}

export async function writeContract(
  functionName: string,
  args: unknown[] = [],
  value = BigInt(0),
): Promise<TxResult> {
  const address = contractAddress();
  if (!address) return { success: false, error: "Set a Studionet contract address first." };
  if (!window.ethereum) return { success: false, error: "Connect a funded wallet first." };
  let hash = "";
  try {
    const accounts = await window.ethereum.request({
      method: "eth_requestAccounts",
      params: [],
    }) as string[];
    if (!accounts[0]) return { success: false, error: "No wallet account selected." };
    const client = createClient({
      chain: studionet,
      provider: window.ethereum,
      account: accounts[0] as `0x${string}`,
    }) as unknown as RuntimeClient;
    hash = await client.writeContract({
      address,
      functionName,
      args,
      value,
    });
    const receipt = await client.waitForTransactionReceipt({
      hash: hash as `0x${string}`,
      status: TransactionStatus.ACCEPTED,
      interval: 2000,
      retries: 150,
      fullTransaction: false,
    });
    const transaction = await client.getTransaction({ hash: hash as `0x${string}` });
    const status = String(transaction.statusName ?? receipt.statusName ?? "ACCEPTED");
    const execution = String(
      transaction.txExecutionResultName
      ?? receipt.txExecutionResultName
      ?? "NOT_EXPOSED_BY_SDK",
    );
    const consensus = String(transaction.result_name ?? transaction.resultName ?? "");
    if (status !== "ACCEPTED") {
      return {
        success: false,
        hash,
        status,
        error: consensus === "NO_MAJORITY"
          ? "Validators did not reach a majority. The contract state was not changed; retry the review."
          : `Transaction stopped at ${status}. The contract state was not changed.`,
      };
    }
    if (["NO_MAJORITY", "MAJORITY_DISAGREE", "UNDETERMINED", "REJECTED"].includes(consensus)) {
      return {
        success: false,
        hash,
        status,
        error: "Validators did not reach one substantive economic verdict.",
      };
    }
    if (
      execution !== "NOT_EXPOSED_BY_SDK"
      && !["SUCCESS", "SUCCEEDED", "ACCEPTED"].includes(execution)
    ) {
      return { success: false, hash, status, error: `Execution returned ${execution}.` };
    }
    return {
      success: true,
      hash,
      status,
      data: decodeContractReturn(transaction) ?? receipt.txDataDecoded,
    };
  } catch (error) {
    return {
      success: false,
      hash: hash || undefined,
      error: error instanceof Error ? error.message : "Contract write failed.",
    };
  }
}

export function parseGen(value: string): bigint {
  const normalized = value.trim();
  if (!/^\d+(\.\d{0,18})?$/.test(normalized)) {
    throw new Error("Use a valid GEN amount.");
  }
  const [whole, fraction = ""] = normalized.split(".");
  return (
    BigInt(whole) * BigInt("1000000000000000000")
    + BigInt(fraction.padEnd(18, "0"))
  );
}

export function formatGen(value: string): string {
  const amount = BigInt(value || "0");
  const unit = BigInt("1000000000000000000");
  const whole = amount / unit;
  const fraction = (amount % unit).toString().padStart(18, "0").slice(0, 2);
  return `${whole}.${fraction}`;
}

export function explorerContract(address: string) {
  return `https://explorer-studio.genlayer.com/address/${address}`;
}

export function explorerTx(hash: string) {
  return `https://explorer-studio.genlayer.com/tx/${hash}`;
}
