/**
 * Deploy AgentRepStaking contract to Hedera testnet.
 *
 * Usage:
 *   HEDERA_ACCOUNT_ID=0.0.xxx HEDERA_PRIVATE_KEY=xxx node scripts/deploy-staking.js
 *
 * The operator account acts as both owner and initial reputationOracle.
 */
const {
  Client,
  AccountId,
  PrivateKey,
  ContractCreateFlow,
  ContractFunctionParameters,
  Hbar,
} = require('@hashgraph/sdk');
const fs = require('fs');
const path = require('path');

// Load .env if available
try {
  const envPath = path.resolve(__dirname, '../.env');
  const envContent = fs.readFileSync(envPath, 'utf8');
  for (const line of envContent.split('\n')) {
    const match = line.match(/^([A-Z_]+)=(.*)$/);
    if (match) process.env[match[1]] = match[2].trim();
  }
} catch {}

async function main() {
  const accountId = process.env.HEDERA_ACCOUNT_ID;
  const privateKeyStr = process.env.HEDERA_PRIVATE_KEY;
  const network = process.env.HEDERA_NETWORK || 'testnet';

  if (!accountId || !privateKeyStr) {
    console.error('Set HEDERA_ACCOUNT_ID and HEDERA_PRIVATE_KEY');
    process.exit(1);
  }

  const client = network === 'mainnet' ? Client.forMainnet() : Client.forTestnet();
  let key;
  try { key = PrivateKey.fromStringDer(privateKeyStr); }
  catch { try { key = PrivateKey.fromStringECDSA(privateKeyStr); }
  catch { key = PrivateKey.fromStringED25519(privateKeyStr); } }

  client.setOperator(AccountId.fromString(accountId), key);
  client.setDefaultMaxTransactionFee(new Hbar(50));

  // Get the operator's EVM address for the oracle parameter
  const evmAddress = AccountId.fromString(accountId).toSolidityAddress();
  console.log(`Operator: ${accountId}`);
  console.log(`Operator EVM address: 0x${evmAddress}`);

  // Load compiled artifact
  const artifact = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, '../src/hedera/AgentRepStaking.json'), 'utf8'),
  );

  console.log('Deploying AgentRepStaking...');

  const contractTx = new ContractCreateFlow()
    .setBytecode(artifact.bytecode)
    .setGas(3000000)
    .setConstructorParameters(
      new ContractFunctionParameters().addAddress(`0x${evmAddress}`),
    );

  const response = await contractTx.execute(client);
  const receipt = await response.getReceipt(client);
  const contractId = receipt.contractId.toString();
  const contractEvmAddress = `0x${receipt.contractId.toSolidityAddress()}`;

  console.log('\n=== Deployment Successful ===');
  console.log(`Contract ID: ${contractId}`);
  console.log(`EVM Address: ${contractEvmAddress}`);
  console.log(`HashScan:    https://hashscan.io/${network}/contract/${contractId}`);
  console.log(`\nAdd to backend .env:`);
  console.log(`STAKING_CONTRACT_ID=${contractId}`);

  client.close();
}

main().catch((e) => {
  console.error('Deploy failed:', e.message);
  process.exit(1);
});
