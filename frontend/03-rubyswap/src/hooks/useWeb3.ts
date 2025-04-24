import {
    Web3ReactHooks,
    Web3ReactProvider,
    useWeb3React as useWeb3ReactCore,
} from "@web3-react/core";
import { Web3Provider } from "@ethersproject/providers";
import { useEffect, useState } from "react";
import { injected } from "../connectors";
import { Connector } from "@web3-react/types";

// Re-export the core hook directly for simplicity
export const useWeb3React = useWeb3ReactCore;

// Keep Eager Connect (adapted for v8)
export function useEagerConnect() {
    const { connector, isActive } = useWeb3React();
    const [tried, setTried] = useState(false);

    useEffect(() => {
        // Use connectEagerly for v8
        const connect = async () => {
            try {
                console.log("Attempting eager connect...");
                await injected.connectEagerly?.();
                console.log("Eager connect attempted.");
            } catch (error) {
                console.debug("Failed to connect eagerly", error);
            } finally {
                setTried(true);
            }
        };

        connect();
    }, []); // Intentionally run only once on mount

    useEffect(() => {
        if (isActive) {
            setTried(true);
            console.log("Eager connect successful, isActive:", isActive);
        }
    }, [isActive]);

    return tried;
}

// Keep Inactive Listener (adapted for v8)
export function useInactiveListener(suppress = false) {
    const { isActive, connector } = useWeb3React();

    useEffect(() => {
        const { ethereum } = window as any;

        if (ethereum?.on && !isActive && !suppress && connector) {
            const handleConnect = () => {
                console.log("Handling 'connect' event");
                connector.activate?.();
            };
            const handleChainChanged = (chainId: string | number) => {
                console.log(
                    "Handling 'chainChanged' event with payload",
                    chainId,
                );
                connector.activate?.();
            };
            const handleAccountsChanged = (accounts: string[]) => {
                console.log(
                    "Handling 'accountsChanged' event with payload",
                    accounts,
                );
                if (accounts.length > 0) {
                    connector.activate?.();
                }
            };

            ethereum.on("connect", handleConnect);
            ethereum.on("chainChanged", handleChainChanged);
            ethereum.on("accountsChanged", handleAccountsChanged);

            return () => {
                ethereum.removeListener?.("connect", handleConnect);
                ethereum.removeListener?.("chainChanged", handleChainChanged);
                ethereum.removeListener?.(
                    "accountsChanged",
                    handleAccountsChanged,
                );
            };
        }
        return undefined;
    }, [isActive, suppress, connector]);
}
