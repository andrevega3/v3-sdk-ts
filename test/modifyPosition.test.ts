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
import { wait}  from '../src/utils/wait'


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
    // const numDecreaseRuns = testParams.runDecreasePosition ?? 10;

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

            const sizeDelta = parseSize(0.05);
            const acceptablePrice = parsePrice(1.1 * priceFeed.aggregate.price);
            const markets = [marketAddress];
            const priceFeeds = [market.priceFeed];
    
            let successes = 0;
            let totalDuration = 0;
            const durations: number[] = [];
            let successesNew = 0;
            let totalDurationNew = 0;
            const durationsNew: number[] = [];
            console.log(`Number of runs: ${numIncreaseRuns}`)
            console.log(`Commitment level: ${commitment}`)
            for (let i = 0; i < numIncreaseRuns; i++) {
                const startTimeNew = now()
                try {
                    const getLatestBlockhashAndContext = await connection.getLatestBlockhashAndContext({ commitment: "confirmed" });

                    const minContextSlot: number = getLatestBlockhashAndContext.context.slot - 4;
                    const blockhash: string = getLatestBlockhashAndContext.value.blockhash;
                    const lastValidBlockHeight: number = getLatestBlockhashAndContext.value.lastValidBlockHeight;

                    const tx = await sdk
                        .transactionBuilder()
                        .setComputeUnitBudget(400_000) // Will optimize later
                        .setComputeUnitPrice(1) // Will optimize later
                        .modifyPosition(
                            { exchange: exchangeAddress, marginAccount, signer: signer.publicKey },
                            { sizeDelta, marketId, acceptablePrice },
                            markets,
                            priceFeeds
                        )
                        .feePayer(signer.publicKey)
                        .buildOptimizedSigned(connection, [signer], blockhash, lastValidBlockHeight, "Medium");
                    console.log(`minContextSlot: ${minContextSlot}, LastValidBlockHeight: ${lastValidBlockHeight}`);
                    await sendAndConfirmTransaction(connection, tx, [signer],
                        {
                            // minContextSlot: minContextSlot,
                            commitment: "confirmed"
                        }
                    );
                    const endTime = now();
                    const duration = endTime - startTimeNew;
    
                    successesNew++;
                    totalDurationNew += duration;
                    durationsNew.push(duration);
                    console.log(`New) Run ${i+1}: Success, took ${duration}ms`);
                } catch (error) {
                    const endTime = now();
                    const duration = endTime - startTimeNew;

                    totalDurationNew += duration;
                    durationsNew.push(duration);
                    console.log(`New) Run ${i+1}: Failed, error: ${error}`);
                }
                const startTimeOld = now();
                try {
                    const { blockhash: latestBlockhash } = await connection.getLatestBlockhash();
                    
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
                    await sendAndConfirmTransaction(connection, tx, [signer]);
                    const endTime = now();
                    const duration = endTime - startTimeOld;
    
                    successes++;
                    totalDuration += duration;
                    durations.push(duration);
                    console.log(`Old) Run ${i+1}: Success, took ${duration}ms`);
                } catch (error) {
                    const endTime = now();
                    const duration = endTime - startTimeOld;
    
                    totalDuration += duration;
                    durations.push(duration);
                    console.log(`Old) Run ${i+1}: Failed, error: ${error}`);
                }
                await wait(2000)
            }
            if (successes > 0) {
                const averageDuration = totalDuration / successes;
                durations.sort((a, b) => a - b);
                const medianDuration = durations[Math.floor(durations.length / 2)];
                console.log(`Old) Average time for ${successes} successful runs: ${averageDuration}ms`);
                console.log(`Old) Median time for ${successes} successful runs: ${medianDuration}ms`);
                const averageDurationNew = totalDurationNew / successesNew;
                durationsNew.sort((a, b) => a - b);
                const medianDurationNew = durationsNew[Math.floor(durationsNew.length / 2)];
                console.log(`New) Average time for ${successesNew} successful runs: ${averageDurationNew}ms`);
                console.log(`New) Median time for ${successesNew} successful runs: ${medianDurationNew}ms`);
            } else {
                console.log('No successful runs');
            }
        }, numIncreaseRuns * 3 * 60 * 1000);
    }

    // TODO: Add close position
    // TODO: Fix decreasing position
    // if(testParams.runDecreasePosition > 0) {
    //     it('Run Decrease Position', async () => {
    //         if (exchange === undefined) {
    //             throw new Error("Failed to fetch exchange");
    //         }
    //         if (market === undefined) {
    //             throw new Error("Failed to fetch market");
    //         }
    
    //         priceFeed = await sdk.accountFetcher.getPythPriceFeed(market?.priceFeed);
    //         if (priceFeed === undefined) {
    //             throw new Error("Failed to fetch priceFeed");
    //         }

    //         const sizeDelta = -parseSize(0.1);
    //         const acceptablePrice = parsePrice(1.1 * priceFeed.aggregate.price);
    //         const markets = [marketAddress];
    //         const priceFeeds = [market.priceFeed];
    
    //         let successes = 0;
    //         let totalDuration = 0;

    //         for (let i = 0; i < numDecreaseRuns; i++) {
    //             try {
    //                 const startTime = now();
    //                 const {
    //                     context: { slot: minContextSlot },
    //                     value: { 
    //                         blockhash: latestBlockhash,
    //                         lastValidBlockHeight 
    //                     }
    //                 } = await connection.getLatestBlockhashAndContext();
    
    //                 const tx = sdk
    //                     .transactionBuilder()
    //                     .modifyPosition(
    //                         { exchange: exchangeAddress, marginAccount, signer: signer.publicKey },
    //                         { sizeDelta, marketId, acceptablePrice },
    //                         markets,
    //                         priceFeeds
    //                     )
    //                     .feePayer(signer.publicKey)
    //                     .buildSigned([signer], latestBlockhash);
    
    //                     console.log(`minContextSlot: ${minContextSlot}, LastValidBlockHeight: ${lastValidBlockHeight}`);
    //                 await sendAndConfirmTransaction(connection, tx, [signer],{
    //                     minContextSlot: minContextSlot
    //                 });
    //                 const endTime = now();
    //                 const duration = endTime - startTime;
    
    //                 successes++;
    //                 totalDuration += duration;
    //                 console.log(`Run ${i+1}: Success, took ${duration}ms`);
    //             } catch (error) {
    //                 console.log(`Run ${i+1}: Failed, error: ${error}`);
    //             }
    //         }
    //         if (successes > 0) {
    //             const averageDuration = totalDuration / successes;
    //             console.log(`Average time for ${successes} successful runs: ${averageDuration}ms`);
    //         } else {
    //             console.log('No successful runs');
    //         }
    //     }, numDecreaseRuns * 60 * 1000);
    // }
});