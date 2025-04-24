import { useState, useCallback, useEffect } from "react";
import { useWeb3React } from "./useWeb3";
import { ethers, BigNumber } from "ethers";
import {
    TokenInfo,
    ERC20_ABI,
    NATIVE_ETH,
    NATIVE_SEPOLIA_ETH,
} from "../constants/tokens";
import { ROUTER_ADDRESS } from "../constants/contracts";
import { useAllowance } from "./useAllowance";
import { useTransactionContext } from "../context/TransactionContext";

// Define approval states
export enum ApprovalState {
    UNKNOWN,
    NOT_APPROVED,
    PENDING,
    APPROVED,
}

export function useApprove(token?: TokenInfo, amountToApprove?: string) {
    const { account, provider, chainId } = useWeb3React();
    const spender = chainId ? ROUTER_ADDRESS[chainId] : undefined;
    const { allowance, mutateAllowance } = useAllowance(token);
    const [approvalState, setApprovalState] = useState<ApprovalState>(
        ApprovalState.UNKNOWN,
    );
    const [txHashInternal, setTxHashInternal] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const { setLatestTxHash } = useTransactionContext();

    const isETH =
        token?.address === NATIVE_ETH.address ||
        token?.address === NATIVE_SEPOLIA_ETH.address;

    // Check current approval status
    useEffect(() => {
        if (isETH || !token || !amountToApprove || !allowance || !spender) {
            setApprovalState(ApprovalState.UNKNOWN); // Can't determine without necessary info
            return;
        }

        try {
            const amountBN = ethers.utils.parseUnits(
                amountToApprove,
                token.decimals,
            );
            if (allowance.lt(amountBN)) {
                // Check if already pending from this hook instance
                if (approvalState !== ApprovalState.PENDING) {
                    setApprovalState(ApprovalState.NOT_APPROVED);
                }
            } else {
                setApprovalState(ApprovalState.APPROVED);
            }
        } catch (e) {
            console.error("Error parsing amount for approval check:", e);
            setApprovalState(ApprovalState.UNKNOWN);
        }
    }, [token, amountToApprove, allowance, spender, approvalState, isETH]); // Re-check when relevant values change

    const approve = useCallback(async () => {
        if (
            approvalState !== ApprovalState.NOT_APPROVED ||
            !token ||
            !spender ||
            !provider ||
            !account ||
            isETH
        ) {
            console.error("Approve called in invalid state or for ETH");
            return;
        }

        setApprovalState(ApprovalState.PENDING);
        setTxHashInternal(null);
        setLatestTxHash(null);
        setError(null);

        try {
            const signer = provider.getSigner();
            const tokenContract = new ethers.Contract(
                token.address,
                ERC20_ABI,
                signer,
            );

            // Approve max amount for simplicity, common practice
            const tx = await tokenContract.approve(
                spender,
                ethers.constants.MaxUint256,
            );
            setTxHashInternal(tx.hash);
            setLatestTxHash(tx.hash);
            console.log("Approval Transaction sent:", tx.hash);

            await tx.wait(1); // Wait for 1 confirmation
            console.log("Approval Transaction confirmed:", tx.hash);

            setApprovalState(ApprovalState.APPROVED);
            mutateAllowance(); // Re-fetch allowance after approval
        } catch (err: any) {
            console.error("Failed to approve token:", err);
            setError(`Approval failed: ${err.message || "Unknown error"}`);
            // Reset state if approval failed (unless it was just pending)
            if (allowance && amountToApprove) {
                try {
                    const amountBN = ethers.utils.parseUnits(
                        amountToApprove,
                        token.decimals,
                    );
                    setApprovalState(
                        allowance.lt(amountBN)
                            ? ApprovalState.NOT_APPROVED
                            : ApprovalState.APPROVED,
                    );
                } catch {
                    setApprovalState(ApprovalState.UNKNOWN);
                }
            } else {
                setApprovalState(ApprovalState.UNKNOWN);
            }
            setTxHashInternal(null);
            setLatestTxHash(null);
        }
    }, [
        approvalState,
        token,
        spender,
        provider,
        account,
        mutateAllowance,
        isETH,
        allowance,
        amountToApprove,
        setLatestTxHash,
    ]);

    return { approvalState, approve, txHash: txHashInternal, error };
}
