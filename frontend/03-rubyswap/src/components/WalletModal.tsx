import React, { useEffect, useState, useCallback } from "react";
import styled from "styled-components";
import { useWeb3React } from "../hooks/useWeb3";
import { injected } from "../connectors";
import { Button } from "./Button";
import { Text, ErrorText } from "./Typography";
import { Copy as CopyIcon } from "react-feather";
import { useTransactionContext } from "../context/TransactionContext";

// Define palette locally
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

const ModalOverlay = styled.div`
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-color: rgba(0, 0, 0, 0.5);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1000;
`;

const ModalContent = styled.div`
    background-color: white;
    border-radius: 20px;
    width: 100%;
    max-width: 420px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
    overflow: hidden;
`;

const ModalHeader = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem 1.5rem;
    border-bottom: 1px solid #f0f0f0;
`;

const ModalTitle = styled.h3`
    margin: 0;
    font-size: 18px;
    font-weight: 500;
`;

const CloseButton = styled.button`
    background: none;
    border: none;
    font-size: 18px;
    cursor: pointer;
    color: #888;

    &:hover {
        color: #333;
    }

    &:disabled {
        opacity: 0.7;
        cursor: default;
    }
`;

const ModalBody = styled.div`
    padding: 1.5rem;
    padding-top: 1rem;
`;

const ConnectorList = styled.div`
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
`;

const ConnectorOption = styled.button`
    display: flex;
    align-items: center;
    background-color: #f7f8fa;
    border: 1px solid #e8e9eb;
    border-radius: 12px;
    padding: 1rem;
    cursor: pointer;
    transition: background-color 0.2s;
    width: 100%;
    text-align: left;

    &:hover:not(:disabled) {
        background-color: #eef0f3;
    }

    &:disabled {
        opacity: 0.7;
        cursor: default;
    }
`;

const ConnectorIcon = styled.img`
    width: 32px;
    height: 32px;
    border-radius: 8px;
    margin-right: 12px;
`;

const ConnectorName = styled.div`
    font-size: 16px;
    font-weight: 500;
`;

const AccountSection = styled.div`
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
`;

const AccountHeader = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
`;

const AccountDetailsWrapper = styled.div`
    background-color: #f7f8fa;
    border: 1px solid #edeef2;
    border-radius: 12px;
    padding: 1rem;
`;

const AccountInfoRow = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 1rem;
`;

const AccountIdentifier = styled.div`
    display: flex;
    align-items: center;
    gap: 0.75rem;
