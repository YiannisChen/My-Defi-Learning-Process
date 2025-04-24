import React, { useEffect } from "react";
import {
    BrowserRouter,
    Routes,
    Route,
    Link,
    useLocation,
} from "react-router-dom";
import styled, { createGlobalStyle } from "styled-components";
import { Web3ReactProvider } from "@web3-react/core";
import { Web3Provider } from "@ethersproject/providers";
import {
    useWeb3React,
    useEagerConnect,
    useInactiveListener,
} from "./hooks/useWeb3";
import { connectorHooks } from "./connectors";
import {
    WalletModalProvider,
    useWalletModal,
} from "./context/WalletModalContext";
import {
    SettingsModalProvider,
    useSettingsModal,
} from "./context/SettingsModalContext";
import { TransactionProvider } from "./context/TransactionContext";

// Import our pages
const Swap = React.lazy(() => import("./pages/Swap"));
const Pool = React.lazy(() => import("./pages/Pool"));
const AddLiquidity = React.lazy(() => import("./pages/AddLiquidity"));
const RemoveLiquidity = React.lazy(() => import("./pages/RemoveLiquidity"));

// Define a basic palette (adjust colors as needed)
const colors = {
    primary: "#a13c3c", // Warm Ruby/Caramel Brown
    secondary: "#fdfcfb", // Creamy off-white
    accent: "#76c7c0", // Muted Teal
    textPrimary: "#2d2d2d", // Soft Black
    textSecondary: "#565a69", // Grey
    background: "#faf8f7", // Light Beige/Off-white
    border: "#edeef2", // Light grey border
    error: "#e84142", // Keep existing error red
};

// Optional: Global Style for base styling
const GlobalStyle = createGlobalStyle`
  body {
    background-color: ${colors.background};
    color: ${colors.textPrimary};
    font-family: "Inter", sans-serif; // Ensure font is global
  }
  * {
      box-sizing: border-box;
  }
`;

// Styled components for our UI
const AppWrapper = styled.div`
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    background-color: ${colors.background};
    background-image: radial-gradient(
        50% 50% at 50% 50%,
        ${colors.primary}0A 0%,
        ${colors.background}00 100%
    );
    font-family: "Inter", sans-serif;
`;

const HeaderWrapper = styled.header`
    width: 100%;
    padding: 1rem;
    position: fixed;
    top: 0;
    z-index: 100;
    background-color: rgba(255, 255, 255, 0.95);
    backdrop-filter: blur(5px);
    border-bottom: 1px solid ${colors.border};
`;

const HeaderContent = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
    max-width: 1200px;
    margin: 0 auto;
    padding: 0 1rem;
`;

const LogoContainer = styled(Link)`
    display: flex;
    align-items: center;
    gap: 0.5rem;
    text-decoration: none;
    font-weight: 600;
`;

const LogoImage = styled.img`
    height: 24px;
    width: 24px;
`;

const LogoText = styled.span`
    font-size: 1.25rem;
    color: ${colors.primary};
`;

const Navigation = styled.nav`
    display: flex;
    gap: 2rem;
    align-items: center;
`;

const NavLink = styled(Link)<{ $isActive?: boolean }>`
    text-decoration: none;
    color: ${({ $isActive }) =>
        $isActive ? colors.primary : colors.textSecondary};
    font-weight: ${({ $isActive }) => ($isActive ? "600" : "500")};
    font-size: 1rem;
    padding: 0.5rem;
    border-radius: 0.75rem;
    transition: all 0.2s;

    &:hover {
        color: ${colors.primary};
        background-color: rgba(161, 60, 60, 0.05);
    }
`;

const MainContent = styled.main`
    width: 100%;
    max-width: 480px;
    margin: 6rem auto 2rem;
    padding: 0 1rem;
    flex: 1;
    position: relative;
    z-index: 1;
`;

const ContentWrapper = styled.div`
    background-color: ${colors.secondary};
    border-radius: 24px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.05);
    width: 100%;
    padding: 1rem;
    position: relative;
    overflow: hidden;

    &::before {
        content: "";
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        height: 200px;
        background: radial-gradient(
            76.02% 75.41% at 50% 0%,
            ${colors.primary}08 0%,
            ${colors.background}00 100%
        );
        pointer-events: none;
    }
