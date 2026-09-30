// Deploys ScoutDrop. Usage:
//   DEPLOYER_PRIVATE_KEY=0x… node scripts/deploy.mjs --rpc https://…
// The key is read from the environment only, never from arguments or files.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { createPublicClient, createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

const { values } = parseArgs({ options: { rpc: { type: 'string' } } });
const key = process.env.DEPLOYER_PRIVATE_KEY;
if (!values.rpc || !key) {
  console.error('Usage: DEPLOYER_PRIVATE_KEY=0x… node scripts/deploy.mjs --rpc <url>');
  process.exit(1);
}
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const artifact = JSON.parse(readFileSync(path.join(root, 'artifacts', 'ScoutDrop.json'), 'utf8'));

const transport = http(values.rpc);
const pub = createPublicClient({ transport });
const chainId = await pub.getChainId();
const chain = { id: chainId, name: `chain-${chainId}`, nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [values.rpc] } } };
const account = privateKeyToAccount(key);
const wallet = createWalletClient({ transport, chain, account });

console.log(`Deploying ScoutDrop from ${account.address} on chain ${chainId}…`);
const hash = await wallet.deployContract({ abi: artifact.abi, bytecode: artifact.bytecode });
const receipt = await pub.waitForTransactionReceipt({ hash });
console.log(`ScoutDrop deployed at ${receipt.contractAddress} (block ${receipt.blockNumber}, tx ${hash})`);
console.log(`Index it with: pnpm scout ingest-drops --rpc ${values.rpc} --contract ${receipt.contractAddress} --from-block ${receipt.blockNumber}`);
