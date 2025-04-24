import { Contract } from "@ethersproject/contracts";
import { getAddress } from "@ethersproject/address";
import { AddressZero } from "@ethersproject/constants";
import { JsonRpcSigner, Web3Provider } from "@ethersproject/providers";

import FACTORY_ABI from "../abis/factory.json";
import ROUTER_ABI from "../abis/router.json";
import PAIR_ABI from "../abis/pair.json";
import ERC20_ABI from "../abis/erc20.json";

import { FACTORY_ADDRESS, ROUTER_ADDRESS } from "../constants/contracts";

// Returns the checksummed address if the address is valid, otherwise returns false
export function isAddress(value: any): string | false {
    try {
        return getAddress(value);
    } catch {
        return false;
    }
}

// Get chain-specific address
function getChainAddress(
    addressMap: { [chainId: number]: string },
    chainId?: number,
): string {
    if (!chainId || !addressMap[chainId]) {
        throw new Error(`Address not found for chain ID ${chainId}`);
    }
    return addressMap[chainId];
}

// Shorthand for getting contract instance
export function getContract(
    address: string,
    ABI: any,
    library: Web3Provider,
    account?: string,
): Contract {
    if (!isAddress(address) || address === AddressZero) {
        throw Error(`Invalid 'address' parameter '${address}'.`);
    }

    const provider = account ? getSigner(library, account) : library;
    return new Contract(address, ABI, provider);
}

// Account is optional
export function getFactoryContract(
    library: Web3Provider,
    chainId?: number,
    account?: string,
): Contract {
    const address = getChainAddress(FACTORY_ADDRESS, chainId);
    return getContract(address, FACTORY_ABI, library, account);
}

// Account is optional
export function getRouterContract(
    library: Web3Provider,
    chainId?: number,
    account?: string,
): Contract {
    const address = getChainAddress(ROUTER_ADDRESS, chainId);
    return getContract(address, ROUTER_ABI, library, account);
}

// Account is optional
export function getTokenContract(
    tokenAddress: string,
    library: Web3Provider,
    account?: string,
): Contract {
    return getContract(tokenAddress, ERC20_ABI, library, account);
}

export function getPairContract(
    pairAddress: string,
    library: Web3Provider,
    account?: string,
): Contract {
    return getContract(pairAddress, PAIR_ABI, library, account);
}

// Account is optional
export function getSigner(
    library: Web3Provider,
    account: string,
): JsonRpcSigner {
    return library.getSigner(account).connectUnchecked();
}

// Account is optional
export function getProviderOrSigner(
    library: Web3Provider,
    account?: string,
): Web3Provider | JsonRpcSigner {
    return account ? getSigner(library, account) : library;
}
