import { useState, useEffect, useMemo } from "react";
import { useWeb3React } from "./useWeb3";
import { ethers, BigNumber } from "ethers";
import { PAIR_ABI } from "../constants/contracts";
import {
    TokenInfo,
    NATIVE_ETH,
    NATIVE_SEPOLIA_ETH,
    supportedTokens,
} from "../constants/tokens";
import useSWR from "swr";

// Define the structure for detailed position info
export interface LiquidityPositionDetails {
    pairAddress: string;
    token0: TokenInfo;
    token1: TokenInfo;
    lpTokenBalance: string; // User's formatted LP balance
    lpTokenTotalSupply: string; // Total formatted LP supply
    reserve0: string; // Formatted reserve of token0
    reserve1: string; // Formatted reserve of token1
    // Raw values can be added if needed
}

// Fetcher function for SWR
const fetchPositionDetails =
    (
        pairAddress: string,
        account: string,
        provider: ethers.providers.Web3Provider,
    ) =>
    async (): Promise<LiquidityPositionDetails | null> => {
        try {
            console.log(
                `Fetching details for pair: ${pairAddress} for account: ${account}`,
            );
            const pairContract = new ethers.Contract(
                pairAddress,
                PAIR_ABI,
                provider,
            );
            const allTokens = supportedTokens;

            // Fetch data in parallel
            const [
                lpBalance,
                lpTotalSupply,
                decimals,
                token0Address,
                token1Address,
                reserves,
            ] = await Promise.all([
                pairContract.balanceOf(account) as Promise<BigNumber>,
                pairContract.totalSupply() as Promise<BigNumber>,
                pairContract.decimals() as Promise<number>,
                pairContract.token0() as Promise<string>,
                pairContract.token1() as Promise<string>,
                pairContract.getReserves() as Promise<{
                    _reserve0: BigNumber;
                    _reserve1: BigNumber;
                    _blockTimestampLast: number;
                }>,
            ]);

            console.log(
                `[Pair ${pairAddress}] Raw LP Balance: ${lpBalance.toString()}`,
            );
            console.log(
                `[Pair ${pairAddress}] Raw LP Total Supply: ${lpTotalSupply.toString()}`,
            );
            console.log(`[Pair ${pairAddress}] LP Decimals: ${decimals}`);
            console.log(
                `[Pair ${pairAddress}] Reserves: ${reserves._reserve0.toString()}, ${reserves._reserve1.toString()}`,
            );

            // Check if user actually has balance (might have navigated directly)
            if (lpBalance.lte(0)) {
                console.log(`[Pair ${pairAddress}] User has no balance.`);
                return null;
            }

            const token0 = allTokens.find(
                (t) => t.address.toLowerCase() === token0Address.toLowerCase(),
            );
            const token1 = allTokens.find(
                (t) => t.address.toLowerCase() === token1Address.toLowerCase(),
            );

            if (!token0 || !token1) {
                console.warn(
                    `Could not find token info for pair: ${pairAddress}`,
                );
                return null;
            }

            // Format values
            const formattedLpBalance = ethers.utils.formatUnits(
                lpBalance,
                decimals,
            );
            const formattedTotalSupply = ethers.utils.formatUnits(
                lpTotalSupply,
                decimals,
            );
            const formattedReserve0 = ethers.utils.formatUnits(
                reserves._reserve0,
                token0.decimals,
            );
            const formattedReserve1 = ethers.utils.formatUnits(
                reserves._reserve1,
                token1.decimals,
            );

            const details: LiquidityPositionDetails = {
                pairAddress,
                token0,
                token1,
                lpTokenBalance: formattedLpBalance,
                lpTokenTotalSupply: formattedTotalSupply,
                reserve0: formattedReserve0,
                reserve1: formattedReserve1,
            };
            console.log(`[Pair ${pairAddress}] Fetched Details:`, details);
            return details;
        } catch (error) {
            console.error(
                `Error fetching details for pair ${pairAddress}:`,
                error,
            );
            throw error; // Re-throw for SWR error handling
        }
    };

export function useLiquidityPositionDetails(pairAddress?: string) {
    const { account, provider, chainId, isActive } = useWeb3React();

    // SWR key includes pairAddress now
    const key = useMemo(() => {
        if (!isActive || !account || !pairAddress || !chainId || !provider)
            return null;
        try {
            ethers.utils.getAddress(pairAddress); // Validate address format
        } catch {
            return null; // Invalid address format
        }
        return ["positionDetails", chainId, account, pairAddress];
    }, [isActive, account, pairAddress, chainId, provider]);

    const {
        data: positionDetails,
        error,
        isLoading,
        mutate,
    } = useSWR(key, fetchPositionDetails(pairAddress!, account!, provider!), {
        refreshInterval: 15000, // Refresh less often than balances maybe?
        dedupingInterval: 10000,
    });

    return {
        positionDetails: positionDetails ?? null, // Default to null
        isLoading,
        error,
        mutateDetails: mutate,
    };
}
 