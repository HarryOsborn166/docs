// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../interfaces/ICLMM.sol";

interface ICurveV2Pool {
    function add_liquidity(uint256[2] memory amounts, uint256 min_mint_amount) external returns (uint256);
    function remove_liquidity(uint256 _amount, uint256[2] memory min_amounts) external returns (uint256[2] memory);
    function remove_liquidity_one_coin(uint256 _amount, uint256 i, uint256 min_amount) external returns (uint256);
    function exchange(uint256 i, uint256 j, uint256 dx, uint256 min_dy) external returns (uint256);
    function coins(uint256 i) external view returns (address);
    function balances(uint256 i) external view returns (uint256);
    function get_dy(uint256 i, uint256 j, uint256 dx) external view returns (uint256);
    function calc_token_amount(uint256[2] memory amounts, bool deposit) external view returns (uint256);
    function calc_withdraw_one_coin(uint256 _token_amount, uint256 i) external view returns (uint256);
}

/**
 * @title CurveV2Strategy
 * @dev Strategy implementation for Curve V2 concentrated liquidity pools
 */
contract CurveV2Strategy is ICLMM {
    using SafeERC20 for IERC20;
    
    struct PoolInfo {
        address pool;
        address lpToken;
        address[2] tokens;
        uint256 nCoins;
    }
    
    mapping(uint256 => PoolInfo) public pools;
    uint256 public nextPoolId;
    
    constructor() {}
    
    function registerPool(
        address pool,
        address lpToken,
        address token0,
        address token1
    ) external returns (uint256 poolId) {
        poolId = nextPoolId++;
        pools[poolId] = PoolInfo({
            pool: pool,
            lpToken: lpToken,
            tokens: [token0, token1],
            nCoins: 2
        });
    }
    
    function addLiquidity(
        uint256 poolId,
        address token,
        uint256 amount
    ) external override returns (uint256 liquidity) {
        PoolInfo memory poolInfo = pools[poolId];
        require(poolInfo.pool != address(0), "Pool not found");
        
        ICurveV2Pool pool = ICurveV2Pool(poolInfo.pool);
        
        // Determine token index
        uint256 tokenIndex = _getTokenIndex(poolInfo, token);
        
        // Balance the liquidity (swap half to other token)
        uint256[2] memory amounts;
        if (tokenIndex == 0) {
            uint256 halfAmount = amount / 2;
            uint256 otherAmount = pool.get_dy(0, 1, halfAmount);
            amounts = [amount - halfAmount, otherAmount];
            
            // Perform swap
            IERC20(token).safeApprove(poolInfo.pool, halfAmount);
            pool.exchange(0, 1, halfAmount, otherAmount * 99 / 100);
        } else {
            uint256 halfAmount = amount / 2;
            uint256 otherAmount = pool.get_dy(1, 0, halfAmount);
            amounts = [otherAmount, amount - halfAmount];
            
            // Perform swap
            IERC20(token).safeApprove(poolInfo.pool, halfAmount);
            pool.exchange(1, 0, halfAmount, otherAmount * 99 / 100);
        }
        
        // Approve tokens
        IERC20(poolInfo.tokens[0]).safeApprove(poolInfo.pool, amounts[0]);
        IERC20(poolInfo.tokens[1]).safeApprove(poolInfo.pool, amounts[1]);
        
        // Add liquidity
        liquidity = pool.add_liquidity(amounts, 0);
        
        // Transfer LP tokens to caller
        IERC20(poolInfo.lpToken).safeTransfer(msg.sender, liquidity);
        
        return liquidity;
    }
    
    function removeLiquidity(
        uint256 poolId,
        uint256 liquidityToRemove,
        address tokenOut
    ) external override returns (uint256 amount) {
        PoolInfo memory poolInfo = pools[poolId];
        require(poolInfo.pool != address(0), "Pool not found");
        
        ICurveV2Pool pool = ICurveV2Pool(poolInfo.pool);
        
        // Transfer LP tokens from caller
        IERC20(poolInfo.lpToken).safeTransferFrom(msg.sender, address(this), liquidityToRemove);
        IERC20(poolInfo.lpToken).safeApprove(poolInfo.pool, liquidityToRemove);
        
        // Determine token index
        uint256 tokenIndex = _getTokenIndex(poolInfo, tokenOut);
        
        // Remove liquidity in single coin
        amount = pool.remove_liquidity_one_coin(liquidityToRemove, tokenIndex, 0);
        
        // Transfer tokens to caller
        IERC20(tokenOut).safeTransfer(msg.sender, amount);
        
        return amount;
    }
    
    function harvestFees(uint256 poolId) external override returns (uint256 fees) {
        // Curve V2 doesn't have separate fee claiming
        // Fees are accumulated in the LP token value
        // This would require tracking LP token growth
        return 0;
    }
    
    function getPositionAmounts(uint256 poolId) 
        external 
        view 
        override 
        returns (uint256 token0Amount, uint256 token1Amount) 
    {
        PoolInfo memory poolInfo = pools[poolId];
        require(poolInfo.pool != address(0), "Pool not found");
        
        ICurveV2Pool pool = ICurveV2Pool(poolInfo.pool);
        
        // Get LP token balance of caller
        uint256 lpBalance = IERC20(poolInfo.lpToken).balanceOf(msg.sender);
        
        if (lpBalance == 0) {
            return (0, 0);
        }
        
        // Calculate underlying amounts
        token0Amount = pool.calc_withdraw_one_coin(lpBalance, 0);
        token1Amount = pool.calc_withdraw_one_coin(lpBalance, 1);
    }
    
    function executeArbitrage(
        uint256 poolId,
        uint256 amount,
        bytes calldata data
    ) external override returns (uint256 profit) {
        PoolInfo memory poolInfo = pools[poolId];
        require(poolInfo.pool != address(0), "Pool not found");
        
        // Decode arbitrage path
        (uint256[] memory poolIds, uint256[] memory tokenIndices) = abi.decode(data, (uint256[], uint256[]));
        
        uint256 currentAmount = amount;
        address currentToken = poolInfo.tokens[0];
        
        // Execute swaps through multiple pools
        for (uint256 i = 0; i < poolIds.length; i++) {
            PoolInfo memory currentPool = pools[poolIds[i]];
            ICurveV2Pool pool = ICurveV2Pool(currentPool.pool);
            
            uint256 fromIndex = tokenIndices[i * 2];
            uint256 toIndex = tokenIndices[i * 2 + 1];
            
            IERC20(currentToken).safeApprove(currentPool.pool, currentAmount);
            currentAmount = pool.exchange(fromIndex, toIndex, currentAmount, 0);
            currentToken = currentPool.tokens[toIndex];
        }
        
        // Calculate profit
        if (currentToken == poolInfo.tokens[0] && currentAmount > amount) {
            profit = currentAmount - amount;
            IERC20(currentToken).safeTransfer(msg.sender, profit);
        }
        
        return profit;
    }
    
    function executeCustomStrategy(
        uint256 poolId,
        uint256 amount,
        bytes calldata strategyData
    ) external override returns (uint256 profit) {
        // Decode strategy type
        bytes32 strategyType;
        bytes memory strategyParams;
        (strategyType, strategyParams) = abi.decode(strategyData, (bytes32, bytes));
        
        if (strategyType == keccak256("IMPERMANENT_LOSS_HEDGE")) {
            profit = _executeImpermanentLossHedge(poolId, amount, strategyParams);
        } else if (strategyType == keccak256("DYNAMIC_RANGE")) {
            profit = _executeDynamicRangeStrategy(poolId, amount, strategyParams);
        } else {
            revert("Unknown strategy");
        }
        
        return profit;
    }
    
    // Internal helper functions
    
    function _getTokenIndex(PoolInfo memory poolInfo, address token) internal pure returns (uint256) {
        if (poolInfo.tokens[0] == token) return 0;
        if (poolInfo.tokens[1] == token) return 1;
        revert("Token not in pool");
    }
    
    function _executeImpermanentLossHedge(
        uint256 poolId,
        uint256 amount,
        bytes memory params
    ) internal returns (uint256) {
        // Implement IL hedging strategy
        // This could involve options, perpetuals, or other derivatives
        return 0;
    }
    
    function _executeDynamicRangeStrategy(
        uint256 poolId,
        uint256 amount,
        bytes memory params
    ) internal returns (uint256) {
        // Implement dynamic range adjustment based on volatility
        return 0;
    }
}