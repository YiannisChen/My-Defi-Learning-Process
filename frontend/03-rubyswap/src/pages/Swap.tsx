import React, { useState, useCallback, useMemo, useEffect } from "react";
import styled from "styled-components";
import { useWeb3React } from "../hooks/useWeb3";
import { Button } from "../components/Button";
import { Heading, Text, ErrorText } from "../components/Typography";
import { useWalletModal } from "../context/WalletModalContext";
import { useSettingsModal } from "../context/SettingsModalContext";
import TokenSelectModal from "../components/TokenSelectModal";
import {
    TokenInfo,
    NATIVE_ETH,
    NATIVE_SEPOLIA_ETH,
    ERC20_ABI,
    SEPOLIA_CHAIN_ID,
} from "../constants/tokens";
import {
    ROUTER_ADDRESS,
    WETH_ADDRESS,
    ROUTER_ABI,
} from "../constants/contracts";
import { useTokenBalance } from "../hooks/useTokenBalance";
import { useAllowance } from "../hooks/useAllowance";
import { useApprove, ApprovalState } from "../hooks/useApprove";
import { ArrowDown as ArrowDownFeather } from "react-feather";
import { ethers, BigNumber } from "ethers";
import Decimal from "decimal.js";
import { useTransactionContext } from "../context/TransactionContext";
import { debounce } from "../utils/debounce";
import { getRouterContract } from "../utils/contract";
import { usePairReserves } from "../hooks/usePairReserves";

enum Field {
    INPUT = "INPUT",
    OUTPUT = "OUTPUT",
}

// Define palette (or import from theme/constants)
const colors = {
    primary: "#a13c3c",
    primaryHover: "#8a3333",
    secondary: "#fdfcfb",
    accent: "#76c7c0",
    textPrimary: "#2d2d2d",
    textSecondary: "#565a69",
    background: "#faf8f7",
    border: "#edeef2",
    error: "#e84142",
};

const SwapContainer = styled.div`
    width: 100%;
    display: flex;
    flex-direction: column;
    padding: 1.5rem;
    box-sizing: border-box;
`;

const SwapHeader = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
    width: 100%;
`;

const CurrencyInputContainer = styled.div`
    background-color: ${colors.background};
    border-radius: 20px;
    padding: 1rem;
    margin-bottom: 0.25rem;
    border: 1px solid ${colors.border};
    transition: border-color 0.2s ease;

    &:focus-within {
        border-color: ${colors.primary}80;
    }
`;

const CurrencyInputRow = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
`;

const CurrencyInputTopLabel = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.5rem;
    font-size: 14px;
    color: ${colors.textSecondary};
`;

const AmountInput = styled.input`
    flex-grow: 1;
    background: none;
    border: none;
    outline: none;
    font-size: 24px;
    font-weight: 500;
    color: ${colors.textPrimary};
    text-align: left;
    min-width: 0;
    margin-right: 1rem;

    &::placeholder {
        color: #c3c5cb;
    }
`;

const TokenSelectorButton = styled.button`
    display: flex;
    align-items: center;
    padding: 6px 8px 6px 6px;
    background-color: ${colors.border};
    border: none;
    border-radius: 16px;
    cursor: pointer;
    font-weight: 500;
    font-size: 16px;
    color: ${colors.textPrimary};
    transition: background-color 0.2s ease;

    &:hover {
        background-color: #e0e2e6;
    }

    img {
        width: 24px;
        height: 24px;
        border-radius: 50%;
        margin-right: 8px;
    }

    svg {
        margin-left: 4px;
        width: 16px;
        height: 16px;
        stroke: ${colors.accent};
    }
`;

const SelectTokenButton = styled(TokenSelectorButton)`
    background-color: ${colors.primary};
    color: white;
    padding: 6px 10px;
    justify-content: space-between;
    width: auto;
    min-width: 150px;

    &:hover {
        background-color: ${colors.primaryHover};
    }

    svg {
        stroke: white;
        margin-left: 8px;
    }
`;

const MaxButton = styled.button`
    background-color: ${colors.primary}1A;
    color: ${colors.primary};
    border: none;
    border-radius: 8px;
    padding: 4px 6px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    margin-right: 8px;
    transition: background-color 0.2s ease;

    &:hover {
        background-color: ${colors.primary}33;
    }
