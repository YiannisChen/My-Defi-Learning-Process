import React from "react";
import styled from "styled-components";
import { Text } from "./Typography";
import { Button } from "./Button";

// Re-use modal styles where possible or define specific ones
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
`;

const ModalBody = styled.div`
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
`;

const SettingRow = styled.div`
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
`;

const Input = styled.input`
    padding: 0.75rem 1rem;
    border-radius: 12px;
    border: 1px solid #e2e2e2;
    font-size: 16px;

    &:focus {
        outline: none;
        border-color: #e84142;
    }
`;

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
    if (!isOpen) return null;

    // TODO: Add state and handlers for slippage and deadline

    return (
        <ModalOverlay onClick={onClose}>
            <ModalContent onClick={(e) => e.stopPropagation()}>
                <ModalHeader>
                    <ModalTitle>Transaction Settings</ModalTitle>
                    <CloseButton onClick={onClose}>✕</CloseButton>
                </ModalHeader>
                <ModalBody>
                    <SettingRow>
                        <Text fontWeight="600">Slippage Tolerance</Text>
                        {/* Placeholder - add buttons/input for slippage */}
                        <Text fontSize="14px" color="#565a69">
                            Current: 0.5%
                        </Text>
                    </SettingRow>
                    <SettingRow>
                        <Text fontWeight="600">Transaction Deadline</Text>
                        <Input type="number" placeholder="20" />
                        <Text fontSize="14px" color="#565a69">
                            minutes
                        </Text>
                    </SettingRow>
                    {/* Add save button if needed */}
                </ModalBody>
            </ModalContent>
        </ModalOverlay>
    );
};

export default SettingsModal;
 