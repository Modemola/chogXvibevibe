import raw from './onchain-drop.json';
import scoutDropRaw from './scout-drop.json';
import scoutTokenRaw from './scout-token.json';

/**
 * The showcase drop run for real on Robinhood Chain testnet (`scout showcase-drop` writes
 * onchain-drop.json). Empty until it has run, and then nothing on the site mentions it.
 */
export interface OnchainDrop {
  chainId: number;
  chainName: string;
  explorer?: string;
  deployer: string;
  scoutDrop: string;
  token: string;
  dropId: string;
  launchId: string;
  template: string;
  policyHash: string;
  merkleRoot: string;
  total: string;
  recipients: number;
  claimed: number;
  txs: { deployScoutDrop?: string; deployToken?: string; approve: string; createDrop: string; claims: string[] };
  fromBlock: string;
  createdAt: string;
}

const data = raw as unknown as Partial<OnchainDrop>;
export const onchainDrop: OnchainDrop | null = data.scoutDrop ? (data as OnchainDrop) : null;

export const explorerTx = (d: { explorer?: string }, hash: string) => (d.explorer ? `${d.explorer}/tx/${hash}` : undefined);
export const explorerAddress = (d: { explorer?: string }, address: string) => (d.explorer ? `${d.explorer}/address/${address}` : undefined);

/** $SCOUT, Graduation Scout's own token, launched on vibe/vibe (testnet). Its Scout drop runs once it graduates. */
export interface ScoutToken {
  symbol: string;
  name: string;
  address: string;
  chainId: number;
  chainName: string;
  explorer?: string;
  launchNumber: number;
  launchTx: string;
  supply: string;
  graduatesAtEth: number;
  dropWallet: string;
  reserved: string;
  scoutDrop: string;
}

export const scoutToken = scoutTokenRaw as ScoutToken;

/** The $SCOUT drop, once it has run (`scout showcase-drop --token … --out lib/scout-drop.json`). */
const scoutDropData = scoutDropRaw as unknown as Partial<OnchainDrop>;
export const scoutTokenDrop: OnchainDrop | null = scoutDropData.scoutDrop ? (scoutDropData as OnchainDrop) : null;
