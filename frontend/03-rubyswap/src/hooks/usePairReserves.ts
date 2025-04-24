import { useState, useEffect, useMemo } from "react";
import { useWeb3React } from "./useWeb3";
import { ethers, BigNumber } from "ethers";
import { FACTORY_ADDRESS, FACTORY_ABI, PAIR_ABI } from "../constants/contracts";
import { TokenInfo } from "../constants/tokens";
import useSWR from "swr";

export interface PairReserves {
    reserve0: string;
    reserve1: string;
    blockTimestampLast: number;
    // Raw BigNumber reserves can be added if needed
}

const getReservesFetcher =
    (
        factoryAddress: string,
        provider: ethers.providers.Web3Provider,
        tokenA?: TokenInfo,
        tokenB?: TokenInfo,
    ) =>
    async (): Promise<PairReserves | null> => {
        if (!tokenA || !tokenB || !factoryAddress || !provider) return null;

        try {
            const factoryContract = new ethers.Contract(
                factoryAddress,
                FACTORY_ABI,
                provider,
            );
            const pairAddress = await factoryContract.getPair(
                tokenA.address,
                tokenB.address,
            );

            if (!pairAddress || pairAddress === ethers.constants.AddressZero) {
                console.log(
                    `Pair not found for ${tokenA.symbol}-${tokenB.symbol}`,
                );
                return null; // Pair doesn't exist
            }

            const pairContract = new ethers.Contract(
                pairAddress,
                PAIR_ABI,
                provider,
            );
            const reserves = (await pairContract.getReserves()) as {
                _reserve0: BigNumber;
                _reserve1: BigNumber;
                _blockTimestampLast: number;
            };

            // Reserves need to be ordered according to token0/token1 of the pair contract
            const token0Address = await pairContract.token0();
            const [reserve0Raw, reserve1Raw] =
                tokenA.address.toLowerCase() === token0Address.toLowerCase()
                    ? [reserves._reserve0, reserves._reserve1]
                    : [reserves._reserve1, reserves._reserve0];

            const token0Decimals =
                tokenA.address.toLowerCase() === token0Address.toLowerCase()
                    ? tokenA.decimals
                    : tokenB.decimals;
            const token1Decimals =
                tokenA.address.toLowerCase() === token0Address.toLowerCase()
                    ? tokenB.decimals
                    : tokenA.decimals;

            const formattedReserve0 = ethers.utils.formatUnits(
                reserve0Raw,
                token0Decimals,
            );
            const formattedReserve1 = ethers.utils.formatUnits(
                reserve1Raw,
                token1Decimals,
            );

            console.log(
                `Reserves for ${tokenA.symbol}-${tokenB.symbol}: ${formattedReserve0}, ${formattedReserve1}`,
            );

            return {
                reserve0: formattedReserve0,
                reserve1: formattedReserve1,
                blockTimestampLast: reserves._blockTimestampLast,
            };
        } catch (error) {
            console.error(
                `Error fetching reserves for ${tokenA.symbol}-${tokenB.symbol}:`,
                error,
            );
            return null; // Indicate error or non-existence
        }
    };

export function usePairReserves(tokenA?: TokenInfo, tokenB?: TokenInfo) {
    const { provider, chainId, isActive } = useWeb3React();
    const factoryAddress = chainId ? FACTORY_ADDRESS[chainId] : undefined;

    const key = useMemo(() => {
        if (
            !isActive ||
            !tokenA ||
            !tokenB ||
            !factoryAddress ||
            !chainId ||
            !provider
        )
            return null;
        // Sort addresses for consistent key
        const [addrA, addrB] =
            tokenA.address.toLowerCase() < tokenB.address.toLowerCase()
                ? [tokenA.address, tokenB.address]
                : [tokenB.address, tokenA.address];
        return ["pairReserves", chainId, factoryAddress, addrA, addrB];
    }, [isActive, tokenA, tokenB, factoryAddress, chainId, provider]);

    const {
        data: reserves,
        error,
        isLoading,
        mutate,
    } = useSWR(
        key,
        getReservesFetcher(factoryAddress!, provider!, tokenA, tokenB),
        {
            refreshInterval: 10000, // Refresh reserves periodically
        },
    );

    return {
        reserves: reserves ?? null,
        isLoading,
        error,
        mutateReserves: mutate,
    };
}
