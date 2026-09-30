/** Test harness: an in-process EVM (Ganache) with viem clients. Import from "@scout/contracts/testing"; needs `ganache` installed. */
import ganache from 'ganache';
import { type Abi, type Address, type Hex, type PublicClient, type WalletClient, createPublicClient, createWalletClient, custom, decodeErrorResult, defineChain, keccak256, toHex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

const chain = defineChain({
  id: 1337,
  name: 'ganache',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: ['http://localhost'] } },
});

/** Deterministic throwaway keys for the in-process chain. */
const KEYS = Array.from({ length: 6 }, (_, i) => keccak256(toHex(`scout-test-key-${i}`)));

export interface LocalChain {
  provider: { request(args: { method: string; params?: unknown[] }): Promise<unknown> };
  pub: PublicClient;
  accounts: Address[];
  wallet(account: Address): WalletClient;
  now(): Promise<number>;
  increaseTime(sec: number): Promise<void>;
  deploy(from: Address, artifact: { abi: Abi; bytecode: Hex }, args?: unknown[]): Promise<Address>;
}

/** In-process EVM (Ganache) with viem clients. No network needed. */
export async function localChain(): Promise<LocalChain> {
  const provider = ganache.provider({
    logging: { quiet: true },
    chain: { hardfork: 'shanghai', vmErrorsOnRPCResponse: true, chainId: 1337 },
    wallet: { accounts: KEYS.map((secretKey) => ({ secretKey, balance: toHex(10n ** 21n) })) },
  });
  const transport = custom(provider as unknown as { request: (a: unknown) => Promise<unknown> });
  const pub = createPublicClient({ transport, chain });
  const signers = KEYS.map((k) => privateKeyToAccount(k));
  const accounts = signers.map((s) => s.address) as Address[];
  const wallet = (account: Address) =>
    createWalletClient({ transport, chain, account: signers.find((s) => s.address.toLowerCase() === account.toLowerCase())! });
  const now = async () => Number((await pub.getBlock()).timestamp);
  const increaseTime = async (sec: number) => {
    await provider.request({ method: 'evm_increaseTime', params: [sec] });
    await provider.request({ method: 'evm_mine', params: [] });
  };
  const deploy = async (from: Address, artifact: { abi: Abi; bytecode: Hex }, args: unknown[] = []) => {
    const hash = await wallet(from).deployContract({ abi: artifact.abi, bytecode: artifact.bytecode, args, account: wallet(from).account!, chain });
    const r = await pub.waitForTransactionReceipt({ hash });
    return r.contractAddress!;
  };
  return { provider: provider as unknown as LocalChain['provider'], pub: pub as PublicClient, accounts, wallet, now, increaseTime, deploy };
}

/** Runs `fn` and returns the custom error name it reverted with. */
export async function revertName(abi: Abi, fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
  } catch (e) {
    const data = findData(e);
    if (data) return decodeErrorResult({ abi, data }).errorName;
    return `unknown: ${(e as Error).message.split('\n')[0]}`;
  }
  return 'did not revert';
}

function findData(e: unknown): Hex | undefined {
  let cur: unknown = e;
  for (let i = 0; i < 10 && cur; i++) {
    const c = cur as { data?: unknown; cause?: unknown };
    if (typeof c.data === 'string' && c.data.startsWith('0x') && c.data.length >= 10) return c.data as Hex;
    if (c.data && typeof c.data === 'object' && typeof (c.data as { data?: unknown }).data === 'string') return (c.data as { data: Hex }).data;
    cur = c.cause;
  }
  return undefined;
}
