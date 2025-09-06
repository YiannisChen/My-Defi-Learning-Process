// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.24;

import {IRubySwapPoolDeployer} from "../interfaces/IRubySwapPoolDeployer.sol";
import {RubySwapPool} from "./RubySwapPool.sol";

contract RubySwapPoolDeployer is IRubySwapPoolDeployer {
    struct Parameters {
        address factory;
        address token0;
        address token1;
        uint24 fee;
        int24 tickSpacing;
    }

    Parameters private _parameters;

    function parameters()
        external
        view
        override
        returns (
            address factory,
            address token0,
            address token1,
            uint24 fee,
            int24 tickSpacing
        )
    {
        Parameters memory p = _parameters;
        return (p.factory, p.token0, p.token1, p.fee, p.tickSpacing);
    }

    function deploy(
        address factory,
        address token0,
        address token1,
        uint24 fee,
        int24 tickSpacing
    ) external returns (address pool) {
        _parameters = Parameters({
            factory: factory,
            token0: token0,
            token1: token1,
            fee: fee,
            tickSpacing: tickSpacing
        });
        pool = address(new RubySwapPool());
        delete _parameters;
    }
} 