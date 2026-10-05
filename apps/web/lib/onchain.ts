import raw from './onchain-drop.json';

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

export const explorerTx = (d: OnchainDrop, hash: string) => (d.explorer ? `${d.explorer}/tx/${hash}` : undefined);
export const explorerAddress = (d: OnchainDrop, address: string) => (d.explorer ? `${d.explorer}/address/${address}` : undefined);
