export interface TokenInfo {
    chainId: number;
    address: string;
    name: string;
    symbol: string;
    decimals: number;
    logoURI?: string;
}

export const SEPOLIA_CHAIN_ID = 11155111;
export const MAINNET_CHAIN_ID = 1;

// Contract Addresses (Sepolia for now)
export const ROUTER_ADDRESS: { [chainId: number]: string } = {
    [SEPOLIA_CHAIN_ID]: "0x840f42cB68f7bf9E1bEAc7d74fD167E60DAbf2a3",
    // Add mainnet address when available
};

export const WETH_ADDRESS: { [chainId: number]: string } = {
    [SEPOLIA_CHAIN_ID]: "0xbD5eb2A4fBE5a69700470B9913CBfA3C01Bd0A20",
    [MAINNET_CHAIN_ID]: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", // Keep Mainnet WETH
};

// Using Sepolia (11155111) and Mainnet (1) addresses where available
export const supportedTokens: TokenInfo[] = [
    {
        chainId: MAINNET_CHAIN_ID,
        address: WETH_ADDRESS[MAINNET_CHAIN_ID],
        name: "Wrapped Ether",
        symbol: "WETH",
        decimals: 18,
        logoURI:
            "https://assets.coingecko.com/coins/images/279/small/ethereum.png?1595348880",
    },
    {
        chainId: SEPOLIA_CHAIN_ID,
        address: WETH_ADDRESS[SEPOLIA_CHAIN_ID],
        name: "Wrapped Ether (Sepolia)",
        symbol: "WETH",
        decimals: 18,
        logoURI:
            "https://assets.coingecko.com/coins/images/279/small/ethereum.png?1595348880",
    },
    {
        chainId: MAINNET_CHAIN_ID,
        address: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
        name: "Dai Stablecoin",
        symbol: "DAI",
        decimals: 18,
        logoURI:
            "https://assets.coingecko.com/coins/images/9956/small/Badge_Dai.png?1595348880",
    },
    {
        chainId: MAINNET_CHAIN_ID,
        address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        name: "USD Coin",
        symbol: "USDC",
        decimals: 6,
        logoURI:
            "https://assets.coingecko.com/coins/images/6319/small/USD_Coin_icon.png?1595348880",
    },
    {
        chainId: MAINNET_CHAIN_ID,
        address: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
        name: "Tether",
        symbol: "USDT",
        decimals: 6,
        logoURI:
            "https://assets.coingecko.com/coins/images/325/small/Tether-logo.png?1595348880",
    },
    {
        chainId: SEPOLIA_CHAIN_ID,
        address: "0x11B0db9e8F43a19CB1143e6467adCE258965F8F3", // Updated Ruby Address
        name: "Ruby Token",
        symbol: "RUBY",
        decimals: 18,
        logoURI: "/images/ruby-logo.png",
    },
    // Add deployed test tokens (Optional, if useful for testing)
    {
        chainId: SEPOLIA_CHAIN_ID,
        address: "0x55DF5871ba294F5036E4822c110Ba13187f86bDb", // TokenA
        name: "Token A (Test)",
        symbol: "TKA",
        decimals: 18,
    },
    {
        chainId: SEPOLIA_CHAIN_ID,
        address: "0x26ca9339d4B79CE046349F2E4c7c7CD97Cf26856", // TokenB
        name: "Token B (Test)",
        symbol: "TKB",
        decimals: 18,
    },
];

// Add Native ETH representation (important for swapping)
export const NATIVE_ETH: TokenInfo = {
    chainId: MAINNET_CHAIN_ID,
    address: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee", // Common placeholder
    name: "Ether",
    symbol: "ETH",
    decimals: 18,
    logoURI:
        "https://assets.coingecko.com/coins/images/279/small/ethereum.png?1595348880",
};

// Add Native Sepolia ETH representation
export const NATIVE_SEPOLIA_ETH: TokenInfo = {
    chainId: SEPOLIA_CHAIN_ID,
    address: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
    name: "Sepolia Ether",
    symbol: "ETH", // Still use ETH symbol generally
    decimals: 18,
    logoURI:
        "https://assets.coingecko.com/coins/images/279/small/ethereum.png?1595348880",
};

// Filter tokens based on chainId and include native currency
export function getTokenListByChainId(
    chainId: number | undefined,
): TokenInfo[] {
    if (!chainId) return [];

    let nativeToken: TokenInfo | undefined;
    if (chainId === MAINNET_CHAIN_ID) nativeToken = NATIVE_ETH;
    if (chainId === SEPOLIA_CHAIN_ID) nativeToken = NATIVE_SEPOLIA_ETH;

    const tokens = supportedTokens.filter((token) => token.chainId === chainId);

    return nativeToken ? [nativeToken, ...tokens] : tokens;
}

// Standard ERC20 ABI fragment needed for approve/allowance
export const ERC20_ABI = [
    // Read-Only Functions
    "function allowance(address owner, address spender) view returns (uint256)",
    "function balanceOf(address owner) view returns (uint256)",
    "function decimals() view returns (uint8)",
    "function symbol() view returns (string)",

    // Authenticated Functions
    "function approve(address spender, uint256 amount) returns (bool)",
    "function transfer(address to, uint256 amount) returns (bool)",

    // Events
    "event Approval(address indexed owner, address indexed spender, uint256 value)",
    "event Transfer(address indexed from, address indexed to, uint256 value)",
];