`;

const SwapButton = styled(Button)`
    margin-top: 1.5rem;
    padding: 1rem;
    font-size: 18px;
    border-radius: 20px;
`;

const ArrowDownContainer = styled.div`
    display: flex;
    justify-content: center;
    align-items: center;
    width: 40px;
    height: 40px;
    background-color: ${colors.background};
    border: 4px solid ${colors.secondary};
    border-radius: 12px;
    box-shadow: 0px 1px 4px rgba(0, 0, 0, 0.1);
    cursor: pointer;
    margin: -18px auto -18px auto;
    position: relative;
    z-index: 2;

    &:hover {
        background-color: ${colors.border};
    }
`;

const StyledArrowDown = styled(ArrowDownFeather)`
    width: 16px;
    height: 16px;
    color: ${colors.textSecondary};
`;

const SwapInfo = styled.div`
    margin-top: 1rem;
    padding: 1.25rem;
    background-color: ${colors.background};
    border-radius: 16px;
    font-size: 14px;
    width: 100%;
    box-sizing: border-box;
    border: 1px solid ${colors.border};
`;

const Row = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.5rem 0;
    color: ${colors.textSecondary};

    &:not(:last-child) {
        border-bottom: 1px solid ${colors.border};
    }
`;

const RowLabel = styled.span`
    display: flex;
    align-items: center;
    gap: 4px;
`;

const RowValue = styled.span`
    color: ${colors.textPrimary};
    font-weight: 500;
`;

const PriceImpactText = styled.span<{ impact: number }>`
    color: ${({ impact }) => {
        if (impact <= 1) return "#1ac186"; // Green for low impact
        if (impact <= 3) return "#ff8f00"; // Orange for medium impact
        return "#e84142"; // Red for high impact
    }};
    font-weight: 500;
`;

const InfoIcon = styled.span`
    cursor: help;
    color: ${colors.textSecondary};
    font-size: 12px;
`;

const ErrorTextStyled = styled(ErrorText)`
    margin-top: 1rem;
    text-align: center;
    color: ${colors.error};
`;

const TxHashText = styled(Text)`
    font-size: 12px;
    color: ${colors.textSecondary};
    text-align: center;
    margin-top: 0.5rem;
    word-break: break-all;
`;

