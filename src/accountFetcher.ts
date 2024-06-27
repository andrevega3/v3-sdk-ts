import { Commitment } from "@solana/web3.js";
import { Buffer } from "buffer";
import {
  Umi,
  PublicKey as UmiPublicKey,
  deserializeAccount,
  RpcAccount,
  RpcDataFilter,
} from "@metaplex-foundation/umi";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { publicKey } from "@metaplex-foundation/umi-public-keys";
import { PriceData, parsePriceData } from "@pythnetwork/client";
import {
  exchangeSerializer,
  marketSerializer,
  marginAccountSerializer,
  lpAccountSerializer,
  settlementRequestSerializer,
} from "./types/accounts/serializers";
import {
  Exchange,
  Market,
  MarginAccount,
  SettlementRequest,
  LpAccount,
  Address,
  ProgramAccount,
} from "./types";
import {
  PARCL_V3_PROGRAM_ID,
  EXCHANGE_DISCRIMINATOR,
  LP_ACCOUNT_DISCRIMINATOR,
  MARGIN_ACCOUNT_DISCRIMINATOR,
  MARKET_DISCRIMINATOR,
  SETTLEMENT_REQUEST_DISCRIMINATOR,
} from "./constants";

export type ParclV3AccountFetcherConfig = {
  rpcUrl: string;
  commitment?: Commitment;
};

export class ParclV3AccountFetcher {
  private umi: Umi;

  constructor(config: ParclV3AccountFetcherConfig) {
    this.umi = createUmi(config.rpcUrl, { commitment: config.commitment });
  }

  // SINGLE ACCOUNT //

  async getExchange(address: Address): Promise<Exchange | undefined> {
    const rawAccount = await this.getAccountAndRemoveDiscriminator(address);
    return rawAccount === undefined
      ? undefined
      : deserializeAccount(rawAccount, exchangeSerializer);
  }

  async getLpAccount(address: Address): Promise<LpAccount | undefined> {
    const rawAccount = await this.getAccountAndRemoveDiscriminator(address);
    return rawAccount === undefined
      ? undefined
      : deserializeAccount(rawAccount, lpAccountSerializer);
  }

  async getMarginAccount(address: Address): Promise<MarginAccount | undefined> {
    const rawAccount = await this.getAccountAndRemoveDiscriminator(address);
    return rawAccount === undefined
      ? undefined
      : deserializeAccount(rawAccount, marginAccountSerializer);
  }

  async getMarket(address: Address): Promise<Market | undefined> {
    const rawAccount = await this.getAccountAndRemoveDiscriminator(address);
    return rawAccount === undefined ? undefined : deserializeAccount(rawAccount, marketSerializer);
  }

  async getSettlementRequest(address: Address): Promise<SettlementRequest | undefined> {
    const rawAccount = await this.getAccountAndRemoveDiscriminator(address);
    return rawAccount === undefined
      ? undefined
      : deserializeAccount(rawAccount, settlementRequestSerializer);
  }

  async getPythPriceFeed(address: Address): Promise<PriceData | undefined> {
    const rawAccount = await this.umi.rpc.getAccount(publicKey(address));
    return !rawAccount.exists ? undefined : parsePriceData(Buffer.from(rawAccount.data));
  }

  // MULTIPLE ACCOUNTS //

  async getExchanges(addresses: Address[]): Promise<(ProgramAccount<Exchange> | undefined)[]> {
    const rawAccounts = await this.getMultipleAccountsAndRemoveDiscriminators(addresses);
    return rawAccounts.map((rawAccount) =>
      rawAccount === undefined
        ? undefined
        : {
            account: deserializeAccount(rawAccount, exchangeSerializer),
            address: rawAccount.publicKey,
          }
    );
  }

  async getLpAccounts(addresses: Address[]): Promise<(ProgramAccount<LpAccount> | undefined)[]> {
    const rawAccounts = await this.getMultipleAccountsAndRemoveDiscriminators(addresses);
    return rawAccounts.map((rawAccount) =>
      rawAccount === undefined
        ? undefined
        : {
            account: deserializeAccount(rawAccount, lpAccountSerializer),
            address: rawAccount.publicKey,
          }
    );
  }

  async getMarginAccounts(
    addresses: Address[]
  ): Promise<(ProgramAccount<MarginAccount> | undefined)[]> {
    const rawAccounts = await this.getMultipleAccountsAndRemoveDiscriminators(addresses);
    return rawAccounts.map((rawAccount) =>
      rawAccount === undefined
        ? undefined
        : {
            account: deserializeAccount(rawAccount, marginAccountSerializer),
            address: rawAccount.publicKey,
          }
    );
  }

