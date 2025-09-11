// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

interface ICLMM {
    function addLiquidity(
        uint256 positionId,
        address token,
        uint256 amount
    ) external returns (uint256 liquidity);
    
    function removeLiquidity(
        uint256 positionId,
        uint256 liquidity,
        address token
    ) external returns (uint256 amount);
    
    function harvestFees(uint256 positionId) external returns (uint256 fees);
    
    function getPositionAmounts(uint256 positionId) 
        external 
        view 
        returns (uint256 token0Amount, uint256 token1Amount);
    
    function executeArbitrage(
        uint256 positionId,
        uint256 amount,
        bytes calldata data
    ) external returns (uint256 profit);
    
    function executeCustomStrategy(
        uint256 positionId,
        uint256 amount,
        bytes calldata strategyData
    ) external returns (uint256 profit);
}