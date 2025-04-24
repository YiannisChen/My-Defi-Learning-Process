import React, {
    createContext,
    useContext,
    useState,
    ReactNode,
    useCallback,
} from "react";

interface TransactionContextType {
    latestTxHash: string | null;
    setLatestTxHash: (hash: string | null) => void;
}

const TransactionContext = createContext<TransactionContextType>({
    latestTxHash: null,
    setLatestTxHash: () => {},
});

export const useTransactionContext = () => useContext(TransactionContext);

interface TransactionProviderProps {
    children: ReactNode;
}

export const TransactionProvider: React.FC<TransactionProviderProps> = ({
    children,
}) => {
    const [latestTxHash, setLatestTxHashState] = useState<string | null>(null);

    // Wrap setter to potentially add more logic later (e.g., storing multiple)
    const setLatestTxHash = useCallback((hash: string | null) => {
        setLatestTxHashState(hash);
        // Could also add to local storage here
    }, []);

    return (
        <TransactionContext.Provider
            value={{
                latestTxHash,
                setLatestTxHash,
            }}
        >
            {children}
        </TransactionContext.Provider>
    );
};
 