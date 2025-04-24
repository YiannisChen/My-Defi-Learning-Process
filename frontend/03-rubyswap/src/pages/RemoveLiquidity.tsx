import React, { useState, useMemo, useCallback, useEffect } from "react";
import styled from "styled-components";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useWeb3React } from "../hooks/useWeb3";
import { Button } from "../components/Button";
import { Heading, Text, ErrorText } from "../components/Typography";
import { useWalletModal } from "../context/WalletModalContext";
import { useSettingsModal } from "../context/SettingsModalContext";
import { useLiquidityPositionDetails } from "../hooks/useLiquidityPositionDetails";
import { PAIR_ABI, ROUTER_ABI, ROUTER_ADDRESS } from "../constants/contracts";
import { NATIVE_ETH, NATIVE_SEPOLIA_ETH, TokenInfo } from "../constants/tokens";
import { useApprove, ApprovalState } from "../hooks/useApprove";
import { useTransactionContext } from "../context/TransactionContext";
import { ethers, BigNumber } from "ethers";
import Decimal from "decimal.js";
import { ArrowLeft } from "react-feather";

const colors = {
    primary: "#a13c3c",
    secondary: "#fdfcfb",
    accent: "#76c7c0",
    textPrimary: "#2d2d2d",
    textSecondary: "#565a69",
    background: "#faf8f7",
    border: "#edeef2",
    error: "#e84142",
};

const RemoveContainer = styled.div`
    width: 100%;
    display: flex;
    flex-direction: column;
    padding: 1.5rem;
    box-sizing: border-box;
`;

const RemoveHeader = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1.5rem;
    width: 100%;
`;

const PositionInfo = styled.div`
    background-color: #f7f8fa;
    border-radius: 20px;
    padding: 1rem;
    margin-bottom: 1.5rem;
    border: 1px solid #f0f0f0;
`;

const RowBetween = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.5rem;
`;

const DoubleLogo = styled.div`
    display: flex;
    align-items: center;
`;

const TokenLogo = styled.div<{ bg?: string }>`
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background-color: ${({ bg }) => bg || "#E84142"};
    margin-right: ${({ bg }) => (bg ? "-8px" : "0")};
    z-index: ${({ bg }) => (bg ? "2" : "1")};
    border: 2px solid white;
`;

const SliderContainer = styled.div`
    margin: 1.5rem 0;
`;

const PercentageDisplay = styled.div`
    text-align: center;
    font-size: 24px;
    font-weight: 500;
    margin-bottom: 1rem;
`;

const Slider = styled.input`
    width: 100%;
    cursor: pointer;
    /* Basic slider styling - can be enhanced */
    accent-color: #e84142;
`;

const PercentageButtons = styled.div`
    display: flex;
    justify-content: space-between;
    margin-top: 0.5rem;
`;

const RemoveButton = styled(Button)`
    margin-top: 1.5rem;
    padding: 1rem;
    font-size: 18px;
    border-radius: 20px;
`;

const ConnectWalletOverlay = styled.div`
    margin-top: 2rem;
    text-align: center;
`;

const LoadingOverlay = styled(ConnectWalletOverlay)``;

const ErrorTextStyled = styled(ErrorText)`
    margin-top: 1rem;
    text-align: center;
`;

const TxHashText = styled(Text)`
    font-size: 12px;
    color: #565a69;
    text-align: center;
    margin-top: 0.5rem;
    word-break: break-all;
`;

const ReceiveInfo = styled(PositionInfo)`
    margin-top: 1rem;
`;

const BackLink = styled(Link)`
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    color: ${colors.textSecondary};
    text-decoration: none;
    margin-bottom: 1.5rem;
    font-size: 14px;
    font-weight: 500;
    width: fit-content;

    &:hover {
        color: ${colors.textPrimary};
    }
`;

