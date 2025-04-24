import React from "react";
import styled, { css } from "styled-components";

const colors = {
    primary: "#a13c3c",
    primaryHover: "#8a3333", 
    primaryActive: "#732a2a", 
    secondary: "#fdfcfb", 
    accent: "#76c7c0",
    accentHover: "#63bdb4", 
    textPrimary: "#2d2d2d", 
    textSecondary: "#565a69", 
    background: "#faf8f7",
    border: "#edeef2", 
    error: "#e84142", 
};

interface ButtonProps {
    size?: "small" | "medium" | "large";
    variant?: "primary" | "secondary" | "tertiary" | "text";
    fullWidth?: boolean;
    width?: string;
    disabled?: boolean;
    onClick?: () => void;
    children?: React.ReactNode;
    as?: React.ElementType;
    to?: string;
    style?: React.CSSProperties;
}

const sizeStyles = {
    small: css`
        font-size: 14px;
        padding: 8px 12px;
    `,
    medium: css`
        font-size: 16px;
        padding: 10px 16px;
    `,
    large: css`
        font-size: 18px;
        padding: 12px 24px;
    `,
};

const variantStyles = {
    primary: css`
        // Use solid primary color, remove gradient
        background: ${colors.primary};
        color: white;
        border: none;

        &:hover:not(:disabled) {
            background: ${colors.primaryHover};
        }

        &:active:not(:disabled) {
            background: ${colors.primaryActive};
        }
    `,
    secondary: css`
        background-color: transparent;
        color: ${colors.primary};
        border: 1px solid ${colors.primary};

        &:hover:not(:disabled) {
            background-color: ${colors.primary}10; // Faint primary bg
        }

        &:active:not(:disabled) {
            background-color: ${colors.primary}20; // Slightly less faint
        }
    `,
    tertiary: css`
        // Use secondary background, primary text
        background-color: ${colors.border};
        color: ${colors.textSecondary};
        border: none;

        &:hover:not(:disabled) {
            background-color: #e0e2e6; // Slightly darker grey
            color: ${colors.textPrimary}; // Darker text on hover
        }

        &:active:not(:disabled) {
            background-color: #d8dade;
        }
    `,
    text: css`
        background-color: transparent;
        color: ${colors.primary};
        border: none;
        padding: 0;

        &:hover:not(:disabled) {
            text-decoration: underline;
        }
    `,
};

export const Button = styled.button<ButtonProps>`
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-weight: 600;
    border-radius: 16px; // Consistent rounding
    cursor: pointer;
    transition: all 0.2s ease;
    box-sizing: border-box;

    ${({ size = "medium" }) => sizeStyles[size]}
    ${({ variant = "primary" }) => variantStyles[variant]}
  
    width: ${({ fullWidth, width }) => {
        if (fullWidth) return "100%";
        if (width) return width;
        return "auto";
    }};

    &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
        // Ensure disabled doesn't change background on hover/active if needed
        &:hover {
            background: revert;
        }
    }

    &:focus {
        outline: none;
        box-shadow: 0 0 0 2px ${colors.primary}50; // Use primary color for focus ring
    }
`;

export const IconButton = styled(Button)`
    border-radius: 16px;
    padding: ${({ size = "medium" }) =>
        size === "small" ? "8px" : size === "medium" ? "10px" : "12px"};

    svg {
        width: ${({ size = "medium" }) =>
            size === "small" ? "16px" : size === "medium" ? "20px" : "24px"};
        height: ${({ size = "medium" }) =>
            size === "small" ? "16px" : size === "medium" ? "20px" : "24px"};
    }
`;

export default Button;