  async getMarkets(addresses: Address[]): Promise<(ProgramAccount<Market> | undefined)[]> {
    const rawAccounts = await this.getMultipleAccountsAndRemoveDiscriminators(addresses);
    return rawAccounts.map((rawAccount) =>
      rawAccount === undefined
        ? undefined
        : {
            account: deserializeAccount(rawAccount, marketSerializer),
            address: rawAccount.publicKey,
          }
    );
  }

  async getSettlementRequests(
    addresses: Address[]
  ): Promise<(ProgramAccount<SettlementRequest> | undefined)[]> {
    const rawAccounts = await this.getMultipleAccountsAndRemoveDiscriminators(addresses);
    return rawAccounts.map((rawAccount) =>
      rawAccount === undefined
        ? undefined
        : {
            account: deserializeAccount(rawAccount, settlementRequestSerializer),
            address: rawAccount.publicKey,
          }
    );
  }

  async getPythPriceFeeds(addresses: Address[]): Promise<(PriceData | undefined)[]> {
    const rawAccounts = await this.umi.rpc.getAccounts(
      addresses.map((address) => publicKey(address))
    );
    return rawAccounts.map((rawAccount) =>
      !rawAccount.exists ? undefined : parsePriceData(Buffer.from(rawAccount.data))
    );
  }

  // GPA //

  async getAllExchanges(): Promise<ProgramAccount<Exchange>[]> {
    const rawAccounts = await this.getProgramAccountsAndRemoveDiscriminators([
      {
        memcmp: {
          offset: 0,
          bytes: new Uint8Array(EXCHANGE_DISCRIMINATOR),
        },
      },
    ]);
    return rawAccounts.map((rawAccount) => ({
      address: rawAccount.publicKey,
      account: deserializeAccount(rawAccount, exchangeSerializer),
    }));
  }

  async getAllLpAccounts(): Promise<ProgramAccount<LpAccount>[]> {
    const rawAccounts = await this.getProgramAccountsAndRemoveDiscriminators([
      {
        memcmp: {
          offset: 0,
          bytes: new Uint8Array(LP_ACCOUNT_DISCRIMINATOR),
        },
      },
    ]);
    return rawAccounts.map((rawAccount) => ({
      address: rawAccount.publicKey,
      account: deserializeAccount(rawAccount, lpAccountSerializer),
    }));
  }

  async getAllMarginAccounts(): Promise<ProgramAccount<MarginAccount>[]> {
    const rawAccounts = await this.getProgramAccountsAndRemoveDiscriminators([
      {
        memcmp: {
          offset: 0,
          bytes: new Uint8Array(MARGIN_ACCOUNT_DISCRIMINATOR),
        },
      },
    ]);
    return rawAccounts.map((rawAccount) => ({
      address: rawAccount.publicKey,
      account: deserializeAccount(rawAccount, marginAccountSerializer),
    }));
  }

  async getAllMarginAccountAddresses(): Promise<UmiPublicKey[]> {
    return await this.getProgramAccountAddresses([
      {
        memcmp: {
          offset: 0,
          bytes: new Uint8Array(MARGIN_ACCOUNT_DISCRIMINATOR),
        },
      },
    ]);
  }

  async getAllMarginAccountsWithPositions(): Promise<ProgramAccount<MarginAccount>[]> {
    const rawAccounts = await this.getProgramAccountsAndRemoveDiscriminators([
      {
        memcmp: {
          offset: 0,
          bytes: new Uint8Array(MARGIN_ACCOUNT_DISCRIMINATOR),
        },
      },
    ]);
  
    // Debugging: Check raw accounts count
    console.log(`Fetched ${rawAccounts.length} raw accounts with the MARGIN_ACCOUNT_DISCRIMINATOR`);
  
    const marginAccounts = rawAccounts.map((rawAccount) => {
      const deserializedAccount = deserializeAccount(rawAccount, marginAccountSerializer);
      // Debugging: Check deserialized account
      // console.log(`Deserialized account: ${JSON.stringify(deserializedAccount)}`);
      return {
        address: rawAccount.publicKey,
        account: deserializedAccount,
      };
    });

    // console.log(`Deserialized account: ${this.stringifyBigInt(marginAccounts[222000].account)}`);
  
    // Filter margin accounts with positions >= 1
    const filteredMarginAccounts = marginAccounts.filter((account) => 
      account.account.positions.some(position => BigInt(position.size) > 0)
    );
    // Debugging: Check filtered accounts count
    console.log(`Filtered ${filteredMarginAccounts.length} margin accounts with positions >= 1`);
  
    return filteredMarginAccounts;
  }

  stringifyBigInt(obj: unknown) {
    return JSON.stringify(obj, (_key, value) =>
      typeof value === 'bigint' ? value.toString() : value
    );
  }

