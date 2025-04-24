import React, { createContext, useContext, useState, ReactNode } from "react";
import SettingsModal from "../components/SettingsModal";

interface SettingsModalContextType {
    isSettingsModalOpen: boolean;
    openSettingsModal: () => void;
    closeSettingsModal: () => void;
}

const SettingsModalContext = createContext<SettingsModalContextType>({
    isSettingsModalOpen: false,
    openSettingsModal: () => {},
    closeSettingsModal: () => {},
});

export const useSettingsModal = () => useContext(SettingsModalContext);

interface SettingsModalProviderProps {
    children: ReactNode;
}

export const SettingsModalProvider: React.FC<SettingsModalProviderProps> = ({
    children,
}) => {
    const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);

    const openSettingsModal = () => setIsSettingsModalOpen(true);
    const closeSettingsModal = () => setIsSettingsModalOpen(false);

    return (
        <SettingsModalContext.Provider
            value={{
                isSettingsModalOpen,
                openSettingsModal,
                closeSettingsModal,
            }}
        >
            {children}
            <SettingsModal
                isOpen={isSettingsModalOpen}
                onClose={closeSettingsModal}
            />
        </SettingsModalContext.Provider>
    );
};
 