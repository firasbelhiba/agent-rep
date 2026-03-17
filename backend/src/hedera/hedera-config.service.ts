import { Injectable } from '@nestjs/common';
import { Client, AccountId, PrivateKey, Hbar } from '@hashgraph/sdk';

@Injectable()
export class HederaConfigService {
  private client: Client | null = null;

  isConfigured(): boolean {
    return !!(process.env.HEDERA_ACCOUNT_ID && process.env.HEDERA_PRIVATE_KEY);
  }

  getClient(): Client {
    if (this.client) return this.client;

    const network = process.env.HEDERA_NETWORK || 'testnet';
    const accountId = process.env.HEDERA_ACCOUNT_ID;
    const privateKey = process.env.HEDERA_PRIVATE_KEY;

    if (!accountId || !privateKey) {
      throw new Error('HEDERA_ACCOUNT_ID and HEDERA_PRIVATE_KEY must be set');
    }

    this.client = network === 'mainnet' ? Client.forMainnet() : Client.forTestnet();

    let key: PrivateKey;
    try {
      key = PrivateKey.fromStringDer(privateKey);
    } catch {
      try {
        key = PrivateKey.fromStringECDSA(privateKey);
      } catch {
        key = PrivateKey.fromStringED25519(privateKey);
      }
    }

    this.client.setOperator(AccountId.fromString(accountId), key);
    this.client.setDefaultMaxTransactionFee(new Hbar(20));
    this.client.setDefaultMaxQueryPayment(new Hbar(2));

    return this.client;
  }

  getMirrorNodeUrl(): string {
    return process.env.HEDERA_NETWORK === 'mainnet'
      ? 'https://mainnet.mirrornode.hedera.com'
      : 'https://testnet.mirrornode.hedera.com';
  }
}
