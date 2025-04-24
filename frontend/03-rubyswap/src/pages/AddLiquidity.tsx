import React, { useState, useCallback, useMemo, useEffect } from "react";
import styled from "styled-components";
import { useParams, Link, useNavigate } from "react-router-dom";
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
    SEPOLIA_CHAIN_ID,
    ERC20_ABI,
} from "../constants/tokens";
import {
    ROUTER_ADDRESS,
    WETH_ADDRESS,
    ROUTER_ABI,
    FACTORY_ADDRESS,
    PAIR_ABI,
} from "../constants/contracts";
import { useTokenBalance } from "../hooks/useTokenBalance";
import { useAllowance } from "../hooks/useAllowance";
import { useApprove, ApprovalState } from "../hooks/useApprove";
import { usePairReserves } from "../hooks/usePairReserves";
import {
    Plus as PlusIcon,
    ArrowDown as ArrowDownFeather,
    ArrowLeft,
} from "react-feather";
import Decimal from "decimal.js";
import { ethers, BigNumber } from "ethers";
import { useTransactionContext } from "../context/TransactionContext";
import { getRouterContract } from "../utils/contract";

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

enum Field {
    TOKEN0 = "TOKEN0",
    TOKEN1 = "TOKEN1",
}

const AddContainer = styled.div`
    width: 100%;
    display: flex;
    flex-direction: column;
    padding: 1.5rem;
    box-sizing: border-box;
`;

const AddHeader = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1.5rem;
    width: 100%;
`;

// Re-using styles from Swap page where applicable
const CurrencyInputContainer = styled.div`
    background-color: ${colors.background};
    border-radius: 20px;
    padding: 1rem;
    margin-bottom: 0.5rem;
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

const AddLiquidityButton = styled(Button)`
    margin-top: 1.5rem;
    padding: 1rem;
    font-size: 18px;
    border-radius: 20px;
`;

const ConnectWalletOverlay = styled.div`
    margin-top: 2rem;
    text-align: center;
`;

const PlusContainer = styled.div`
    display: flex;
    justify-content: center;
    align-items: center;
    height: 20px; // Height for the plus icon spacing
    margin: 0.5rem 0;
`;

const StyledPlusIcon = styled(PlusIcon)`
    color: ${colors.textSecondary};
    width: 20px;
    height: 20px;
`;

const PriceInfoContainer = styled.div`
    margin-top: 1.5rem;
    padding: 1rem;
    background-color: ${colors.background};
    border-radius: 12px;
    font-size: 14px;
    width: 100%;
    box-sizing: border-box;
`;

const RowBetween = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
    color: ${colors.textSecondary};
    margin-bottom: 0.5rem;
    &:last-child {
        margin-bottom: 0;
    }
`;

const ErrorTextStyled = styled(ErrorText)`
    margin-top: 1rem;
    text-align: center;
    color: ${colors.error};
`;

const TxHashText = styled(Text)`
    color: ${colors.textSecondary};