const Swap: React.FC = () => {
    const { account, chainId, provider, isActive } = useWeb3React();
    const { openWalletModal } = useWalletModal();
    const { openSettingsModal } = useSettingsModal();
    const { setLatestTxHash } = useTransactionContext();

    const [inputAmount, setInputAmount] = useState("");
    const [outputAmount, setOutputAmount] = useState("");
    const [isQuoteLoading, setIsQuoteLoading] = useState(false);
    const defaultInputToken = useMemo(
        () =>
            chainId === 1
                ? NATIVE_ETH
                : chainId === SEPOLIA_CHAIN_ID
                  ? NATIVE_SEPOLIA_ETH
                  : undefined,
        [chainId],
    );
    const [inputToken, setInputToken] = useState<TokenInfo | undefined>(
        defaultInputToken,
    );
    const [outputToken, setOutputToken] = useState<TokenInfo | undefined>(
        undefined,
    );
    const { balance: inputBalance } = useTokenBalance(inputToken);
    const { balance: outputBalance } = useTokenBalance(outputToken);
    const {
        approvalState,
        approve,
        error: approveError,
        txHash: approveTxHash,
    } = useApprove(inputToken, inputAmount);
    const [txState, setTxState] = useState<
        "idle" | "pending" | "success" | "fail"
    >("idle");
    const [txHashInternal, setTxHashInternal] = useState<string | null>(null);
    const [generalError, setGeneralError] = useState<string | null>(null);
    const [isTokenModalOpen, setIsTokenModalOpen] = useState(false);
    const [activeField, setActiveField] = useState<Field>(Field.INPUT);

    const routerAddress = chainId ? ROUTER_ADDRESS[chainId] : undefined;
    const wethAddress = chainId ? WETH_ADDRESS[chainId] : undefined;
    const isInputNative = useMemo(
        () =>
            inputToken?.address === NATIVE_ETH.address ||
            inputToken?.address === NATIVE_SEPOLIA_ETH.address,
        [inputToken],
    );
    const isOutputNative = useMemo(
        () =>
            outputToken?.address === NATIVE_ETH.address ||
            outputToken?.address === NATIVE_SEPOLIA_ETH.address,
        [outputToken],
    );

    const { reserves } = usePairReserves(inputToken, outputToken);

    const fetchQuote = useCallback(
        async (amountIn: string) => {
            if (
                !inputToken ||
                !outputToken ||
                !provider ||
                !routerAddress ||
                !wethAddress ||
                parseFloat(amountIn) <= 0
            ) {
                setOutputAmount("");
                return;
            }
            console.log("Fetching quote for", amountIn, inputToken.symbol);
            setIsQuoteLoading(true);
            setOutputAmount("...");
            setGeneralError(null);

            try {
                const routerContract = getRouterContract(provider, chainId);
                const amountInParsed = ethers.utils.parseUnits(
                    amountIn,
                    inputToken.decimals,
                );
                const path = [
                    isInputNative ? wethAddress : inputToken.address,
                    isOutputNative ? wethAddress : outputToken.address,
                ];

                const amountsOut = await routerContract.getAmountsOut(
                    amountInParsed,
                    path,
                );
                console.log(
                    "Raw amountsOut:",
                    amountsOut.map((a: ethers.BigNumber) => a.toString()),
                );

                const amountOutParsed = amountsOut[amountsOut.length - 1];
                const formattedOutput = ethers.utils.formatUnits(
                    amountOutParsed,
                    outputToken.decimals,
                );
                console.log("Formatted output:", formattedOutput);

                setOutputAmount(
                    new Decimal(formattedOutput)
                        .toSignificantDigits(6)
                        .toString(),
                );
            } catch (err: any) {
                console.error("Failed to fetch quote:", err);
                setOutputAmount("");
                setGeneralError("Could not fetch price quote.");
            } finally {
                setIsQuoteLoading(false);
            }
        },
        [
            inputToken,
            outputToken,
            provider,
            chainId,
            routerAddress,
            wethAddress,
            isInputNative,
            isOutputNative,
        ],
    );

    const debouncedFetchQuote = useMemo(
        () => debounce(fetchQuote, 300),
        [fetchQuote],
    );

    useEffect(() => {
        setTxState("idle");
        setTxHashInternal(null);
        setGeneralError(null);
        setOutputAmount("");
        if (inputAmount && parseFloat(inputAmount) > 0) {
            debouncedFetchQuote(inputAmount);
        }
    }, [inputAmount, debouncedFetchQuote]);

    useEffect(() => {
        const defaultT =
            chainId === 1
                ? NATIVE_ETH
                : chainId === SEPOLIA_CHAIN_ID
                  ? NATIVE_SEPOLIA_ETH
                  : undefined;
        if (!inputToken || inputToken.chainId !== chainId) {
            setInputToken(defaultT);
            if (
                outputToken &&
                (outputToken.chainId !== chainId ||
                    inputToken?.address === outputToken.address)
            ) {
                setOutputToken(undefined);
            }
        }
    }, [chainId, inputToken, outputToken]);

    const openTokenModal = (field: Field) => {
        setActiveField(field);
        setIsTokenModalOpen(true);
    };

    const handleTokenSelect = useCallback(
        (selectedToken: TokenInfo) => {
            if (activeField === Field.INPUT) {
                if (selectedToken.address === outputToken?.address)
                    setOutputToken(inputToken);
                setInputToken(selectedToken);
            } else {
                if (selectedToken.address === inputToken?.address)
                    setInputToken(outputToken);
                setOutputToken(selectedToken);
            }
            setIsTokenModalOpen(false);
        },
        [activeField, inputToken, outputToken],
    );

    const handleSwitchTokens = useCallback(() => {
        setInputToken(outputToken);
        setOutputToken(inputToken);
        setInputAmount(outputAmount);
        setOutputAmount(inputAmount);
    }, [inputAmount, inputToken, outputAmount, outputToken]);

    const handleMaxInput = useCallback(() => {
        if (inputBalance && inputBalance !== "--" && inputToken) {
            let maxAmount = inputBalance;
            if (isInputNative) {
                const gasReserve = 0.01;
                const balanceFloat = parseFloat(maxAmount);
                maxAmount =
                    balanceFloat - gasReserve > 0
                        ? (balanceFloat - gasReserve).toFixed(
                              inputToken.decimals,
                          )
                        : "0";
            }
            setInputAmount(maxAmount);
            setGeneralError(null);
        } else {
            setGeneralError("Balance not available");
        }
    }, [inputBalance, inputToken, isInputNative]);

    const handleSwap = useCallback(async () => {
        if (
            !inputToken ||
            !outputToken ||
            !inputAmount ||
            !outputAmount ||
            !account ||
            !provider ||
            !routerAddress ||
            !wethAddress
        )
            return;
        if (parseFloat(inputAmount) <= 0 || parseFloat(outputAmount) <= 0) {
            setGeneralError("Amounts must be > 0");
            return;
        }

        setTxState("pending");
        setTxHashInternal(null);
        setLatestTxHash(null);
        setGeneralError(null);

        try {
            const signer = provider.getSigner();
            const routerContract = getRouterContract(
                provider,
                chainId,
                account,
            );
            const deadline = Math.floor(Date.now() / 1000) + 60 * 20;
            const amountInParsed = ethers.utils.parseUnits(
                inputAmount,
                inputToken.decimals,
            );

            let amountOutMin = ethers.BigNumber.from(0);
            try {
                const outputAmountParsed = ethers.utils.parseUnits(
                    outputAmount,
                    outputToken.decimals,
                );
                const slippageTolerance = 5;
                amountOutMin = outputAmountParsed.sub(
                    outputAmountParsed.mul(slippageTolerance).div(1000),
                );
                console.log(
                    `Calculated amountOutMin (${slippageTolerance / 10}% slippage): ${amountOutMin.toString()}`,
                );
            } catch (e) {
                console.error(
                    "Could not parse output amount for slippage calc:",
                    e,
                );
                setGeneralError(
                    "Invalid output amount for slippage calculation.",
                );
                setTxState("fail");
                return;
            }

            let tx;
            const path = [
                isInputNative ? wethAddress : inputToken.address,
                isOutputNative ? wethAddress : outputToken.address,
            ];
            console.log("Swap Path:", path);

            if (isInputNative) {
                tx = await routerContract.swapExactETHForTokens(
                    amountOutMin,
                    path,
                    account,
                    deadline,
                    { value: amountInParsed },
                );
            } else if (isOutputNative) {
                tx = await routerContract.swapExactTokensForETH(
                    amountInParsed,
                    amountOutMin,
                    path,
                    account,
                    deadline,
                );
            } else {
                tx = await routerContract.swapExactTokensForTokens(
                    amountInParsed,
                    amountOutMin,
                    path,
                    account,
                    deadline,
                );
            }

            setTxHashInternal(tx.hash);
            setLatestTxHash(tx.hash);
            await tx.wait(1);
            setTxState("success");
            setInputAmount("");
            setOutputAmount("");
            setGeneralError(null);
        } catch (err: any) {
            console.error("Swap failed:", err);
            setGeneralError(
                `Transaction failed: ${err.reason || err.message || "Unknown error"}`,
            );
            setTxState("fail");
            setTxHashInternal(null);
            setLatestTxHash(null);
        }
    }, [
        inputToken,
        outputToken,
        inputAmount,
        outputAmount,
        account,
        provider,
        chainId,
        routerAddress,
        wethAddress,
        isInputNative,
        isOutputNative,
        setLatestTxHash,
    ]);

    let buttonAction: () => void | Promise<void> = handleSwap;
    let buttonDisabled =
        !inputAmount ||
        !outputToken ||
        !isActive ||
        txState === "pending" ||
        parseFloat(inputAmount) <= 0 ||
        isQuoteLoading;
    let buttonText = "Swap";
    if (!isActive) {
        buttonAction = openWalletModal;
        buttonText = "Connect Wallet";
        buttonDisabled = false;
    } else if (!outputToken) {
        buttonText = "Select a Token";
        buttonDisabled = true;
    } else if (!inputAmount || parseFloat(inputAmount) <= 0) {
        buttonText = "Enter an amount";
        buttonDisabled = true;
    } else if (isQuoteLoading) {
        buttonText = "Fetching price...";
        buttonDisabled = true;
    } else if (approvalState === ApprovalState.NOT_APPROVED) {
        buttonAction = approve;
        buttonText = `Approve ${inputToken?.symbol}`;
        buttonDisabled = false;
    } else if (approvalState === ApprovalState.PENDING) {
        buttonText = "Approving...";
        buttonDisabled = true;
    } else if (txState === "pending") {
        buttonText = "Swapping...";
        buttonDisabled = true;
    } else if (txState === "success") {
        buttonText = "Success!";
    } else if (txState === "fail") {
        buttonText = "Transaction Failed";
        buttonAction = handleSwap;
        buttonDisabled = false;
    }

    return (
        <SwapContainer>
            <SwapHeader>
                <Heading fontSize="20px">Swap</Heading>
                <Button
                    size="small"
                    variant="tertiary"
                    onClick={openSettingsModal}
                >
                    Settings
                </Button>
            </SwapHeader>

            <CurrencyInputContainer>
                <CurrencyInputTopLabel>
                    <Text>From</Text>
                    <Text>Balance: {inputBalance}</Text>
                </CurrencyInputTopLabel>
                <CurrencyInputRow>
                    <AmountInput
                        placeholder="0.0"
                        type="number"
                        value={inputAmount}
                        onChange={(e) => setInputAmount(e.target.value)}
                    />
                    {isActive &&
                        inputToken &&
                        inputBalance !== "--" &&
                        !isInputNative && (
                            <MaxButton onClick={handleMaxInput}>MAX</MaxButton>
                        )}
                    <TokenSelectorButton
                        onClick={() => openTokenModal(Field.INPUT)}
                    >
                        {inputToken ? (
                            <>
                                <img
                                    src={
                                        inputToken.logoURI ||
                                        "/placeholder-logo.png"
                                    }
                                    alt={`${inputToken.symbol} logo`}
                                />
                                {inputToken.symbol}
                            </>
                        ) : (
                            "Select"
                        )}
                        <ArrowDownFeather
                            size={16}
                            style={{ marginLeft: "4px" }}
                        />
                    </TokenSelectorButton>
                </CurrencyInputRow>
            </CurrencyInputContainer>

            <ArrowDownContainer onClick={handleSwitchTokens}>
                <StyledArrowDown />
            </ArrowDownContainer>

            <CurrencyInputContainer>
                <CurrencyInputTopLabel>
                    <Text>To</Text>
                    <Text>Balance: {outputBalance}</Text>
                </CurrencyInputTopLabel>
                <CurrencyInputRow>
                    <AmountInput
                        placeholder="0.0"
                        type="number"
                        value={isQuoteLoading ? "..." : outputAmount}
                        readOnly
                    />
                    {outputToken ? (
                        <TokenSelectorButton
                            onClick={() => openTokenModal(Field.OUTPUT)}
                        >
                            <img
                                src={
                                    outputToken.logoURI ||
                                    "/placeholder-logo.png"
                                }
                                alt={`${outputToken.symbol} logo`}
                            />
                            {outputToken.symbol}
                            <ArrowDownFeather
                                size={16}
                                style={{ marginLeft: "4px" }}
                            />
                        </TokenSelectorButton>
                    ) : (
                        <SelectTokenButton
                            onClick={() => openTokenModal(Field.OUTPUT)}
                        >
                            Select a token
                            <ArrowDownFeather
                                size={16}
                                style={{ marginLeft: "4px" }}
                            />
                        </SelectTokenButton>
                    )}
                </CurrencyInputRow>
            </CurrencyInputContainer>

            {inputToken &&
                outputToken &&
                inputAmount &&
                outputAmount &&
                !isQuoteLoading && (
                    <SwapInfo>
                        <Row>
                            <RowLabel>
                                Price
                                <InfoIcon title="Current exchange rate between tokens">
                                    ⓘ
                                </InfoIcon>
                            </RowLabel>
                            <RowValue>
                                {(() => {
                                    if (
                                        !inputToken ||
                                        !outputToken ||
                                        !reserves ||
                                        !reserves.reserve0 ||
                                        !reserves.reserve1
                                    ) {
                                        return "-";
                                    }

                                    const isInputToken0 =
                                        inputToken.address.toLowerCase() <
                                        outputToken.address.toLowerCase();

                                    // Get reserves in the correct order
                                    const x = new Decimal(
                                        ethers.utils.formatUnits(
                                            isInputToken0
                                                ? reserves.reserve0
                                                : reserves.reserve1,
                                            isInputToken0
                                                ? inputToken.decimals
                                                : outputToken.decimals,
                                        ),
                                    );
                                    const y = new Decimal(
                                        ethers.utils.formatUnits(
                                            isInputToken0
                                                ? reserves.reserve1
                                                : reserves.reserve0,
                                            isInputToken0
                                                ? outputToken.decimals
                                                : inputToken.decimals,
                                        ),
                                    );

                                    // Calculate price as reserve ratio
                                    const price = y.dividedBy(x);

                                    return `1 ${inputToken.symbol} = ${price.toFixed(4)} ${outputToken.symbol}`;
                                })()}
                            </RowValue>
                        </Row>
                        {(() => {
                            let priceImpact = new Decimal(0);
                            if (
                                reserves &&
                                reserves.reserve0 &&
                                reserves.reserve1
                            ) {
                                try {
                                    // Debug: Log raw reserves and token info
                                    console.log("Raw Pool State:", {
                                        reserve0: reserves.reserve0.toString(),
                                        reserve1: reserves.reserve1.toString(),
                                        inputTokenAddress: inputToken?.address,
                                        outputTokenAddress:
                                            outputToken?.address,
                                        inputDecimals: inputToken?.decimals,
                                        outputDecimals: outputToken?.decimals,
                                        isInputToken0:
                                            inputToken!.address.toLowerCase() <
                                            outputToken!.address.toLowerCase(),
                                    });

                                    // Determine which token is token0 and token1 based on addresses
                                    const isInputToken0 =
                                        inputToken!.address.toLowerCase() <
                                        outputToken!.address.toLowerCase();

                                    // Convert reserves to proper decimal representation using token decimals
                                    const x = new Decimal(
                                        ethers.utils.formatUnits(
                                            isInputToken0
                                                ? reserves.reserve0
                                                : reserves.reserve1,
                                            isInputToken0
                                                ? inputToken!.decimals
                                                : outputToken!.decimals,
                                        ),
                                    );
                                    const y = new Decimal(
                                        ethers.utils.formatUnits(
                                            isInputToken0
                                                ? reserves.reserve1
                                                : reserves.reserve0,
                                            isInputToken0
                                                ? outputToken!.decimals
                                                : inputToken!.decimals,
                                        ),
                                    );

                                    // Validate reserves
                                    if (x.isZero() || y.isZero()) {
                                        console.error(
                                            "Invalid reserves - zero value detected:",
                                            {
                                                x: x.toString(),
                                                y: y.toString(),
                                            },
                                        );
                                        return;
                                    }

                                    const deltaX = new Decimal(inputAmount);
                                    if (
                                        deltaX.isZero() ||
                                        deltaX.isNegative()
                                    ) {
                                        console.error(
                                            "Invalid input amount:",
                                            deltaX.toString(),
                                        );
                                        return;
                                    }

                                    // Calculate constant product k
                                    const k = x.times(y);
                                    console.log(
                                        "Constant product k:",
                                        k.toString(),
                                    );

                                    // Calculate spot price (price before the trade)
                                    const spotPrice = y.dividedBy(x);

                                    // Calculate expected output at current spot price (without price impact)
                                    const expectedOutput =
                                        spotPrice.times(deltaX);

                                    // Apply 0.3% fee to input amount
                                    const FEE_RATE = new Decimal(0.003);
                                    const deltaXWithFee = deltaX.times(
                                        new Decimal(1).minus(FEE_RATE),
                                    );

                                    // Calculate new reserves after trade
                                    const newX = x.plus(deltaXWithFee);
                                    const newY = k.dividedBy(newX);

                                    // Ensure newY is less than current y (output amount should be positive)
                                    if (newY.greaterThanOrEqualTo(y)) {
                                        console.error(
                                            "Invalid state - new Y reserve greater than current Y:",
                                            {
                                                currentY: y.toString(),
                                                newY: newY.toString(),
                                            },
                                        );
                                        return;
                                    }

                                    const actualOutput = y.minus(newY);

                                    // Validate outputs
                                    if (
                                        expectedOutput.isZero() ||
                                        actualOutput.isZero()
                                    ) {
                                        console.error(
                                            "Invalid output amounts:",
                                            {
                                                expected:
                                                    expectedOutput.toString(),
                                                actual: actualOutput.toString(),
                                            },
                                        );
                                        return;
                                    }

                                    // Calculate price impact
                                    priceImpact = expectedOutput
                                        .minus(actualOutput)
                                        .dividedBy(expectedOutput)
                                        .times(100)
                                        .abs();

                                    // Debug log all calculations
                                    console.log(
                                        "Price Impact Calculation Details:",
                                        {
                                            reserves: {
                                                x: x.toString(),
                                                y: y.toString(),
                                                k: k.toString(),
                                            },
                                            trade: {
                                                inputAmount: deltaX.toString(),
                                                inputWithFee:
                                                    deltaXWithFee.toString(),
                                                expectedOutput:
                                                    expectedOutput.toString(),
                                                actualOutput:
                                                    actualOutput.toString(),
                                            },
                                            prices: {
                                                spotPrice: spotPrice.toString(),
                                                effectivePrice: actualOutput
                                                    .dividedBy(deltaX)
                                                    .toString(),
                                            },
                                            impact: {
                                                raw: priceImpact.toString(),
                                                formatted:
                                                    priceImpact.toFixed(4),
                                            },
                                        },
                                    );

                                    // Sanity check the final price impact
                                    if (
                                        priceImpact.isNaN() ||
                                        !priceImpact.isFinite() ||
                                        priceImpact.isNegative()
                                    ) {
                                        console.error(
                                            "Invalid price impact result:",
                                            priceImpact.toString(),
                                        );
                                        priceImpact = new Decimal(0);
                                    }
                                } catch (error) {
                                    console.error(
                                        "Error in price impact calculation:",
                                        error,
                                    );
                                    priceImpact = new Decimal(0);
                                }
                            } else {
                                console.error(
                                    "Missing or invalid reserves:",
                                    reserves,
                                );
                            }

                            return (
                                <Row>
                                    <RowLabel>
                                        Price Impact
                                        <InfoIcon title="Percentage difference between market price and execution price due to trade size">
                                            ⓘ
                                        </InfoIcon>
                                    </RowLabel>
                                    <PriceImpactText
                                        impact={priceImpact.toNumber()}
                                    >
                                        {priceImpact.greaterThan(0.01)
                                            ? priceImpact.toFixed(4)
                                            : "<0.01"}
                                        %
                                    </PriceImpactText>
                                </Row>
                            );
                        })()}
                        <Row>
                            <RowLabel>
                                Minimum Received
                                <InfoIcon title="Minimum amount you will receive after slippage">
                                    ⓘ
                                </InfoIcon>
                            </RowLabel>
                            <RowValue>
                                {(() => {
                                    const slippageTolerance = 0.5; // 0.5%
                                    const minReceived =
                                        Number(outputAmount) *
                                        (1 - slippageTolerance / 100);
                                    return `${minReceived.toFixed(4)} ${outputToken.symbol}`;
                                })()}
                            </RowValue>
                        </Row>
                        <Row>
                            <RowLabel>
                                Network Fee
                                <InfoIcon title="Estimated network fee for this transaction">
                                    ⓘ
                                </InfoIcon>
                            </RowLabel>
                            <RowValue>~0.0005 ETH</RowValue>
                        </Row>
                    </SwapInfo>
                )}

            {(approveError || generalError) && (
                <ErrorTextStyled>
                    {approveError || generalError}
                </ErrorTextStyled>
            )}
            {approveTxHash && (
                <TxHashText>
                    Approve Tx: {approveTxHash.substring(0, 6)}...
                    {approveTxHash.substring(approveTxHash.length - 4)}
                </TxHashText>
            )}
            {txHashInternal && (
                <TxHashText>
                    Swap Tx: {txHashInternal.substring(0, 6)}...
                    {txHashInternal.substring(txHashInternal.length - 4)}
                </TxHashText>
            )}

            <SwapButton
                fullWidth
                disabled={buttonDisabled}
                onClick={buttonAction}
            >
                {buttonText}
            </SwapButton>

            <TokenSelectModal
                isOpen={isTokenModalOpen}
                onClose={() => setIsTokenModalOpen(false)}
                onTokenSelect={handleTokenSelect}
                currentToken={
                    activeField === Field.INPUT ? outputToken : inputToken
                }
            />
        </SwapContainer>
    );
};

export default Swap;