const calculateAmountsToRemove = (
    percentage: number,
    lpBalance: string | undefined,
    totalSupply: string | undefined,
    reserve0: string | undefined,
    reserve1: string | undefined,
): { amount0: string; amount1: string } | null => {
    if (
        !lpBalance ||
        !totalSupply ||
        !reserve0 ||
        !reserve1 ||
        percentage <= 0
    ) {
        return null;
    }
    try {
        const percentDecimal = new Decimal(percentage).div(100);
        const lpToRemove = new Decimal(lpBalance).times(percentDecimal);
        const poolShare = lpToRemove.div(new Decimal(totalSupply));

        const amount0 = poolShare.times(new Decimal(reserve0));
        const amount1 = poolShare.times(new Decimal(reserve1));

        return {
            amount0: amount0.toSignificantDigits(6).toString(),
            amount1: amount1.toSignificantDigits(6).toString(),
        };
    } catch (e) {
        console.error("Error calculating removal amounts:", e);
        return null;
    }
};

const RemoveLiquidity: React.FC = () => {
    const { pairAddress } = useParams<{ pairAddress: string }>();
    const { isActive, account, chainId, provider } = useWeb3React();
    const { openWalletModal } = useWalletModal();
    const { openSettingsModal } = useSettingsModal();
    const { setLatestTxHash } = useTransactionContext();
    const navigate = useNavigate();

    const [percentage, setPercentage] = useState(50);
    const [txState, setTxState] = useState<
        "idle" | "pending" | "success" | "fail"
    >("idle");
    const [txHashInternal, setTxHashInternal] = useState<string | null>(null);
    const [generalError, setGeneralError] = useState<string | null>(null);

    const {
        positionDetails,
        isLoading: isLoadingDetails,
        error: detailsError,
    } = useLiquidityPositionDetails(pairAddress);

    const lpTokenInfo = useMemo((): TokenInfo | undefined => {
        if (!positionDetails) return undefined;
        return {
            chainId: chainId ?? 0,
            address: positionDetails.pairAddress,
            name: `Ruby V2 (${positionDetails.token0.symbol}/${positionDetails.token1.symbol})`,
            symbol: "RUBY-V2",
            decimals: 18,
        };
    }, [positionDetails, chainId]);

    const {
        approvalState,
        approve,
        error: approveError,
        txHash: approveTxHash,
    } = useApprove(lpTokenInfo, positionDetails?.lpTokenBalance);

    const routerAddress = chainId ? ROUTER_ADDRESS[chainId] : undefined;
    const {
        token0,
        token1,
        lpTokenBalance,
        lpTokenTotalSupply,
        reserve0,
        reserve1,
    } = positionDetails || {};
    const amountsToRemove = calculateAmountsToRemove(
        percentage,
        lpTokenBalance,
        lpTokenTotalSupply,
        reserve0,
        reserve1,
    );
    const isETHSelected = useMemo(
        () =>
            token0?.address === NATIVE_SEPOLIA_ETH.address ||
            token1?.address === NATIVE_SEPOLIA_ETH.address,
        [token0, token1],
    );

    useEffect(() => {
        setTxState("idle");
        setTxHashInternal(null);
        setGeneralError(null);
    }, [percentage]);

    const handleRemoveLiquidity = useCallback(async () => {
        if (
            !token0 ||
            !token1 ||
            !account ||
            !provider ||
            !routerAddress ||
            !lpTokenInfo ||
            !positionDetails?.lpTokenBalance
        )
            return;
        if (percentage <= 0) {
            setGeneralError("Percentage must be > 0");
            return;
        }

        setTxState("pending");
        setTxHashInternal(null);
        setLatestTxHash(null);
        setGeneralError(null);

        try {
            const signer = provider.getSigner();
            const routerContract = new ethers.Contract(
                routerAddress,
                ROUTER_ABI,
                signer,
            );
            const deadline = Math.floor(Date.now() / 1000) + 60 * 20;

            const lpBalanceBN = ethers.utils.parseUnits(
                positionDetails.lpTokenBalance,
                lpTokenInfo.decimals,
            );
            const liquidityToRemove = lpBalanceBN.mul(percentage).div(100);

            const amount0Min = 0;
            const amount1Min = 0;

            let tx;
            if (isETHSelected) {
                const erc20Token =
                    token0.address === NATIVE_SEPOLIA_ETH.address
                        ? token1
                        : token0;
                const tokenAmountMin =
                    token0.address === NATIVE_SEPOLIA_ETH.address
                        ? amount1Min
                        : amount0Min;
                const ethAmountMin =
                    token0.address === NATIVE_SEPOLIA_ETH.address
                        ? amount0Min
                        : amount1Min;
                console.log("Calling removeLiquidityETH");
                tx = await routerContract.removeLiquidityETH(
                    erc20Token.address,
                    liquidityToRemove,
                    tokenAmountMin,
                    ethAmountMin,
                    account,
                    deadline,
                );
            } else {
                console.log("Calling removeLiquidity");
                tx = await routerContract.removeLiquidity(
                    token0.address,
                    token1.address,
                    liquidityToRemove,
                    amount0Min,
                    amount1Min,
                    account,
                    deadline,
                );
            }

            setTxHashInternal(tx.hash);
            setLatestTxHash(tx.hash);
            await tx.wait(1);
            setTxState("success");

            console.log("Remove successful, navigating back to pools in 3s...");
            setTimeout(() => {
                navigate("/pool");
            }, 3000);
        } catch (err: any) {
            console.error("Remove Liquidity failed:", err);
            setGeneralError(
                `Transaction failed: ${err.reason || err.message || "Unknown error"}`,
            );
            setTxState("fail");
            setTxHashInternal(null);
            setLatestTxHash(null);
        }
    }, [
        token0,
        token1,
        account,
        provider,
        routerAddress,
        lpTokenInfo,
        positionDetails,
        percentage,
        setLatestTxHash,
        isETHSelected,
        navigate,
    ]);

    let buttonAction: () => void | Promise<void> = handleRemoveLiquidity;
    let buttonDisabled =
        percentage <= 0 ||
        !isActive ||
        !positionDetails ||
        txState === "pending";
    let buttonText = "Remove";

    if (!isActive) {
        buttonAction = openWalletModal;
        buttonText = "Connect Wallet";
        buttonDisabled = false;
    } else if (isLoadingDetails) {
        buttonText = "Loading...";
        buttonDisabled = true;
    } else if (!positionDetails) {
        buttonText = "Position Not Found";
        buttonDisabled = true;
    } else if (percentage <= 0) {
        buttonText = "Enter Amount";
        buttonDisabled = true;
    } else if (approvalState === ApprovalState.NOT_APPROVED) {
        buttonAction = approve;
        buttonText = `Approve ${lpTokenInfo?.symbol || "LP Token"}`;
        buttonDisabled = false;
    } else if (approvalState === ApprovalState.PENDING) {
        buttonText = "Approving...";
        buttonDisabled = true;
    } else if (txState === "pending") {
        buttonText = "Removing...";
        buttonDisabled = true;
    } else if (txState === "success") {
        buttonText = "Success!";
    } else if (txState === "fail") {
        buttonText = "Transaction Failed";
        buttonAction = handleRemoveLiquidity;
        buttonDisabled = false;
    }

    const renderPositionInfo = () => {
        if (isLoadingDetails) return <Text>Loading position...</Text>;
        if (detailsError || !positionDetails)
            return (
                <Text color="#E84142">Failed to load position details.</Text>
            );
        const { token0, token1, reserve0, reserve1 } = positionDetails;
        return (
            <PositionInfo>
                <RowBetween>
                    <Text fontWeight="600">Your Position</Text>
                    <DoubleLogo>
                        <TokenLogo />
                        <TokenLogo bg="#2172E5" />
                    </DoubleLogo>
                </RowBetween>
                <RowBetween>
                    <Text color="#565a69">Pooled {token0.symbol}:</Text>
                    <Text>{parseFloat(reserve0).toFixed(4)}</Text>
                </RowBetween>
                <RowBetween>
                    <Text color="#565a69">Pooled {token1.symbol}:</Text>
                    <Text>{parseFloat(reserve1).toFixed(4)}</Text>
                </RowBetween>
                <RowBetween>
                    <Text color="#565a69">Your LP Tokens:</Text>
                    <Text>{parseFloat(lpTokenBalance ?? "0").toFixed(8)}</Text>
                </RowBetween>
            </PositionInfo>
        );
    };

    const renderReceiveInfo = () => {
        if (isLoadingDetails || !positionDetails || !amountsToRemove)
            return null;
        const { token0, token1 } = positionDetails;
        return (
            <ReceiveInfo>
                <Text
                    fontSize="14px"
                    fontWeight="600"
                    style={{ marginBottom: "0.75rem", textAlign: "center" }}
                >
                    You will receive
                </Text>
                <RowBetween>
                    <Text color="#565a69">{token0.symbol}:</Text>
                    <Text>{amountsToRemove.amount0}</Text>
                </RowBetween>
                <RowBetween>
                    <Text color="#565a69">{token1.symbol}:</Text>
                    <Text>{amountsToRemove.amount1}</Text>
                </RowBetween>
            </ReceiveInfo>
        );
    };

    return (
        <RemoveContainer>
            <BackLink to="/pool">
                <ArrowLeft size={16} /> Back to Pools
            </BackLink>

            <RemoveHeader>
                <Heading fontSize="20px">Remove Liquidity</Heading>
                <Button
                    size="small"
                    variant="tertiary"
                    onClick={openSettingsModal}
                >
                    Settings
                </Button>
            </RemoveHeader>

            {!isActive ? (
                <ConnectWalletOverlay>
                    <Text color="#888" style={{ marginBottom: "1rem" }}>
                        Connect your wallet to manage liquidity.
                    </Text>
                    <Button onClick={openWalletModal}>Connect Wallet</Button>
                </ConnectWalletOverlay>
            ) : (
                <>
                    {renderPositionInfo()}

                    <SliderContainer>
                        <PercentageDisplay>{percentage}%</PercentageDisplay>
                        <Slider
                            type="range"
                            min="0"
                            max="100"
                            step="1"
                            value={percentage}
                            onChange={(e) =>
                                setPercentage(Number(e.target.value))
                            }
                        />
                        <PercentageButtons>
                            <Button
                                size="small"
                                variant="tertiary"
                                onClick={() => setPercentage(25)}
                            >
                                25%
                            </Button>
                            <Button
                                size="small"
                                variant="tertiary"
                                onClick={() => setPercentage(50)}
                            >
                                50%
                            </Button>
                            <Button
                                size="small"
                                variant="tertiary"
                                onClick={() => setPercentage(75)}
                            >
                                75%
                            </Button>
                            <Button
                                size="small"
                                variant="tertiary"
                                onClick={() => setPercentage(100)}
                            >
                                Max
                            </Button>
                        </PercentageButtons>
                    </SliderContainer>

                    {renderReceiveInfo()}

                    {(approveError || generalError) && (
                        <ErrorTextStyled>
                            {approveError || generalError}
                        </ErrorTextStyled>
                    )}

                    {(approveTxHash || txHashInternal) && (
                        <TxHashText>
                            Tx Hash:{" "}
                            {(() => {
                                const hash = approveTxHash ?? txHashInternal;
                                if (hash) {
                                    // Ensure hash is long enough before slicing
                                    const start = hash.substring(0, 6);
                                    const end =
                                        hash.length > 4
                                            ? hash.substring(hash.length - 4)
                                            : "";
                                    return `${start}...${end}`;
                                }
                                return "Processing..."; // Fallback text if hash somehow becomes null unexpectedly
                            })()}
                        </TxHashText>
                    )}

                    <RemoveButton
                        fullWidth
                        disabled={buttonDisabled}
                        onClick={buttonAction}
                    >
                        {buttonText}
                    </RemoveButton>
                </>
            )}
        </RemoveContainer>
    );
};

export default RemoveLiquidity;
