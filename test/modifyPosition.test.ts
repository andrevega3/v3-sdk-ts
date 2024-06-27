import {
    Commitment,
    Connection,
    Keypair,
    PublicKey,
    sendAndConfirmTransaction
} from "@solana/web3.js";
import {
    ParclV3Sdk,
    getMarginAccountPda,
    getMarketPda,
    translateAddress,
    parseCollateralAmount,
    parsePrice,
    parseSize,
    getExchangePda,
    U64,
    Market,
    Exchange
} from "../src";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { getTestParams } from './argParser';
import * as dotenv from "dotenv";
import bs58 from "bs58";
import { PriceData } from "@pythnetwork/client";
import now from  'performance-now';

dotenv.config({ path: '.env.local' });

describe('Modify Position Performance Test', () => {
    // Solana Variables
    let commitment: Commitment | undefined;
    let connection: Connection;
    let signer: Keypair;
    // SDK Variables
    let sdk: ParclV3Sdk;
    let exchangeAddress: PublicKey;
    let exchange: Exchange | undefined;
    let marginAccount: PublicKey;
    let signerTokenAccount: PublicKey;
    let margin: U64;
    let marketAddress: PublicKey;
    let market: Market | undefined;
    let priceFeed: PriceData | undefined;

    // SDK Constants
    const marginAccountId = 2;
    const marketId = 4;
    // let settlementRequestId: U64;
    const testParams = getTestParams();
    console.log(`New test params: ${JSON.stringify(testParams)}`)
    const numIncreaseRuns = testParams.runIncreasePosition ?? 10;
    const numDecreaseRuns = testParams.runDecreasePosition ?? 10;

    beforeAll(() => {
        if (!process.env.RPC_URL) {
          throw new Error("Missing rpc url");
        }
        if (!process.env.PRIVATE_KEY) {
          throw new Error("Missing signer");
        }
        // Note: only handling single exchange
        [exchangeAddress] = getExchangePda(0);
        signer = Keypair.fromSecretKey(bs58.decode(process.env.PRIVATE_KEY as string));
        commitment = process.env.COMMITMENT as Commitment | undefined;
        // const rpcUrl = clusterApiUrl("mainnet-beta");
        const rpcUrl = process.env.RPC_URL;
        sdk = new ParclV3Sdk({ rpcUrl: rpcUrl, commitment });
        connection = new Connection(rpcUrl, commitment);
    });

    it('Initializing Exchange, Market, Pyth Price Feed', async () => {
        exchange = await sdk.accountFetcher.getExchange(exchangeAddress);
        if (exchange === undefined) {
            throw new Error("Failed to fetch exchange");
        }
        [marginAccount] = getMarginAccountPda(exchangeAddress, signer.publicKey, marginAccountId);
        signerTokenAccount = getAssociatedTokenAddressSync(
            translateAddress(exchange.collateralMint),
            signer.publicKey
        );
        // deposit $5.1 of margin collateral
        // NOTE: flip collateral expo sign
        margin = parseCollateralAmount(2, -exchange.collateralExpo);
        [marketAddress] = getMarketPda(exchangeAddress, marketId);
        market = await sdk.accountFetcher.getMarket(marketAddress);
        if (market === undefined) {
            throw new Error("Failed to fetch market");
        }
    });

    if(testParams.runDeposit) {
        it('Run Deposit', async () => {
            if (exchange === undefined) {
                throw new Error("Failed to fetch exchange");
            }
            if (market === undefined) {
                throw new Error("Failed to fetch market");
            }
    
            priceFeed = await sdk.accountFetcher.getPythPriceFeed(market?.priceFeed);
            if (priceFeed === undefined) {
                throw new Error("Failed to fetch priceFeed");
            }

            const {
                context: { slot: minContextSlot },
                value: { 
                    blockhash: latestBlockhash,
                    lastValidBlockHeight 
                }
            } = await connection.getLatestBlockhashAndContext();

            
            const tx = sdk
                    .transactionBuilder()
                    .depositMargin(
                        {
                            exchange: exchangeAddress,
                            marginAccount,
                            collateralVault: exchange?.collateralVault,
                            signer: signer.publicKey,
                            signerTokenAccount,
                        },
                        { margin }
                    )
                    .feePayer(signer.publicKey)
                    .buildSigned([signer], latestBlockhash);

                    console.log(`minContextSlot: ${minContextSlot}, LastValidBlockHeight: ${lastValidBlockHeight}`);
            await sendAndConfirmTransaction(connection, tx, [signer],{
                minContextSlot: minContextSlot,
                commitment: commitment
            });
        })
    }

    if(testParams.runIncreasePosition > 0) {
        it('Run Increase Position', async () => {
            if (exchange === undefined) {
                throw new Error("Failed to fetch exchange");
            }
            if (market === undefined) {
                throw new Error("Failed to fetch market");
            }
    
            priceFeed = await sdk.accountFetcher.getPythPriceFeed(market?.priceFeed);
            if (priceFeed === undefined) {
                throw new Error("Failed to fetch priceFeed");
            }

            const sizeDelta = parseSize(0.1);
            const acceptablePrice = parsePrice(1.1 * priceFeed.aggregate.price);
            const markets = [marketAddress];
            const priceFeeds = [market.priceFeed];
    
            let successes = 0;
            let totalDuration = 0;
            console.log(`Number of runs: ${numIncreaseRuns}`)
            console.log(`Commitment level: ${commitment}`)
            for (let i = 0; i < numIncreaseRuns; i++) {
                try {
                    const startTime = now();
                    const {
                        context: { slot: minContextSlot },
                        value: { 
                            blockhash: latestBlockhash,
                            lastValidBlockHeight 
                        }
                    } = await connection.getLatestBlockhashAndContext(commitment);
                    // Pass commitment to getLatest so you focus on confirmed rather than finalized
                    // Why? https://solana.com/docs/advanced/confirmation#fetch-blockhashes-with-the-appropriate-commitment-level
                    
                    const tx = sdk
                        .transactionBuilder()
                        .modifyPosition(
                            { exchange: exchangeAddress, marginAccount, signer: signer.publicKey },
                            { sizeDelta, marketId, acceptablePrice },
                            markets,
                            priceFeeds
                        )
                        .feePayer(signer.publicKey)
                        .buildSigned([signer], latestBlockhash, lastValidBlockHeight);
                    console.log(`minContextSlot: ${minContextSlot}, LastValidBlockHeight: ${lastValidBlockHeight}`);
                    await sendAndConfirmTransaction(connection, tx, [signer],{
                        minContextSlot: minContextSlot,
                        commitment: commitment
                    });
                    const endTime = now();
                    const duration = endTime - startTime;
    
                    successes++;
                    totalDuration += duration;
                    console.log(`Run ${i+1}: Success, took ${duration}ms`);
                } catch (error) {
                    console.log(`Run ${i+1}: Failed, error: ${error}`);
                }
            }
            if (successes > 0) {
                const averageDuration = totalDuration / successes;
                console.log(`Average time for ${successes} successful runs: ${averageDuration}ms`);
            } else {
                console.log('No successful runs');
            }
        }, numIncreaseRuns * 2 * 60 * 1000);
    }

    if(testParams.runDecreasePosition > 0) {
        it('Run Decrease Position', async () => {
            if (exchange === undefined) {
                throw new Error("Failed to fetch exchange");
            }
            if (market === undefined) {
                throw new Error("Failed to fetch market");
            }
    
            priceFeed = await sdk.accountFetcher.getPythPriceFeed(market?.priceFeed);
            if (priceFeed === undefined) {
                throw new Error("Failed to fetch priceFeed");
            }

            const sizeDelta = -parseSize(0.1);
            const acceptablePrice = parsePrice(1.1 * priceFeed.aggregate.price);
            const markets = [marketAddress];
            const priceFeeds = [market.priceFeed];
    
            let successes = 0;
            let totalDuration = 0;

            for (let i = 0; i < numDecreaseRuns; i++) {
                try {
                    const startTime = now();
                    const {
                        context: { slot: minContextSlot },
                        value: { 
                            blockhash: latestBlockhash,
                            lastValidBlockHeight 
                        }
                    } = await connection.getLatestBlockhashAndContext();
    
                    const tx = sdk
                        .transactionBuilder()
                        .modifyPosition(
                            { exchange: exchangeAddress, marginAccount, signer: signer.publicKey },
                            { sizeDelta, marketId, acceptablePrice },
                            markets,
                            priceFeeds
                        )
                        .feePayer(signer.publicKey)
                        .buildSigned([signer], latestBlockhash);
    
                        console.log(`minContextSlot: ${minContextSlot}, LastValidBlockHeight: ${lastValidBlockHeight}`);
                    await sendAndConfirmTransaction(connection, tx, [signer],{
                        minContextSlot: minContextSlot
                    });
                    const endTime = now();
                    const duration = endTime - startTime;
    
                    successes++;
                    totalDuration += duration;
                    console.log(`Run ${i+1}: Success, took ${duration}ms`);
                } catch (error) {
                    console.log(`Run ${i+1}: Failed, error: ${error}`);
                }
            }
            if (successes > 0) {
                const averageDuration = totalDuration / successes;
                console.log(`Average time for ${successes} successful runs: ${averageDuration}ms`);
            } else {
                console.log('No successful runs');
            }
        }, numDecreaseRuns * 60 * 1000);
    }
});