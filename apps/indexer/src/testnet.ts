import type { Address, AllocationSet } from '@scout/core';
import { BURN_SINK, ScoutDrop, TestToken, claimBatches, createDropArgs } from '@scout/contracts';
import { type Account, type Chain, type Hex, type PublicClient, type Transport, type WalletClient, defineChain, parseEventLogs } from 'viem';

/** Robinhood Chain testnet. */
export const robinhoodTestnet = defineChain({
  id: 46630,
  name: 'Robinhood Chain Testnet',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.testnet.chain.robinhood.com'] } },
  blockExplorers: { default: { name: 'Explorer', url: 'https://explorer.testnet.chain.robinhood.com' } },
  testnet: true,
});

/** What a showcase drop did on-chain, with every transaction, for the website to link to. */
export interface OnchainDrop {
  chainId: number;
  chainName: string;
  explorer?: string;
  deployer: Address;
  scoutDrop: Address;
  token: Address;
  dropId: string;
  launchId: string;
  template: string;
  policyHash: Hex;
  merkleRoot: Hex;
  total: string;
  recipients: number;
  claimed: number;
  txs: { deployScoutDrop?: Hex; deployToken?: Hex; approve: Hex; createDrop: Hex; claims: Hex[] };
  fromBlock: string;
  createdAt: string;
}

type Wallet = WalletClient<Transport, Chain, Account>;

/**
 * Runs a resolved allocation as a real ScoutDrop: deploys the contract and a demo token
 * (unless addresses are given), funds the drop with the allocated total, and pushes every
 * claim as a keeper would at graduation. Tokens always go to the recipients themselves.
 */
export async function runShowcaseDrop(opts: {
  pub: PublicClient;
  wallet: Wallet;
  set: AllocationSet;
  template: string;
  scoutDrop?: Address;
  token?: Address;
  batchSize?: number;
  log?: (line: string) => void;
}): Promise<OnchainDrop> {
  const { pub, wallet, set } = opts;
  const log = opts.log ?? (() => {});
  const deployer = wallet.account.address.toLowerCase() as Address;
  const send = async (hash: Hex) => {
    const receipt = await pub.waitForTransactionReceipt({ hash });
    if (receipt.status !== 'success') throw new Error(`Transaction ${hash} reverted`);
    return receipt;
  };
  const txs: OnchainDrop['txs'] = { approve: '0x', createDrop: '0x', claims: [] };

  let scoutDrop = opts.scoutDrop;
  let fromBlock: bigint | undefined;
  if (!scoutDrop) {
    txs.deployScoutDrop = await wallet.deployContract({ abi: ScoutDrop.abi, bytecode: ScoutDrop.bytecode });
    const r = await send(txs.deployScoutDrop);
    scoutDrop = r.contractAddress!.toLowerCase() as Address;
    fromBlock = r.blockNumber;
    log(`ScoutDrop deployed at ${scoutDrop}`);
  }
  let token = opts.token;
  if (!token) {
    // A plain ERC-20 standing in for the graduating launch's token (no transfer fee).
    txs.deployToken = await wallet.deployContract({ abi: TestToken.abi, bytecode: TestToken.bytecode, args: [set.allocated * 10n, 0n] });
    const r = await send(txs.deployToken);
    token = r.contractAddress!.toLowerCase() as Address;
    fromBlock ??= r.blockNumber;
    log(`Demo token deployed at ${token}`);
  }

  txs.approve = await wallet.writeContract({ address: token, abi: TestToken.abi, functionName: 'approve', args: [scoutDrop, set.allocated] });
  const approved = await send(txs.approve);
  fromBlock ??= approved.blockNumber;

  txs.createDrop = await wallet.writeContract({ address: scoutDrop, abi: ScoutDrop.abi, functionName: 'createDrop', args: [...createDropArgs(set, { token, sink: BURN_SINK })] });
  const created = await send(txs.createDrop);
  const [event] = parseEventLogs({ abi: ScoutDrop.abi, logs: created.logs, eventName: 'DropCreated' });
  if (!event) throw new Error('createDrop emitted no DropCreated event');
  const dropId = (event.args as { dropId: bigint }).dropId;
  log(`Drop #${dropId} created for ${set.recipients.length} recipients`);

  let claimed = 0;
  for (const b of claimBatches(set, opts.batchSize ?? 50)) {
    const hash = await wallet.writeContract({ address: scoutDrop, abi: ScoutDrop.abi, functionName: 'claimMany', args: [dropId, b.accounts, b.amounts, b.proofs] });
    await send(hash);
    txs.claims.push(hash);
    claimed += b.accounts.length;
    log(`Claimed ${claimed}/${set.recipients.length}`);
  }

  const chainId = await pub.getChainId();
  return {
    chainId,
    chainName: wallet.chain.name,
    explorer: wallet.chain.blockExplorers?.default.url,
    deployer,
    scoutDrop,
    token,
    dropId: dropId.toString(),
    launchId: set.launchId,
    template: opts.template,
    policyHash: set.policyHash as Hex,
    merkleRoot: set.merkleRoot as Hex,
    total: set.allocated.toString(),
    recipients: set.recipients.length,
    claimed,
    txs,
    fromBlock: fromBlock.toString(),
    createdAt: new Date().toISOString(),
  };
}