`;

const IdenticonPlaceholder = styled.div`
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: linear-gradient(45deg, #e84142, #e4275f);
`;

const AccountAddress = styled.div`
    font-size: 18px;
    font-weight: 500;
`;

const AccountActions = styled.div`
    display: flex;
    align-items: center;
    gap: 1rem;
    color: #565a69;
    font-size: 14px;
`;

const ActionButton = styled.button`
    display: flex;
    align-items: center;
    gap: 0.3rem;
    background: none;
    border: none;
    cursor: pointer;
    color: inherit;
    padding: 0;

    &:hover {
        color: #000;
    }

    img,
    svg {
        width: 16px;
        height: 16px;
    }
`;

const TransactionHistorySection = styled.div`
    margin-top: 1.5rem;
    padding-top: 1rem;
    border-top: 1px solid ${colors.border};
`;

const TransactionRow = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 14px;
    margin-bottom: 0.5rem;
`;

const TransactionLink = styled.a`
    color: ${colors.primary};
    text-decoration: none;
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    &:hover {
        text-decoration: underline;
    }
    img {
        width: 14px;
        height: 14px;
    }
`;

const StatusContainer = styled.div`
    margin-top: 0.5rem;
    text-align: center;
`;

interface WalletModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const WalletModal: React.FC<WalletModalProps> = ({ isOpen, onClose }) => {
    const { account, connector, provider, chainId } = useWeb3React();
    const { latestTxHash } = useTransactionContext();
    const [isConnecting, setIsConnecting] = useState(false);
    const [connectionError, setConnectionError] = useState<string | null>(null);
    const [copySuccess, setCopySuccess] = useState(false);
    const [txState, setTxState] = useState<"pending" | "confirmed" | null>(
        null,
    );

    useEffect(() => {
        if (isOpen) {
            console.log(
                "[WalletModal Effect] Resetting state. Current latestTxHash:",
                latestTxHash,
            );
            setIsConnecting(false);
            setConnectionError(null);
            setCopySuccess(false);
            if (latestTxHash) {
                setTxState("pending");
                // Check if transaction is confirmed
                const checkTxStatus = async () => {
                    if (provider) {
                        try {
                            const receipt =
                                await provider.getTransactionReceipt(
                                    latestTxHash,
                                );
                            if (receipt && receipt.confirmations > 0) {
                                setTxState("confirmed");
                            }
                        } catch (err) {
                            console.error("Error checking tx status:", err);
                        }
                    }
                };
                checkTxStatus();
            }
        }
    }, [isOpen, latestTxHash, provider]);

    const connectMetamask = async () => {
        setIsConnecting(true);
        setConnectionError(null);
        try {
            console.log("Attempting to activate MetaMask...");
            await injected.activate();
            console.log("MetaMask activation successful");
            onClose();
        } catch (error: any) {
            console.error("Failed to connect MetaMask:", error);
            if (error.message.includes("User rejected")) {
                setConnectionError("Connection request rejected.");
            } else if (error.name === "NoMetaMaskError") {
                setConnectionError(
                    "MetaMask not found. Please install MetaMask.",
                );
            } else {
                setConnectionError(
                    `Failed to connect: ${error.message || "Unknown error"}`,
                );
            }
        } finally {
            setIsConnecting(false);
        }
    };

    const disconnectWallet = async () => {
        try {
            if (connector?.deactivate) {
                console.log("Attempting to deactivate connector...");
                await connector.deactivate();
                console.log("Connector deactivated.");
            } else if (connector?.resetState) {
                console.log("Attempting to reset connector state...");
                await connector.resetState();
                console.log("Connector state reset.");
            } else {
                console.warn(
                    "Connector doesn't support deactivate or resetState",
                );
            }
        } catch (error) {
            console.error("Failed to disconnect:", error);
            setConnectionError("Failed to disconnect.");
        }
    };

    const copyAddress = useCallback(async () => {
        if (account && navigator.clipboard?.writeText) {
            try {
                await navigator.clipboard.writeText(account);
                setCopySuccess(true);
                setTimeout(() => setCopySuccess(false), 2000);
            } catch (err) {
                console.error("Failed to copy:", err);
                setCopySuccess(false);
            }
        }
    }, [account]);

    if (!isOpen) return null;

    const explorerUrl = getExplorerUrl(chainId, account ?? "");
    const txExplorerUrl = getTxExplorerUrl(chainId, latestTxHash ?? "");

    console.log(
        "[WalletModal] Rendering. latestTxHash from context:",
        latestTxHash,
    );

    return (
        <ModalOverlay onClick={onClose}>
            <ModalContent onClick={(e) => e.stopPropagation()}>
                <ModalHeader>
                    <ModalTitle>
                        {account ? "Account" : "Connect a Wallet"}
                    </ModalTitle>
                    <CloseButton onClick={onClose} disabled={isConnecting}>
                        ✕
                    </CloseButton>
                </ModalHeader>
                <ModalBody>
                    {connectionError && (
                        <ErrorText
                            style={{
                                textAlign: "center",
                                marginBottom: "1rem",
                            }}
                        >
                            {connectionError}
                        </ErrorText>
                    )}
                    {account ? (
                        <AccountSection>
                            <AccountDetailsWrapper>
                                <AccountInfoRow>
                                    <AccountIdentifier>
                                        <IdenticonPlaceholder />
                                        <AccountAddress>
                                            {`${account.substring(0, 6)}...${account.substring(account.length - 4)}`}
                                        </AccountAddress>
                                    </AccountIdentifier>
                                    <Button
                                        size="small"
                                        variant="secondary"
                                        onClick={disconnectWallet}
                                    >
                                        Disconnect
                                    </Button>
                                </AccountInfoRow>
                                <AccountActions>
                                    <ActionButton
                                        onClick={copyAddress}
                                        disabled={copySuccess}
                                    >
                                        <CopyIcon size={16} />
                                        {copySuccess
                                            ? "Copied!"
                                            : "Copy Address"}
                                    </ActionButton>
                                    {explorerUrl && (
                                        <ActionButton
                                            as="a"
                                            href={explorerUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                        >
                                            <img
                                                src="/images/external-link.svg"
                                                alt="View on explorer"
                                            />
                                            View on Explorer
                                        </ActionButton>
                                    )}
                                </AccountActions>
                            </AccountDetailsWrapper>
                            <TransactionHistorySection>
                                <Text fontWeight="600" margin="0 0 0.5rem 0">
                                    Recent Transaction
                                </Text>
                                {latestTxHash && txExplorerUrl ? (
                                    <TransactionRow>
                                        <TransactionLink
                                            href={txExplorerUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                        >
                                            {`${latestTxHash.substring(0, 6)}...${latestTxHash.substring(latestTxHash.length - 4)}`}
                                            <img
                                                src="/images/external-link.svg"
                                                alt="View on explorer"
                                            />
                                        </TransactionLink>
                                        <Text
                                            fontSize="12px"
                                            color={colors.textSecondary}
                                        >
                                            {txState === "pending"
                                                ? "Pending..."
                                                : "Confirmed"}
                                        </Text>
                                    </TransactionRow>
                                ) : (
                                    <Text
                                        fontSize="14px"
                                        color={colors.textSecondary}
                                    >
                                        Your transactions will appear here...
                                    </Text>
                                )}
                            </TransactionHistorySection>
                        </AccountSection>
                    ) : (
                        <ConnectorList>
                            <ConnectorOption
                                onClick={connectMetamask}
                                disabled={isConnecting}
                            >
                                <ConnectorIcon
                                    src="/images/metamask.png"
                                    alt="MetaMask"
                                />
                                <ConnectorName>MetaMask</ConnectorName>
                            </ConnectorOption>
                            <StatusContainer>
                                {isConnecting && (
                                    <Text color="#888">Connecting...</Text>
                                )}
                            </StatusContainer>
                        </ConnectorList>
                    )}
                </ModalBody>
            </ModalContent>
        </ModalOverlay>
    );
};

function getNetworkName(chainId: number | undefined): string {
    switch (chainId) {
        case 1:
            return "Ethereum Mainnet";
        case 11155111:
            return "Sepolia Testnet";
        default:
            return "Unknown Network";
    }
}

function getExplorerUrl(
    chainId: number | undefined,
    address: string,
): string | null {
    if (!chainId || !address) return null;
    switch (chainId) {
        case 1:
            return `https://etherscan.io/address/${address}`;
        case 11155111:
            return `https://sepolia.etherscan.io/address/${address}`;
        default:
            return null;
    }
}

function getTxExplorerUrl(
    chainId: number | undefined,
    txHash: string,
): string | null {
    if (!chainId || !txHash) return null;
    switch (chainId) {
        case 1:
            return `https://etherscan.io/tx/${txHash}`;
        case 11155111:
            return `https://sepolia.etherscan.io/tx/${txHash}`;
        default:
            return null;
    }
}

export default WalletModal;
