import { Injectable, Logger } from '@nestjs/common';
import {
  ContractExecuteTransaction,
  ContractCallQuery,
  ContractFunctionParameters,
  ContractId,
  Hbar,
} from '@hashgraph/sdk';
import * as crypto from 'crypto';
import { HederaConfigService } from './hedera-config.service';

export interface ContractStake {
  amount: number;       // tinybar
  lockedUntil: number;  // unix timestamp
  totalSlashed: number; // tinybar
  exists: boolean;
}

@Injectable()
export class StakingContractService {
  private readonly logger = new Logger(StakingContractService.name);

  constructor(private readonly hederaConfig: HederaConfigService) {}

  private getContractId(): ContractId {
    const id = process.env.STAKING_CONTRACT_ID;
    if (!id) throw new Error('STAKING_CONTRACT_ID not set');
    return ContractId.fromString(id);
  }

  isConfigured(): boolean {
    return !!process.env.STAKING_CONTRACT_ID && this.hederaConfig.isConfigured();
  }

  /**
   * Convert agent string ID to bytes32 (keccak256 hash).
   * This matches the contract's agentId parameter.
   */
  agentIdToBytes32(agentId: string): Buffer {
    return crypto.createHash('sha256').update(agentId).digest();
  }

  /**
   * Stake HBAR for an agent on the smart contract.
   * The operator wallet sends HBAR and it's locked under the agent's ID.
   */
  async stake(agentId: string, amountTinybar: number, lockDays: number): Promise<string> {
    const client = this.hederaConfig.getClient();
    const contractId = this.getContractId();
    const agentBytes = this.agentIdToBytes32(agentId);

    this.logger.log(
      `Staking ${amountTinybar} tinybars for agent ${agentId}, lock ${lockDays} days`,
    );

    const tx = new ContractExecuteTransaction()
      .setContractId(contractId)
      .setGas(200000)
      .setPayableAmount(Hbar.fromTinybars(amountTinybar))
      .setFunction(
        'stake',
        new ContractFunctionParameters()
          .addBytes32(agentBytes)
          .addUint256(lockDays),
      );

    const response = await tx.execute(client);
    const receipt = await response.getReceipt(client);
    const txId = response.transactionId.toString();

    this.logger.log(`Stake tx: ${txId}, status: ${receipt.status}`);
    return txId;
  }

  /**
   * Unstake — withdraw HBAR after lock period. Funds return to operator wallet.
   */
  async unstake(agentId: string): Promise<string> {
    const client = this.hederaConfig.getClient();
    const contractId = this.getContractId();
    const agentBytes = this.agentIdToBytes32(agentId);

    const tx = new ContractExecuteTransaction()
      .setContractId(contractId)
      .setGas(200000)
      .setFunction(
        'unstake',
        new ContractFunctionParameters().addBytes32(agentBytes),
      );

    const response = await tx.execute(client);
    await response.getReceipt(client);

    this.logger.log(`Unstake tx: ${response.transactionId}`);
    return response.transactionId.toString();
  }

  /**
   * Slash an agent's stake (operator acts as oracle).
   */
  async slash(agentId: string, percent: number, reason: string): Promise<string> {
    const client = this.hederaConfig.getClient();
    const contractId = this.getContractId();
    const agentBytes = this.agentIdToBytes32(agentId);

    const tx = new ContractExecuteTransaction()
      .setContractId(contractId)
      .setGas(200000)
      .setFunction(
        'slash',
        new ContractFunctionParameters()
          .addBytes32(agentBytes)
          .addUint256(percent)
          .addString(reason),
      );

    const response = await tx.execute(client);
    await response.getReceipt(client);

    this.logger.log(`Slash tx: ${response.transactionId}, ${percent}% — ${reason}`);
    return response.transactionId.toString();
  }

  /**
   * Read an agent's stake from the contract (view function, free query).
   */
  async getStake(agentId: string): Promise<ContractStake> {
    const client = this.hederaConfig.getClient();
    const contractId = this.getContractId();
    const agentBytes = this.agentIdToBytes32(agentId);

    const query = new ContractCallQuery()
      .setContractId(contractId)
      .setGas(50000)
      .setFunction(
        'getStake',
        new ContractFunctionParameters().addBytes32(agentBytes),
      );

    const result = await query.execute(client);

    return {
      amount: result.getUint256(0).toNumber(),
      lockedUntil: result.getUint256(1).toNumber(),
      totalSlashed: result.getUint256(2).toNumber(),
      exists: result.getBool(3),
    };
  }

  /**
   * Read totals from the contract.
   */
  async getTotals(): Promise<{ totalStaked: number; totalSlashed: number; stakerCount: number }> {
    const client = this.hederaConfig.getClient();
    const contractId = this.getContractId();

    const stakedQuery = new ContractCallQuery()
      .setContractId(contractId)
      .setGas(30000)
      .setFunction('totalStaked');
    const stakedResult = await stakedQuery.execute(client);

    const slashedQuery = new ContractCallQuery()
      .setContractId(contractId)
      .setGas(30000)
      .setFunction('totalSlashed');
    const slashedResult = await slashedQuery.execute(client);

    const countQuery = new ContractCallQuery()
      .setContractId(contractId)
      .setGas(30000)
      .setFunction('stakerCount');
    const countResult = await countQuery.execute(client);

    return {
      totalStaked: stakedResult.getUint256(0).toNumber(),
      totalSlashed: slashedResult.getUint256(0).toNumber(),
      stakerCount: Number(countResult.getUint256(0).toNumber()),
    };
  }
}
