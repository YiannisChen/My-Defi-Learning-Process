import React, { useState, useMemo, useEffect } from "react";
import styled from "styled-components";
import { TokenInfo, getTokenListByChainId } from "../constants/tokens";
import { useWeb3React } from "../hooks/useWeb3";

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
    height: 70vh;
    display: flex;
    flex-direction: column;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
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
`;

const SearchInputContainer = styled.div`
    padding: 1rem 1.5rem;
    border-bottom: 1px solid #f0f0f0;
`;

const SearchInput = styled.input`
    width: 100%;
    padding: 0.75rem 1rem;
    border-radius: 12px;
    border: 1px solid #e2e2e2;
    font-size: 16px;
    box-sizing: border-box;

    &:focus {
        outline: none;
        border-color: #e84142;
    }
`;

const TokenList = styled.div`
    flex: 1;
    overflow-y: auto;
    padding: 0.5rem 0;
`;

const TokenListItem = styled.button`
    display: flex;
    align-items: center;
    width: 100%;
    padding: 0.75rem 1.5rem;
    background: none;
    border: none;
    text-align: left;
    cursor: pointer;

    &:hover {
        background-color: #f7f8fa;
    }

    &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }
`;

const TokenLogo = styled.img`
    width: 24px;
    height: 24px;
    border-radius: 50%;
    margin-right: 12px;
`;

const TokenInfoContainer = styled.div`
    display: flex;
    flex-direction: column;
`;

const TokenSymbol = styled.div`
    font-size: 16px;
    font-weight: 500;
`;

const TokenName = styled.div`
    font-size: 12px;
    color: #888;
`;

const NoResults = styled.div`
    padding: 1.5rem;
    text-align: center;
    color: #888;
`;

interface TokenSelectModalProps {
    isOpen: boolean;
    onClose: () => void;
    onTokenSelect: (token: TokenInfo) => void;
    currentToken?: TokenInfo;
}

const TokenSelectModal: React.FC<TokenSelectModalProps> = ({
    isOpen,
    onClose,
    onTokenSelect,
    currentToken,
}) => {
    const { chainId } = useWeb3React();
    const [searchTerm, setSearchTerm] = useState("");

    const tokenList = useMemo(() => getTokenListByChainId(chainId), [chainId]);

    const filteredTokens = useMemo(() => {
        if (!searchTerm) return tokenList;
        const lowerCaseSearch = searchTerm.toLowerCase();
        return tokenList.filter(
            (token) =>
                token.symbol.toLowerCase().includes(lowerCaseSearch) ||
                token.name.toLowerCase().includes(lowerCaseSearch) ||
                token.address.toLowerCase() === lowerCaseSearch,
        );
    }, [searchTerm, tokenList]);

    const handleSelect = (token: TokenInfo) => {
        onTokenSelect(token);
        onClose();
    };

    useEffect(() => {
        // Reset search term when modal opens
        if (isOpen) {
            setSearchTerm("");
        }
    }, [isOpen]);

    if (!isOpen) return null;

    return (
        <ModalOverlay onClick={onClose}>
            <ModalContent onClick={(e) => e.stopPropagation()}>
                <ModalHeader>
                    <ModalTitle>Select a Token</ModalTitle>
                    <CloseButton onClick={onClose}>✕</CloseButton>
                </ModalHeader>
                <SearchInputContainer>
                    <SearchInput
                        placeholder="Search name or paste address"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </SearchInputContainer>
                <TokenList>
                    {filteredTokens.length > 0 ? (
                        filteredTokens.map((token) => (
                            <TokenListItem
                                key={token.address}
                                onClick={() => handleSelect(token)}
                                disabled={
                                    currentToken?.address === token.address
                                }
                            >
                                <TokenLogo
                                    src={
                                        token.logoURI || "/placeholder-logo.png"
                                    } // Provide a placeholder
                                    alt={`${token.symbol} logo`}
                                    onError={(e) => {
                                        (e.target as HTMLImageElement).src =
                                            "/placeholder-logo.png"; // Fallback placeholder
                                    }}
                                />
                                <TokenInfoContainer>
                                    <TokenSymbol>{token.symbol}</TokenSymbol>
                                    <TokenName>{token.name}</TokenName>
                                </TokenInfoContainer>
                            </TokenListItem>
                        ))
                    ) : (
                        <NoResults>No tokens found.</NoResults>
                    )}
                </TokenList>
            </ModalContent>
        </ModalOverlay>
    );
};

export default TokenSelectModal;
