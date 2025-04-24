import React, { createContext, useContext, useState, ReactNode } from "react";
import WalletModal from "../components/WalletModal";

interface WalletModalContextType {
    isWalletModalOpen: boolean;
    openWalletModal: () => void;
    closeWalletModal: () => void;
    toggleWalletModal: () => void;
}

const WalletModalContext = createContext<WalletModalContextType>({
    isWalletModalOpen: false,
    openWalletModal: () => {},
    closeWalletModal: () => {},
    toggleWalletModal: () => {},
});

export const useWalletModal = () => useContext(WalletModalContext);

interface WalletModalProviderProps {
    children: ReactNode;
}

export const WalletModalProvider: React.FC<WalletModalProviderProps> = ({
    children,
}) => {
    const [isWalletModalOpen, setIsWalletModalOpen] = useState(false);

    const openWalletModal = () => setIsWalletModalOpen(true);
    const closeWalletModal = () => setIsWalletModalOpen(false);
    const toggleWalletModal = () => setIsWalletModalOpen((prev) => !prev);

    return (
        <WalletModalContext.Provider
            value={{
                isWalletModalOpen,
                openWalletModal,
                closeWalletModal,
                toggleWalletModal,
            }}
        >
            {children}
            <WalletModal
                isOpen={isWalletModalOpen}
                onClose={closeWalletModal}
            />
        </WalletModalContext.Provider>
    );
};
 