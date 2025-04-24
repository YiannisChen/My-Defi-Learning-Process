import React from "react";
import styled from "styled-components";

export const Card = styled.div`
    width: 100%;
    background-color: #fff;
    border-radius: 20px;
    box-shadow: 0px 10px 20px rgba(0, 0, 0, 0.05);
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    position: relative;
    overflow: hidden;
    box-sizing: border-box;
`;

export const LightCard = styled(Card)`
    background-color: #f7f8fa;
    border: 1px solid #e2e2e2;
    box-shadow: none;
`;

export const GradientCard = styled(Card)`
    background: linear-gradient(
        155deg,
        rgba(255, 0, 122, 0.1) 0%,
        rgba(255, 255, 255, 0.1) 100%
    );
    border: 1px solid rgba(255, 0, 122, 0.2);
    box-shadow: none;
`;

export const OutlineCard = styled(Card)`
    background-color: transparent;
    border: 1px solid #e2e2e2;
    box-shadow: none;
`;

export default Card;
