// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import "@uniswap/v3-periphery/contracts/interfaces/INonfungiblePositionManager.sol";
import "@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../interfaces/ICLMM.sol";

/**
 * @title UniswapV3Strategy
 * @dev Strategy implementation for Uniswap V3 concentrated liquidity positions
 */
contract UniswapV3Strategy is ICLMM {
    using SafeERC20 for IERC20;
    
    INonfungiblePositionManager public immutable positionManager;
    ISwapRouter public immutable swapRouter;
    
    struct PositionInfo {
        address token0;
        address token1;
        uint24 fee;
        int24 tickLower;
        int24 tickUpper;
        uint128 liquidity;
    }
    
    constructor(
        address _positionManager,
        address _swapRouter
    ) {
        positionManager = INonfungiblePositionManager(_positionManager);
        swapRouter = ISwapRouter(_swapRouter);
    }
    
    function addLiquidity(
        uint256 positionId,
        address token,
        uint256 amount
    ) external override returns (uint256 liquidity) {
        // Get position details
        PositionInfo memory position = _getPositionInfo(positionId);
        
        // Determine which token we're adding
        bool isToken0 = position.token0 == token;
        require(isToken0 || position.token1 == token, "Invalid token");
        
        // Calculate optimal amounts for both tokens
        (uint256 amount0, uint256 amount1) = isToken0 
            ? (amount, 0) 
            : (0, amount);
        
        // If we only have one token, swap half to the other token
        if (amount0 == 0 || amount1 == 0) {
            (amount0, amount1) = _balanceTokenAmounts(
                position,
                token,
                amount,
                isToken0
            );
        }
        
        // Approve tokens
        if (amount0 > 0) {
            IERC20(position.token0).safeApprove(address(positionManager), amount0);
        }
        if (amount1 > 0) {
            IERC20(position.token1).safeApprove(address(positionManager), amount1);
        }
        
        // Add liquidity
        INonfungiblePositionManager.IncreaseLiquidityParams memory params = 
            INonfungiblePositionManager.IncreaseLiquidityParams({
                tokenId: positionId,
                amount0Desired: amount0,
                amount1Desired: amount1,
                amount0Min: 0, // In production, calculate slippage
                amount1Min: 0,
                deadline: block.timestamp
            });
            
        (liquidity,,) = positionManager.increaseLiquidity(params);
        
        return liquidity;
    }
    
    function removeLiquidity(
        uint256 positionId,
        uint256 liquidityToRemove,
        address tokenOut
    ) external override returns (uint256 amount) {
        PositionInfo memory position = _getPositionInfo(positionId);
        
        // Remove liquidity
        INonfungiblePositionManager.DecreaseLiquidityParams memory params =
            INonfungiblePositionManager.DecreaseLiquidityParams({
                tokenId: positionId,
                liquidity: uint128(liquidityToRemove),
                amount0Min: 0,
                amount1Min: 0,
                deadline: block.timestamp
            });
            
        (uint256 amount0, uint256 amount1) = positionManager.decreaseLiquidity(params);
        
        // Collect tokens
        INonfungiblePositionManager.CollectParams memory collectParams =
            INonfungiblePositionManager.CollectParams({
                tokenId: positionId,
                recipient: address(this),
                amount0Max: uint128(amount0),
                amount1Max: uint128(amount1)
            });
            
        positionManager.collect(collectParams);
        
        // Convert to desired token if necessary
        if (tokenOut == position.token0) {
            // Swap token1 to token0
            if (amount1 > 0) {
                amount0 += _swap(position.token1, position.token0, amount1, position.fee);
            }
            amount = amount0;
        } else {
            // Swap token0 to token1
            if (amount0 > 0) {
                amount1 += _swap(position.token0, position.token1, amount0, position.fee);
            }
            amount = amount1;
        }
        
        // Transfer to caller
        IERC20(tokenOut).safeTransfer(msg.sender, amount);
        
        return amount;
    }
    
    function harvestFees(uint256 positionId) external override returns (uint256 fees) {
        // Collect accumulated fees
        INonfungiblePositionManager.CollectParams memory params =
            INonfungiblePositionManager.CollectParams({
                tokenId: positionId,
                recipient: address(this),
                amount0Max: type(uint128).max,
                amount1Max: type(uint128).max
            });
            
        (uint256 amount0, uint256 amount1) = positionManager.collect(params);
        
        // For simplicity, return sum of fees
        // In production, you'd convert to a common denomination
        fees = amount0 + amount1;
        
        // Transfer fees to caller
        PositionInfo memory position = _getPositionInfo(positionId);
        if (amount0 > 0) {
            IERC20(position.token0).safeTransfer(msg.sender, amount0);
        }
        if (amount1 > 0) {
            IERC20(position.token1).safeTransfer(msg.sender, amount1);
        }
        
        return fees;
    }
    
    function getPositionAmounts(uint256 positionId) 
        external 
        view 
        override 
        returns (uint256 token0Amount, uint256 token1Amount) 
    {
        PositionInfo memory position = _getPositionInfo(positionId);
        
        // Get pool
        address pool = _getPool(position.token0, position.token1, position.fee);
        IUniswapV3Pool uniPool = IUniswapV3Pool(pool);
        
        // Get current tick
        (, int24 tick,,,,,) = uniPool.slot0();
        
        // Calculate amounts based on liquidity and price
        (token0Amount, token1Amount) = _getAmountsForLiquidity(
            position.liquidity,
            tick,
            position.tickLower,
            position.tickUpper
        );
    }
    
    function executeArbitrage(
        uint256 positionId,
        uint256 amount,
        bytes calldata data
    ) external override returns (uint256 profit) {
        // Decode arbitrage parameters
        (address[] memory path, uint24[] memory fees) = abi.decode(data, (address[], uint24[]));
        
        require(path.length >= 2, "Invalid path");
        
        // Execute multi-hop swap
        uint256 amountOut = amount;
        
        for (uint256 i = 0; i < path.length - 1; i++) {
            amountOut = _swap(path[i], path[i + 1], amountOut, fees[i]);
        }
        
        // Calculate profit
        profit = amountOut > amount ? amountOut - amount : 0;
        
        // Transfer profit to caller
        if (profit > 0) {
            IERC20(path[path.length - 1]).safeTransfer(msg.sender, profit);
        }
        
        return profit;
    }
    
    function executeCustomStrategy(
        uint256 positionId,
        uint256 amount,
        bytes calldata strategyData
    ) external override returns (uint256 profit) {
        // Decode strategy type
        bytes32 strategyType;
        bytes memory strategyParams;
        (strategyType, strategyParams) = abi.decode(strategyData, (bytes32, bytes));
        
        if (strategyType == keccak256("RANGE_ORDER")) {
            profit = _executeRangeOrder(positionId, amount, strategyParams);
        } else if (strategyType == keccak256("REBALANCE")) {
            profit = _executeRebalance(positionId, amount, strategyParams);
        } else {
            revert("Unknown strategy");
        }
        
        return profit;
    }
    
    // Internal helper functions
    
    function _getPositionInfo(uint256 positionId) internal view returns (PositionInfo memory) {
        (
            ,, 
            address token0,
            address token1,
            uint24 fee,
            int24 tickLower,
            int24 tickUpper,
            uint128 liquidity,
            ,,,
        ) = positionManager.positions(positionId);
        
        return PositionInfo({
            token0: token0,
            token1: token1,
            fee: fee,
            tickLower: tickLower,
            tickUpper: tickUpper,
            liquidity: liquidity
        });
    }
    
    function _balanceTokenAmounts(
        PositionInfo memory position,
        address tokenIn,
        uint256 amountIn,
        bool isToken0
    ) internal returns (uint256 amount0, uint256 amount1) {
        // Calculate optimal ratio based on current price and range
        // For simplicity, we'll swap half
        uint256 halfAmount = amountIn / 2;
        
        if (isToken0) {
            uint256 swapped = _swap(position.token0, position.token1, halfAmount, position.fee);
            amount0 = amountIn - halfAmount;
            amount1 = swapped;
        } else {
            uint256 swapped = _swap(position.token1, position.token0, halfAmount, position.fee);
            amount0 = swapped;
            amount1 = amountIn - halfAmount;
        }
    }
    
    function _swap(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint24 fee
    ) internal returns (uint256 amountOut) {
        IERC20(tokenIn).safeApprove(address(swapRouter), amountIn);
        
        ISwapRouter.ExactInputSingleParams memory params =
            ISwapRouter.ExactInputSingleParams({
                tokenIn: tokenIn,
                tokenOut: tokenOut,
                fee: fee,
                recipient: address(this),
                deadline: block.timestamp,
                amountIn: amountIn,
                amountOutMinimum: 0,
                sqrtPriceLimitX96: 0
            });
            
        amountOut = swapRouter.exactInputSingle(params);
    }
    
    function _getPool(
        address token0,
        address token1,
        uint24 fee
    ) internal pure returns (address) {
        // Calculate pool address using CREATE2
        // In production, use the factory's getPool function
        return address(0); // Placeholder
    }
    
    function _getAmountsForLiquidity(
        uint128 liquidity,
        int24 currentTick,
        int24 tickLower,
        int24 tickUpper
    ) internal pure returns (uint256 amount0, uint256 amount1) {
        // Complex calculation based on Uniswap V3 math
        // Simplified for this example
        return (liquidity / 2, liquidity / 2);
    }
    
    function _executeRangeOrder(
        uint256 positionId,
        uint256 amount,
        bytes memory params
    ) internal returns (uint256) {
        // Implement range order strategy
        return 0;
    }
    
    function _executeRebalance(
        uint256 positionId,
        uint256 amount,
        bytes memory params
    ) internal returns (uint256) {
        // Implement rebalancing strategy
        return 0;
    }
}