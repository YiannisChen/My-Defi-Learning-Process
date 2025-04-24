import React from "react";
import styled, { css } from "styled-components";

// Define palette (or import from theme/constants)
const colors = {
    textPrimary: "#2d2d2d",
    textSecondary: "#565a69",
    error: "#e84142",
};

interface TextProps {
    fontSize?: string;
    fontWeight?: string | number;
    color?: string;
    textAlign?: string;
    margin?: string;
    ellipsis?: boolean;
}

const baseTextStyles = css<TextProps>`
    font-size: ${({ fontSize = "16px" }) => fontSize};
    font-weight: ${({ fontWeight = "400" }) => fontWeight};
    color: ${({ color = colors.textPrimary }) =>
        color}; // Default to primary text
    text-align: ${({ textAlign = "left" }) => textAlign};
    margin: ${({ margin = "0" }) => margin};

    ${({ ellipsis }) =>
        ellipsis &&
        css`
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        `}
`;

export const Text = styled.p<TextProps>`
    ${baseTextStyles}
`;

export const Heading = styled.h1<TextProps>`
    ${baseTextStyles}
    font-weight: ${({ fontWeight = "600" }) =>
        fontWeight}; // Default headings to bolder
`;

export const Subheading = styled(Text).attrs({ as: "h2" })<TextProps>`
    font-size: ${({ fontSize }) => fontSize || "24px"};
    font-weight: ${({ fontWeight }) => fontWeight || "600"};
    margin: ${({ margin }) => margin || "0 0 0.75rem 0"};
`;

export const Small = styled(Text).attrs({ as: "small" })<TextProps>`
    font-size: ${({ fontSize }) => fontSize || "14px"};
`;

export const ErrorText = styled(Text)`
    color: ${colors.error}; // Use error color
    font-size: 14px; // Typically smaller
`;

// Add Span component if needed
export const Span = styled.span<TextProps>`
    ${baseTextStyles}
`;

export default Text;
