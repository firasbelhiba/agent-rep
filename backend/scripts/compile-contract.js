/**
 * Compile AgentRepStaking.sol and output ABI + bytecode as JSON.
 * Usage: node scripts/compile-contract.js
 */
const solc = require('solc');
const fs = require('fs');
const path = require('path');

const contractPath = path.resolve(__dirname, '../../contracts/AgentRepStaking.sol');
const source = fs.readFileSync(contractPath, 'utf8');

const input = {
  language: 'Solidity',
  sources: { 'AgentRepStaking.sol': { content: source } },
  settings: {
    outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } },
    optimizer: { enabled: true, runs: 200 },
  },
};

const output = JSON.parse(solc.compile(JSON.stringify(input)));

if (output.errors) {
  const fatal = output.errors.filter((e) => e.severity === 'error');
  if (fatal.length) {
    console.error('Compilation errors:');
    fatal.forEach((e) => console.error(e.formattedMessage));
    process.exit(1);
  }
  // Show warnings
  output.errors
    .filter((e) => e.severity === 'warning')
    .forEach((e) => console.warn(e.formattedMessage));
}

const contract = output.contracts['AgentRepStaking.sol']['AgentRepStaking'];
const artifact = {
  abi: contract.abi,
  bytecode: contract.evm.bytecode.object,
};

const outDir = path.resolve(__dirname, '../src/hedera');
fs.writeFileSync(
  path.join(outDir, 'AgentRepStaking.json'),
  JSON.stringify(artifact, null, 2),
);

console.log('Compiled AgentRepStaking.sol');
console.log(`  ABI: ${artifact.abi.length} entries`);
console.log(`  Bytecode: ${artifact.bytecode.length} hex chars`);
console.log(`  Output: ${path.join(outDir, 'AgentRepStaking.json')}`);
