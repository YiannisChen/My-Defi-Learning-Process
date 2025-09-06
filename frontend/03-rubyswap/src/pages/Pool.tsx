import React from "react";
import styled from "styled-components";
import { Link, useNavigate } from "react-router-dom";
import { useWeb3React } from "../hooks/useWeb3";
import { Web3Provider } from "@ethersproject/providers";
import { Button } from "../components/Button";
import { LightCard } from "../components/Card";
import { Heading, Text } from "../components/Typography";
import { useWalletModal } from "../context/WalletModalContext";
import {
    useUserLiquidityPositions,
    LiquidityPosition,
} from "../hooks/useUserLiquidityPositions";

const PoolContainer = styled.div`
    width: 100%;
    display: flex;
    flex-direction: column;
    padding: 1.5rem;
`;

const PoolHeader = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1.5rem;
    width: 100%;
`;

const ButtonContainer = styled.div`
    margin-bottom: 2rem;
    width: 100%;
`;

const RowBetween = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.5rem 0;
`;

const StyledLink = styled(Link)`
    text-decoration: none;
    color: #e84142;

    &:hover {
        text-decoration: underline;
    }
`;

const DotsLoader = styled.span`
    &:after {
        content: ".";
        animation: dots 1s steps(5, end) infinite;
    }

    @keyframes dots {
        0%,
        20% {
            color: rgba(0, 0, 0, 0);
            text-shadow:
                0.25em 0 0 rgba(0, 0, 0, 0),
                0.5em 0 0 rgba(0, 0, 0, 0);
        }
        40% {
            color: #333;
            text-shadow:
                0.25em 0 0 rgba(0, 0, 0, 0),
                0.5em 0 0 rgba(0, 0, 0, 0);
        }
        60% {
            text-shadow:
                0.25em 0 0 #333,
                0.5em 0 0 rgba(0, 0, 0, 0);
        }
        80%,
        100% {
            text-shadow:
                0.25em 0 0 #333,
                0.5em 0 0 #333;
        }
    }
`;

const PositionCard = styled.div`
    background: linear-gradient(to right, #f7f8fa, #edeff2);
    border-radius: 20px;
    padding: 1rem 1.5rem;
    margin-bottom: 1rem;
    border: 1px solid #e2e2e2;
`;

const PositionCardHeader = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
`;

const DoubleLogo = styled.div`
    display: inline-flex;
    align-items: center;
    padding-right: 8px;
    margin-right: 8px;
`;

const TokenLogoImg = styled.img`
    width: 24px;
    height: 24px;
    border-radius: 50%;
    border: 2px solid #f0f0f0;
    background-color: #fff;

    &:nth-child(2) {
        margin-left: -8px;
        margin-right: 8px;
        z-index: 1;
    }
    &:first-child {
        z-index: 2;
    }
`;

const PairText = styled(Text)`
    margin-left: calc(24px + 16px + 8px);
`;

const Tooltip = styled.div`
    position: relative;
    cursor: help;

    &:hover .tooltip-content {
        display: block;
    }
`;

const TooltipContent = styled.div`
    display: none;
    position: absolute;
    background: white;
    padding: 1rem;
    border-radius: 12px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    width: 250px;
    right: 0;
    top: 100%;
    margin-top: 0.5rem;
    z-index: 10;
    color: #333;
    font-size: 14px;
    line-height: 1.5;
`;

const Pool: React.FC = () => {
    const { isActive, account } = useWeb3React();
    const { openWalletModal } = useWalletModal();
    const navigate = useNavigate();

    const { positions, isLoading, error } = useUserLiquidityPositions();

    const handleManageClick = (position: LiquidityPosition) => {
        console.log("Managing position:", position);
        navigate(`/remove/${position.pairAddress}`);
    };

    const renderContent = () => {
        if (!isActive) {
            return (
                <LightCard style={{ padding: "2rem", textAlign: "center" }}>
                    <Text color="#888" style={{ marginBottom: "1rem" }}>
                        Connect to a wallet to view your liquidity positions.
                    </Text>
                    <Button
                        onClick={openWalletModal}
                        variant="secondary"
                        style={{ width: "auto", margin: "0 auto" }}
                    >
                        Connect Wallet
                    </Button>
                </LightCard>
            );
        }

        if (isLoading) {
            return (
                <LightCard style={{ padding: "2rem", textAlign: "center" }}>
                    <Text color="#888">
                        <DotsLoader>Loading</DotsLoader>
                    </Text>
                </LightCard>
            );
        }

        if (error) {
            return (
                <LightCard style={{ padding: "2rem", textAlign: "center" }}>
                    <Text color="#E84142">Error loading positions.</Text>
                </LightCard>
            );
        }

        if (positions.length > 0) {
            return (
                <>
                    {positions.map((pos: LiquidityPosition) => (
                        <PositionCard key={pos.pairAddress}>
                            <PositionCardHeader>
                                <DoubleLogo>
                                    <TokenLogoImg
                                        src={
                                            pos.token0.logoURI ||
                                            "/images/placeholder-logo.png"
                                        }
                                        alt={`${pos.token0.symbol} logo`}
                                    />
                                    <TokenLogoImg
                                        src={
                                            pos.token1.logoURI ||
                                            "/images/placeholder-logo.png"
                                        }
                                        alt={`${pos.token1.symbol} logo`}
                                    />
                                    <PairText fontWeight="600">
                                        {pos.token0.symbol}/{pos.token1.symbol}
                                    </PairText>
                                </DoubleLogo>
                                <Button
                                    size="small"
                                    variant="tertiary"
                                    onClick={() => handleManageClick(pos)}
                                >
                                    Manage
                                </Button>
                            </PositionCardHeader>
                            <RowBetween>
                                <Text fontSize="14px" color="#565a69">
                                    Your pool tokens:
                                </Text>
                                <Text fontSize="14px">
                                    {pos.lpTokenBalance}
                                </Text>
                            </RowBetween>
                        </PositionCard>
                    ))}
                </>
            );
        }

        return (
            <LightCard style={{ padding: "2rem", textAlign: "center" }}>
                <Text color="#888">No liquidity positions found.</Text>
            </LightCard>
        );
    };

    return (
        <PoolContainer>
            <PoolHeader>
                <Heading fontSize="24px">Liquidity Pools</Heading>
            </PoolHeader>

            <ButtonContainer>
                <Button fullWidth as={Link} to="/add">
                    Add Liquidity
                </Button>
            </ButtonContainer>

            <RowBetween>
                <Text fontWeight="600">Your Liquidity Positions</Text>
                <Tooltip>
                    ❓
                    <TooltipContent className="tooltip-content">
                        When you add liquidity, you receive pool tokens
                        representing your position. These tokens automatically
                        earn fees proportional to your share of the pool.
                    </TooltipContent>
                </Tooltip>
            </RowBetween>

            {renderContent()}

            <Text fontSize="14px" textAlign="center" margin="1rem 0">
                Don't see a pool you joined?{" "}
                <StyledLink to="/find">Import it.</StyledLink>
            </Text>
        </PoolContainer>
    );
};

export default Pool;
