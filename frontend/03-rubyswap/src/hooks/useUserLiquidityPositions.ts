import { useState, useEffect, useMemo } from "react";
import { useWeb3React } from "./useWeb3";
import { ethers, BigNumber } from "ethers";
import { FACTORY_ADDRESS, FACTORY_ABI, PAIR_ABI } from "../constants/contracts";
import {
    TokenInfo,
    getTokenListByChainId,
    supportedTokens,
} from "../constants/tokens";
import useSWR from "swr";

// Define the structure for a user's position
export interface LiquidityPosition {
    pairAddress: string;
    token0: TokenInfo;
    token1: TokenInfo;
    lpTokenBalance: string; // Formatted LP token balance
    // TODO: Add underlying token amounts, pool share, etc.
}

// Fetcher function for SWR
const fetchUserPositions =
    (
        factoryAddress: string,
        account: string,
        provider: ethers.providers.Web3Provider,
    ) =>
    async (): Promise<LiquidityPosition[]> => {
        const factoryContract = new ethers.Contract(
            factoryAddress,
            FACTORY_ABI,
            provider,
        );
        const pairCount = await factoryContract.allPairsLength();
        console.log(`Total pairs found: ${pairCount}`);
        console.log(
            `Fetching positions for account: ${account} on factory: ${factoryAddress}`,
        );

        const userPositions: LiquidityPosition[] = [];
        const allTokens = supportedTokens; // Use our known tokens for lookup

        // Iterate through pairs (inefficient for large numbers, consider batching/multicall/subgraph)
        for (let i = 0; i < pairCount; i++) {
            try {
                const pairAddress = await factoryContract.allPairs(i);
                const pairContract = new ethers.Contract(
                    pairAddress,
                    PAIR_ABI,
                    provider,
                );
                const lpBalance: BigNumber =
                    await pairContract.balanceOf(account);

                // If user has LP tokens for this pair
                if (lpBalance.gt(0)) {
                    console.log(`[Pair ${i}] Address: ${pairAddress}`);
                    console.log(
                        `[Pair ${i}] Raw LP Balance: ${lpBalance.toString()}`,
                    );
                    const decimals = await pairContract.decimals();
                    console.log(`[Pair ${i}] LP Decimals: ${decimals}`);

                    const formattedLpBalance = ethers.utils.formatUnits(
                        lpBalance,
                        decimals,
                    );
                    console.log(
                        `[Pair ${i}] Formatted LP Balance: ${formattedLpBalance}`,
                    );

                    const token0Address = await pairContract.token0();
                    const token1Address = await pairContract.token1();

                    // Find token info from our constants (can be extended to fetch if unknown)
                    const token0 = allTokens.find(
                        (t) =>
                            t.address.toLowerCase() ===
                            token0Address.toLowerCase(),
                    );
                    const token1 = allTokens.find(
                        (t) =>
                            t.address.toLowerCase() ===
                            token1Address.toLowerCase(),
                    );

                    if (token0 && token1) {
                        userPositions.push({
                            pairAddress,
                            token0,
                            token1,
                            // Store the raw formatted string for display
                            lpTokenBalance: formattedLpBalance,
                        });
                    } else {
                        console.warn(
                            `Could not find token info for pair: ${pairAddress} (${token0Address}/${token1Address})`,
                        );
                    }
                }
            } catch (error) {
                console.error(`Error processing pair index ${i}:`, error);
            }
        }
        console.log("User positions found:", userPositions);
        return userPositions;
    };

export function useUserLiquidityPositions() {
    const { account, provider, chainId, isActive } = useWeb3React();
    const factoryAddress = chainId ? FACTORY_ADDRESS[chainId] : undefined;

    // SWR key depends on chain, account, and factory address
    const key = useMemo(() => {
        if (!isActive || !account || !factoryAddress || !chainId || !provider)
            return null;
        return ["userPositions", chainId, account, factoryAddress];
    }, [isActive, account, factoryAddress, chainId, provider]);

    const {
        data: positions,
        error,
        isLoading,
        mutate,
    } = useSWR(key, fetchUserPositions(factoryAddress!, account!, provider!), {
        refreshInterval: 30000, // Refresh every 30 seconds
        dedupingInterval: 20000,
        // Add error handling/retry config if needed
    });

    return {
        positions: positions ?? [], // Default to empty array
        isLoading,
        error,
        mutatePositions: mutate,
    };
}
