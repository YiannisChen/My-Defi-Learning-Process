import { useState, useEffect, useMemo } from "react";
import { useWeb3React } from "./useWeb3";
import { ethers, BigNumber } from "ethers";
import {
    TokenInfo,
    NATIVE_ETH,
    NATIVE_SEPOLIA_ETH,
    ERC20_ABI,
} from "../constants/tokens";
import { ROUTER_ADDRESS } from "../constants/contracts";
import useSWR from "swr";

const getAllowance =
    (
        provider: ethers.providers.Web3Provider,
        account: string,
        tokenAddress: string,
        spender: string,
    ) =>
    async () => {
        const contract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
        const allowance: BigNumber = await contract.allowance(account, spender);
        return allowance;
    };

export function useAllowance(token?: TokenInfo) {
    const { account, provider, chainId, isActive } = useWeb3React();
    const spender = chainId ? ROUTER_ADDRESS[chainId] : undefined;

    // Key depends on account, chain, token, and spender
    const key = useMemo(() => {
        if (
            !isActive ||
            !account ||
            !token ||
            token.address === NATIVE_ETH.address ||
            token.address === NATIVE_SEPOLIA_ETH.address ||
            !spender ||
            !chainId ||
            !provider
        ) {
            return null; // No allowance needed for ETH or if prerequisites missing
        }
        return ["allowance", chainId, account, token.address, spender];
    }, [isActive, account, token, spender, chainId, provider]);

    const {
        data: allowance,
        error,
        isLoading,
        mutate,
    } = useSWR(
        key,
        getAllowance(provider!, account!, token?.address!, spender!),
        {
            refreshInterval: 15000, // Check allowance periodically
            dedupingInterval: 10000,
        },
    );

    return {
        allowance: allowance, // Return BigNumber
        error,
        isLoading,
        mutateAllowance: mutate,
    };
}
