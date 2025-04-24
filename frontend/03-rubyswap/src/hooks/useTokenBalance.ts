import { useState, useEffect, useMemo } from "react";
import { useWeb3React } from "./useWeb3";
import { ethers } from "ethers";
import { TokenInfo, NATIVE_ETH, NATIVE_SEPOLIA_ETH } from "../constants/tokens";
import useSWR from "swr"; // Using SWR for data fetching and caching

const getBalance =
    (
        provider: ethers.providers.Web3Provider,
        account: string,
        token?: TokenInfo,
    ) =>
    async () => {
        if (!token) {
            throw new Error("Token not specified");
        }

        if (
            token.address === NATIVE_ETH.address ||
            token.address === NATIVE_SEPOLIA_ETH.address
        ) {
            const balance = await provider.getBalance(account);
            return ethers.utils.formatUnits(balance, token.decimals);
        } else {
            const erc20Abi = [
                "function balanceOf(address owner) view returns (uint256)",
            ];
            const contract = new ethers.Contract(
                token.address,
                erc20Abi,
                provider,
            );
            const balance = await contract.balanceOf(account);
            return ethers.utils.formatUnits(balance, token.decimals);
        }
    };

export function useTokenBalance(token?: TokenInfo) {
    const { account, provider, chainId, isActive } = useWeb3React();

    // Create a unique key for SWR based on chain, account, and token address
    const key = useMemo(() => {
        if (!isActive || !account || !token || !chainId || !provider)
            return null;
        return ["balance", chainId, account, token.address];
    }, [isActive, account, token, chainId, provider]);

    // Use SWR to fetch balance
    // - The key uniquely identifies the request.
    // - getBalance is the fetcher function.
    // - refreshInterval updates the balance every 10 seconds.
    const {
        data: balance,
        error,
        isLoading,
        mutate,
    } = useSWR(
        key, // Pass null key if prerequisites aren't met
        getBalance(provider!, account!, token),
        {
            refreshInterval: 10000, // Refresh every 10 seconds
            dedupingInterval: 5000, // Deduplicate requests within 5 seconds
            errorRetryCount: 2,
            shouldRetryOnError: true,
        },
    );

    // Effect to refetch when account or chainId changes (SWR handles key change automatically)
    // This can be simplified as SWR's key dependency already handles this.
    // useEffect(() => {
    //     mutate(); // Revalidate SWR cache
    // }, [account, chainId, token, mutate]);

    return {
        balance: balance ? parseFloat(balance).toFixed(4) : "--", // Format to 4 decimals or show '--'
        rawBalance: balance, // Return raw balance if needed
        error,
        isLoading,
        mutateBalance: mutate, // Allow manual revalidation
    };
}