  async getInLiquidationMarginAccounts(): Promise<ProgramAccount<MarginAccount>[]> {
    const numPositions = 12;
    const positionSize = 64;
    const marginAccounts: ProgramAccount<MarginAccount>[] = [];
    // positions array: 768 bytes
    // margin: 8 bytes
    // maxLiquidationFee: 8 bytes
    // id: 4 bytes
    // exchange: 32 bytes
    // owner: 32 bytes
    // delegate: 32 bytes
    // 768 + 8 + 8 + 4 + 32 + 32 + 32 = 884 bytes
    const inLiquidationOffset = 884;
    for (let i = 0; i < numPositions; i++) {
      if (i >= 1) {
        const wait = 9
        console.log(`Waiting ${wait}s`)
        await new Promise((resolve) => setTimeout(resolve, wait * 1000));
      }
      const offset = inLiquidationOffset + i * positionSize;
      const rawAccounts = await this.getProgramAccountsAndRemoveDiscriminators([
        {
          memcmp: {
            offset,
            bytes: new Uint8Array([1]), // Filter for inLiquidation == 1
          },
        },
      ]);
      marginAccounts.push(
        ...rawAccounts.map((rawAccount) => ({
          address: rawAccount.publicKey,
          account: deserializeAccount(rawAccount, marginAccountSerializer),
        }))
      );
    }
  
    return marginAccounts;
  }

  async getAllMarkets(): Promise<ProgramAccount<Market>[]> {
    const rawAccounts = await this.getProgramAccountsAndRemoveDiscriminators([
      {
        memcmp: {
          offset: 0,
          bytes: new Uint8Array(MARKET_DISCRIMINATOR),
        },
      },
    ]);
    return rawAccounts.map((rawAccount) => ({
      address: rawAccount.publicKey,
      account: deserializeAccount(rawAccount, marketSerializer),
    }));
  }

  async getAllSettlementRequests(): Promise<ProgramAccount<SettlementRequest>[]> {
    const rawAccounts = await this.getProgramAccountsAndRemoveDiscriminators([
      {
        memcmp: {
          offset: 0,
          bytes: new Uint8Array(SETTLEMENT_REQUEST_DISCRIMINATOR),
        },
      },
    ]);
    return rawAccounts.map((rawAccount) => ({
      address: rawAccount.publicKey,
      account: deserializeAccount(rawAccount, settlementRequestSerializer),
    }));
  }

  async getAllSettlementRequestAddresses(): Promise<UmiPublicKey[]> {
    return await this.getProgramAccountAddresses([
      {
        memcmp: {
          offset: 0,
          bytes: new Uint8Array(SETTLEMENT_REQUEST_DISCRIMINATOR),
        },
      },
    ]);
  }

  // INTERNAL HELPERS //

  private async getAccountAndRemoveDiscriminator(
    address: Address
  ): Promise<RpcAccount | undefined> {
    const rawAccount = await this.umi.rpc.getAccount(publicKey(address));
    if (!rawAccount.exists) {
      return undefined;
    } else {
      rawAccount.data.copyWithin(0, 8);
      return rawAccount;
    }
  }

  private async getMultipleAccountsAndRemoveDiscriminators(
    addresses: Address[]
  ): Promise<(RpcAccount | undefined)[]> {
    const rawAccounts = await this.umi.rpc.getAccounts(
      addresses.map((address) => publicKey(address))
    );
    const rawAccountsNoDisc = [];
    for (const rawAccount of rawAccounts) {
      if (!rawAccount.exists) {
        rawAccountsNoDisc.push(undefined);
      } else {
        rawAccount.data.copyWithin(0, 8);
        rawAccountsNoDisc.push(rawAccount);
      }
    }
    return rawAccountsNoDisc;
  }

  private async getProgramAccountsAndRemoveDiscriminators(
    filters: RpcDataFilter[]
  ): Promise<RpcAccount[]> {
    const rawAccounts = await this.umi.rpc.getProgramAccounts(publicKey(PARCL_V3_PROGRAM_ID), {
      filters,
    });
    const rawAccountsNoDisc = [];
    for (const rawAccount of rawAccounts) {
      rawAccount.data.copyWithin(0, 8);
      rawAccountsNoDisc.push(rawAccount);
    }
    return rawAccountsNoDisc;
  }

  private async getProgramAccountAddresses(filters: RpcDataFilter[]): Promise<UmiPublicKey[]> {
    const rawAccounts = await this.umi.rpc.getProgramAccounts(publicKey(PARCL_V3_PROGRAM_ID), {
      filters,
      dataSlice: {
        offset: 0,
        length: 0,
      },
    });
    return rawAccounts.map((rawAccount) => rawAccount.publicKey);
  }
}