`;

const WalletButton = styled.button`
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
    background-color: ${({ disabled }) =>
        disabled ? colors.border : colors.secondary};
    border: 1px solid ${colors.border};
    border-radius: 16px;
    font-size: 0.875rem;
    color: ${({ disabled }) =>
        disabled ? colors.textSecondary : colors.textPrimary};
    font-weight: 500;
    cursor: ${({ disabled }) => (disabled ? "default" : "pointer")};

    &:hover {
        border-color: ${colors.primary}40;
        background-color: ${({ disabled }) =>
            disabled ? colors.border : `${colors.primary}10`};
    }
`;

const StatusDot = styled.div<{ $connected: boolean }>`
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background-color: ${({ $connected }) =>
        $connected ? "#4CAF50" : colors.error};
`;

const LoadingContainer = styled.div`
    display: flex;
    justify-content: center;
    align-items: center;
    height: 200px;
`;

const Spinner = styled.div`
    border: 4px solid rgba(0, 0, 0, 0.1);
    width: 36px;
    height: 36px;
    border-radius: 50%;
    border-left-color: #e84142;
    animation: spin 1s linear infinite;

    @keyframes spin {
        0% {
            transform: rotate(0deg);
        }
        100% {
            transform: rotate(360deg);
        }
    }
`;

// Header component with wallet connection button
function Header() {
    const { account, connector } = useWeb3React<Web3Provider>();
    const { openWalletModal } = useWalletModal();
    const location = useLocation();
    const isActive = !!connector && !!account;

    const currentPath = location.pathname;

    const shortenAddress = (address: string) => {
        return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
    };

    return (
        <HeaderWrapper>
            <HeaderContent>
                <LogoContainer to="/">
                    <LogoImage
                        src="/images/ruby-logo.png"
                        alt="RubySwap Logo"
                    />
                    <LogoText>RubyswapV2</LogoText>
                </LogoContainer>
                <Navigation>
                    <NavLink to="/" $isActive={currentPath === "/"}>
                        Swap
                    </NavLink>
                    <NavLink
                        to="/pool"
                        $isActive={
                            currentPath.includes("/pool") ||
                            currentPath.includes("/add") ||
                            currentPath.includes("/remove")
                        }
                    >
                        Pool
                    </NavLink>
                </Navigation>
                <WalletButton onClick={openWalletModal}>
                    {isActive ? (
                        <>
                            <StatusDot $connected={true} />
                            {shortenAddress(account!)}
                        </>
                    ) : (
                        "Connect Wallet"
                    )}
                </WalletButton>
            </HeaderContent>
        </HeaderWrapper>
    );
}

function AppContent() {
    // Handle connecting to Ethereum wallet
    const triedEager = useEagerConnect();
    useInactiveListener(!triedEager);

    return (
        <AppWrapper>
            <Header />

            <MainContent>
                <ContentWrapper>
                    <React.Suspense
                        fallback={
                            <LoadingContainer>
                                <Spinner />
                            </LoadingContainer>
                        }
                    >
                        <Routes>
                            <Route path="/" element={<Swap />} />
                            <Route path="/pool" element={<Pool />} />
                            <Route path="/add" element={<AddLiquidity />} />
                            <Route
                                path="/remove/:pairAddress"
                                element={<RemoveLiquidity />}
                            />
                            <Route path="/remove" element={<Pool />} />
                        </Routes>
                    </React.Suspense>
                </ContentWrapper>
            </MainContent>
        </AppWrapper>
    );
}

function getLibrary(provider: any): Web3Provider {
    return new Web3Provider(provider);
}

function App() {
    return (
        <BrowserRouter>
            <Web3ReactProvider connectors={connectorHooks}>
                <WalletModalProvider>
                    <SettingsModalProvider>
                        <TransactionProvider>
                            <GlobalStyle />
                            <AppWrapper>
                                <AppContent />
                            </AppWrapper>
                        </TransactionProvider>
                    </SettingsModalProvider>
                </WalletModalProvider>
            </Web3ReactProvider>
        </BrowserRouter>
    );
}

export default App;
