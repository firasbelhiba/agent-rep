import { Client, ContractCreateFlow, AccountId, PrivateKey } from '@hashgraph/sdk';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ACCOUNT_ID = '0.0.3700702';
const PRIVATE_KEY = '3030020100300706052b8104000a042204209bd456df9b6687091be7f209683e815d067284163a88477e34ad613c87200b00';

async function main() {
  console.log('=== AgentRepStaking V2 Deployment ===\n');

  // Read compiled bytecode and ABI
  const bytecode = fs.readFileSync(
    path.join(__dirname, '..', 'build', 'contracts_AgentRepStaking_sol_AgentRepStaking.bin'),
    'utf8'
  ).trim();

  const abi = JSON.parse(fs.readFileSync(
    path.join(__dirname, '..', 'build', 'contracts_AgentRepStaking_sol_AgentRepStaking.abi'),
    'utf8'
  ));

  console.log(`Bytecode size: ${bytecode.length / 2} bytes`);
  console.log(`ABI functions: ${abi.filter(a => a.type === 'function').length}`);
  console.log();

  // Set up client
  const client = Client.forTestnet();
  client.setOperator(
    AccountId.fromString(ACCOUNT_ID),
    PrivateKey.fromStringDer(PRIVATE_KEY)
  );

  console.log(`Deployer: ${ACCOUNT_ID}`);
  console.log('Network: Hedera Testnet');
  console.log('Constructor arg: reputationOracle = deployer account\n');
  console.log('Deploying...\n');

  // Deploy with ContractCreateFlow (handles file creation automatically)
  const tx = new ContractCreateFlow()
    .setBytecode(bytecode)
    .setGas(5_000_000)
    .setConstructorParameters(
      new (await import('@hashgraph/sdk')).ContractFunctionParameters()
        .addAddress(AccountId.fromString(ACCOUNT_ID).toSolidityAddress())
    );

  const response = await tx.execute(client);
  const receipt = await response.getReceipt(client);

  const contractId = receipt.contractId;
  console.log('✅ Contract deployed successfully!');
  console.log(`   Contract ID: ${contractId}`);
  console.log(`   HashScan: https://hashscan.io/testnet/contract/${contractId}`);
  console.log();

  // List new functions
  const newFunctions = abi
    .filter(a => a.type === 'function')
    .map(a => a.name);
  console.log('Available functions:');
  newFunctions.forEach(f => console.log(`   - ${f}`));
  console.log();
  console.log(`Update your .env: STAKING_CONTRACT_ID=${contractId}`);

  client.close();
}

main().catch(err => {
  console.error('Deployment failed:', err.message);
  process.exit(1);
});