`;

// Style for the Back link
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

// Function to safely format price using InstanceType<typeof Decimal>
const formatPrice = (
    price: InstanceType<typeof Decimal> | null | undefined,
    decimals = 6,
): string => {
    if (!price || price.isNaN() || !price.isFinite()) {
        return "--";
    }
    return price.toSignificantDigits(decimals).toString();
};

const AddLiquidity: React.FC = () => {
    const { isActive, account, chainId, provider } = useWeb3React();
    const { openWalletModal } = useWalletModal();
    const { openSettingsModal } = useSettingsModal();
    const { setLatestTxHash } = useTransactionContext();
    const navigate = useNavigate();

    // Input States
    const [token0Amount, setToken0Amount] = useState("");
    const [token1Amount, setToken1Amount] = useState("");

    // Token Selection State
    const defaultToken0 = useMemo(
        () =>
            chainId === 1
                ? NATIVE_ETH
                : chainId === SEPOLIA_CHAIN_ID
                  ? NATIVE_SEPOLIA_ETH
                  : undefined,
        [chainId],
    );
    const [token0, setToken0] = useState<TokenInfo | undefined>(defaultToken0);
    const [token1, setToken1] = useState<TokenInfo | undefined>(undefined);

    // Declare activeField and modal state HERE
    const [activeField, setActiveField] = useState<Field>(Field.TOKEN0);
    const [isTokenModalOpen, setIsTokenModalOpen] = useState(false);

    // ** Call usePairReserves HERE, after tokens are defined **
    const { reserves, isLoading: isLoadingReserves } = usePairReserves(
        token0,
        token1,
    );

    // Balance States
    const { balance: token0Balance, isLoading: isLoadingToken0Balance } =
        useTokenBalance(token0);
    const { balance: token1Balance, isLoading: isLoadingToken1Balance } =
        useTokenBalance(token1);

    // Price state
    const [price0, setPrice0] = useState<InstanceType<typeof Decimal> | null>(
        null,
    );
    const [price1, setPrice1] = useState<InstanceType<typeof Decimal> | null>(
        null,
    );

    // Approval States
    const {
        approvalState: approval0State,
        approve: approve0,
        error: error0Approve,
    } = useApprove(token0, token0Amount);
    const {
        approvalState: approval1State,
        approve: approve1,
        error: error1Approve,
    } = useApprove(token1, token1Amount);

    // Transaction State
    const [txState, setTxState] = useState<
        "idle" | "pending" | "success" | "fail"
    >("idle");
    const [txHashInternal, setTxHashInternal] = useState<string | null>(null);
    const [generalError, setGeneralError] = useState<string | null>(null);

    // Derived States
    const routerAddress = chainId ? ROUTER_ADDRESS[chainId] : undefined;
    const isETHSelected =
        token0?.address === NATIVE_SEPOLIA_ETH.address ||
        token1?.address === NATIVE_SEPOLIA_ETH.address;
    const pairExists = useMemo(() => reserves !== null, [reserves]);

    // Reset tx state on input change
    useEffect(() => {
        setTxState("idle");
        setTxHashInternal(null);
        setGeneralError(null);
    }, [token0Amount, token1Amount, token0, token1]);

    // Calculate prices when amounts change
    useEffect(() => {
        if (
            reserves &&
            new Decimal(reserves.reserve0).gt(0) &&
            new Decimal(reserves.reserve1).gt(0)
        ) {
            const res0 = new Decimal(reserves.reserve0);
            const res1 = new Decimal(reserves.reserve1);
            setPrice0(res1.div(res0)); // price of token0 = reserve1 / reserve0
            setPrice1(res0.div(res1)); // price of token1 = reserve0 / reserve1
        } else {
            setPrice0(null);
            setPrice1(null);
        }
    }, [reserves]);

    // Auto-fill second amount based on first input and reserves (if pair exists)
    useEffect(() => {
        if (
            pairExists &&
            price0 &&
            token0Amount &&
            parseFloat(token0Amount) > 0 &&
            activeField === Field.TOKEN0
        ) {
            try {
                const amount0Decimal = new Decimal(token0Amount);
                const amount1Decimal = amount0Decimal.times(price0); // amount1 = amount0 * (reserve1 / reserve0)
                setToken1Amount(
                    amount1Decimal.toSignificantDigits(6).toString(),
                );
            } catch {
                setToken1Amount("");
            }
        } else if (!pairExists && activeField === Field.TOKEN0) {
            // Allow independent entry if pair doesn't exist
        }
    }, [token0Amount, price0, pairExists, activeField]);

    useEffect(() => {
        if (
            pairExists &&
            price1 &&
            token1Amount &&
            parseFloat(token1Amount) > 0 &&
            activeField === Field.TOKEN1
        ) {
            try {
                const amount1Decimal = new Decimal(token1Amount);
                const amount0Decimal = amount1Decimal.times(price1); // amount0 = amount1 * (reserve0 / reserve1)
                setToken0Amount(
                    amount0Decimal.toSignificantDigits(6).toString(),
                );
            } catch {
                setToken0Amount("");
            }
        } else if (!pairExists && activeField === Field.TOKEN1) {
            // Allow independent entry if pair doesn't exist
        }
    }, [token1Amount, price1, pairExists, activeField]);

    // Update default token0 if chain changes
    React.useEffect(() => {
        const defaultT0 =
            chainId === 1
                ? NATIVE_ETH
                : chainId === SEPOLIA_CHAIN_ID
                  ? NATIVE_SEPOLIA_ETH
                  : undefined;
        if (!token0 || token0.chainId !== chainId) {
            setToken0(defaultT0);
            if (token1?.address === defaultT0?.address) {
                setToken1(undefined);
            }
        }
    }, [chainId, token0, token1]);

    // Modal open function
    const openTokenModal = (field: Field) => {
        setActiveField(field);
        setIsTokenModalOpen(true);
    };

    // Token select handler - *Now* activeField is declared above
    const handleTokenSelect = useCallback(
        (selectedToken: TokenInfo) => {
            if (activeField === Field.TOKEN0) {
                if (selectedToken.address === token1?.address) {
                    setToken1(token0);
                }
                setToken0(selectedToken);
            } else {
                // Field.TOKEN1
                if (selectedToken.address === token0?.address) {
                    setToken0(token1);
                }
                setToken1(selectedToken);
            }
            setIsTokenModalOpen(false);
        },
        [activeField, token0, token1],
    );

    const handleAddLiquidity = useCallback(async () => {
        if (
            !token0 ||
            !token1 ||
            !token0Amount ||
            !token1Amount ||
            !account ||
            !provider ||
            !routerAddress
        )
            return;

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
            const deadline = Math.floor(Date.now() / 1000) + 60 * 20; // 20 minutes from now

            const amount0Parsed = ethers.utils.parseUnits(
                token0Amount,
                token0.decimals,
            );
            const amount1Parsed = ethers.utils.parseUnits(
                token1Amount,
                token1.decimals,
            );

            // For new pairs, set minimum amounts to 0
            // For existing pairs, use slippage tolerance
            const isNewPair = !pairExists;
            const slippageTolerance = 10; // 1% slippage (10/1000)

            let amount0Min, amount1Min;
            if (isNewPair) {
                // For new pairs, set minimum amounts to 0 to allow first liquidity provision
                amount0Min = ethers.BigNumber.from(0);
                amount1Min = ethers.BigNumber.from(0);
            } else {
                // For existing pairs, apply slippage tolerance
                amount0Min = amount0Parsed.sub(
                    amount0Parsed.mul(slippageTolerance).div(1000),
                );
                amount1Min = amount1Parsed.sub(
                    amount1Parsed.mul(slippageTolerance).div(1000),
                );
            }

            console.log(
                `Calculated Min Amounts: ${amount0Min.toString()}, ${amount1Min.toString()}`,
            );

            let tx;
            if (isETHSelected) {
                // Use addLiquidityETH
                const ethToken =
                    token0.address === NATIVE_SEPOLIA_ETH.address
                        ? token0
                        : token1;
                const erc20Token =
                    token0.address === NATIVE_SEPOLIA_ETH.address
                        ? token1
                        : token0;
                const ethAmount =
                    token0.address === NATIVE_SEPOLIA_ETH.address
                        ? amount0Parsed
                        : amount1Parsed;
                const tokenAmount =
                    token0.address === NATIVE_SEPOLIA_ETH.address
                        ? amount1Parsed
                        : amount0Parsed;
                const tokenAmountMin =
                    token0.address === NATIVE_SEPOLIA_ETH.address
                        ? amount1Min
                        : amount0Min;
                const ethAmountMin =
                    token0.address === NATIVE_SEPOLIA_ETH.address
                        ? amount0Min
                        : amount1Min;

                console.log("Calling addLiquidityETH with:", {
                    token: erc20Token.address,
                    amountTokenDesired: tokenAmount.toString(),
                    amountTokenMin: tokenAmountMin.toString(),
                    amountETHMin: ethAmountMin.toString(),
                    to: account,
                    deadline,
                    value: ethAmount.toString(),
                });

                tx = await routerContract.addLiquidityETH(
                    erc20Token.address,
                    tokenAmount,
                    tokenAmountMin,
                    ethAmountMin,
                    account,
                    deadline,
                    { value: ethAmount },
                );
            } else {
                // Use addLiquidity
                console.log("Calling addLiquidity with:", {
                    tokenA: token0.address,
                    tokenB: token1.address,
                    amountADesired: amount0Parsed.toString(),
                    amountBDesired: amount1Parsed.toString(),
                    amountAMin: amount0Min.toString(),
                    amountBMin: amount1Min.toString(),
                    to: account,
                    deadline,
                });
                tx = await routerContract.addLiquidity(
                    token0.address,
                    token1.address,
                    amount0Parsed,
                    amount1Parsed,
                    amount0Min,
                    amount1Min,
                    account,
                    deadline,
                );
            }

            setTxHashInternal(tx.hash);
            console.log("Add Liquidity Tx sent:", tx.hash);
            await tx.wait(1);
            console.log("Add Liquidity Tx confirmed:", tx.hash);
            setLatestTxHash(tx.hash);
            setTxState("success");
            // Optionally clear form or refetch balances/positions
            setToken0Amount("");
            setToken1Amount("");
            console.log(
                "Add Liquidity successful, navigating back to pools in 3s...",
            );
            setTimeout(() => {
                navigate("/pool");
            }, 3000);
        } catch (err: any) {
            console.error("Add Liquidity failed:", err);
            setGeneralError(
                `Transaction failed: ${err.message || "Unknown error"}`,
            );
            setTxState("fail");
            setTxHashInternal(null);
            setLatestTxHash(null);
        }
    }, [
        token0,
        token1,
        token0Amount,
        token1Amount,
        account,
        provider,
        routerAddress,
        chainId,
        setLatestTxHash,
        navigate,
        isETHSelected,
        pairExists,
    ]);

    // Determine button state and text
    let buttonAction: (() => void) | (() => Promise<void>) = handleAddLiquidity;
    let buttonDisabled =
        !token0Amount ||
        !token1Amount ||
        !token0 ||
        !token1 ||
        !isActive ||
        txState === "pending";
    let buttonText = "Add Liquidity";

    if (!isActive) {
        buttonAction = openWalletModal;
        buttonText = "Connect Wallet";
        buttonDisabled = false;
    } else if (!token0 || !token1) {
        buttonText = "Select Tokens";
        buttonDisabled = true;
    } else if (
        !token0Amount ||
        !token1Amount ||
        parseFloat(token0Amount) <= 0 ||
        parseFloat(token1Amount) <= 0
    ) {
        buttonText = "Enter Amounts";
        buttonDisabled = true;
    } else if (
        approval0State === ApprovalState.NOT_APPROVED ||
        approval1State === ApprovalState.NOT_APPROVED
    ) {
        // Prioritize approving Token0 if needed, otherwise Token1
        if (approval0State === ApprovalState.NOT_APPROVED) {
            buttonAction = approve0;
            buttonText = `Approve ${token0.symbol}`;
            buttonDisabled = false;
        } else if (approval1State === ApprovalState.NOT_APPROVED) {
            buttonAction = approve1;
            buttonText = `Approve ${token1.symbol}`;
            buttonDisabled = false;
        }
    } else if (
        approval0State === ApprovalState.PENDING ||
        approval1State === ApprovalState.PENDING
    ) {
        buttonText = "Approving...";
        buttonDisabled = true;
    } else if (txState === "pending") {
        buttonText = "Adding...";
        buttonDisabled = true;
    } else if (txState === "success") {
        buttonText = "Success!";
        // Keep disabled briefly after success?
    } else if (txState === "fail") {
        buttonText = "Transaction Failed";
        // Re-enable button to allow retry?
        buttonDisabled = false; // Or keep disabled? Depends on desired UX
        buttonAction = handleAddLiquidity; // Allow retry
    }
    // Else, default is Add Liquidity

    return (
        <AddContainer>
            <BackLink to="/pool">
                <ArrowLeft size={16} /> Back to Pools
            </BackLink>

            <AddHeader>
                <Heading fontSize="20px">Add Liquidity</Heading>
                <Button size="small" variant="tertiary">
                    {" "}
                    Settings {/* Placeholder */}{" "}
                </Button>
            </AddHeader>

            {!isActive ? (
                <ConnectWalletOverlay>
                    <Text color="#888" style={{ marginBottom: "1rem" }}>
                        Connect your wallet to add liquidity.
                    </Text>
                    <Button onClick={openWalletModal}>Connect Wallet</Button>
                </ConnectWalletOverlay>
            ) : (
                <>
                    {/* Token 0 Input */}
                    <CurrencyInputContainer>
                        <CurrencyInputTopLabel>
                            <Text>Input</Text>
                            <Text>
                                Balance:{" "}
                                {isLoadingToken0Balance ? "..." : token0Balance}
                            </Text>
                        </CurrencyInputTopLabel>
                        <CurrencyInputRow>
                            <AmountInput
                                placeholder="0.0"
                                type="number"
                                value={token0Amount}
                                onChange={(e) => {
                                    setToken0Amount(e.target.value);
                                    setActiveField(Field.TOKEN0);
                                }}
                            />
                            <TokenSelectorButton
                                onClick={() => openTokenModal(Field.TOKEN0)}
                            >
                                {token0 ? (
                                    <>
                                        <img
                                            src={
                                                token0.logoURI ||
                                                "/images/placeholder-logo.png"
                                            }
                                            alt={`${token0.symbol} logo`}
                                        />
                                        {token0.symbol}
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

                    <PlusContainer>
                        <StyledPlusIcon />
                    </PlusContainer>

                    {/* Token 1 Input */}
                    <CurrencyInputContainer>
                        <CurrencyInputTopLabel>
                            <Text>Input</Text>
                            <Text>
                                Balance:{" "}
                                {isLoadingToken1Balance ? "..." : token1Balance}
                            </Text>
                        </CurrencyInputTopLabel>
                        <CurrencyInputRow>
                            <AmountInput
                                placeholder="0.0"
                                type="number"
                                value={token1Amount}
                                onChange={(e) => {
                                    setToken1Amount(e.target.value);
                                    setActiveField(Field.TOKEN1);
                                }}
                                readOnly={
                                    pairExists && activeField === Field.TOKEN0
                                }
                            />
                            {token1 ? (
                                <TokenSelectorButton
                                    onClick={() => openTokenModal(Field.TOKEN1)}
                                >
                                    <img
                                        src={
                                            token1.logoURI ||
                                            "/images/placeholder-logo.png"
                                        }
                                        alt={`${token1.symbol} logo`}
                                    />
                                    {token1.symbol}
                                    <ArrowDownFeather
                                        size={16}
                                        style={{ marginLeft: "4px" }}
                                    />
                                </TokenSelectorButton>
                            ) : (
                                <SelectTokenButton
                                    onClick={() => openTokenModal(Field.TOKEN1)}
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

                    {/* Updated Price Info Section */}
                    {token0 &&
                        token1 &&
                        (pairExists ||
                            (parseFloat(token0Amount) > 0 &&
                                parseFloat(token1Amount) > 0)) && (
                            <PriceInfoContainer>
                                <Text
                                    fontSize="14px"
                                    fontWeight="600"
                                    style={{
                                        marginBottom: "0.75rem",
                                        textAlign: "center",
                                    }}
                                >
                                    {pairExists
                                        ? "Current Pool Prices"
                                        : "Initial prices and pool share"}
                                </Text>
                                <RowBetween>
                                    <Text>{formatPrice(price1)}</Text>
                                    <Text>
                                        {token1.symbol} per {token0.symbol}
                                    </Text>
                                </RowBetween>
                                <RowBetween>
                                    <Text>{formatPrice(price0)}</Text>
                                    <Text>
                                        {token0.symbol} per {token1.symbol}
                                    </Text>
                                </RowBetween>
                                <RowBetween>
                                    <Text>Share of Pool</Text>
                                    <Text>{pairExists ? "~" : "100"}%</Text>
                                </RowBetween>
                            </PriceInfoContainer>
                        )}

                    {/* Error Display Area */}
                    {(error0Approve || error1Approve || generalError) && (
                        <ErrorTextStyled>
                            {error0Approve || error1Approve || generalError}
                        </ErrorTextStyled>
                    )}
                    {txHashInternal && (
                        <TxHashText
                            fontSize="12px"
                            style={{ textAlign: "center", marginTop: "0.5rem" }}
                        >
                            Tx Hash: {txHashInternal.substring(0, 6)}...
                            {txHashInternal.substring(
                                txHashInternal.length - 4,
                            )}
                        </TxHashText>
                    )}

                    {/* Main Action Button */}
                    <AddLiquidityButton
                        fullWidth
                        disabled={buttonDisabled}
                        onClick={buttonAction}
                    >
                        {buttonText}
                    </AddLiquidityButton>
                </>
            )}

            <TokenSelectModal
                isOpen={isTokenModalOpen}
                onClose={() => setIsTokenModalOpen(false)}
                onTokenSelect={handleTokenSelect}
                currentToken={activeField === Field.TOKEN0 ? token1 : token0}
            />
        </AddContainer>
    );
};

export default AddLiquidity;
