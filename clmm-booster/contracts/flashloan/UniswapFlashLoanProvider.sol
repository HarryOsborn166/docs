// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@uniswap/v3-core/contracts/interfaces/callback/IUniswapV3FlashCallback.sol";
import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../interfaces/IFlashLoanProvider.sol";
import "../interfaces/IFlashLoanReceiver.sol";

/**
 * @title UniswapFlashLoanProvider
 * @dev Adapter for Uniswap V3 flash loans
 */
contract UniswapFlashLoanProvider is IFlashLoanProvider, IUniswapV3FlashCallback {
    struct FlashLoanCallbackData {
        address receiver;
        address asset;
        uint256 amount;
        bytes originalData;
        address pool;
        uint256 fee;
    }
    
    // Mapping of token pairs to their Uniswap V3 pools
    mapping(address => mapping(address => address)) public tokenPools;
    
    constructor() {}
    
    function flashLoan(
        address receiver,
        address asset,
        uint256 amount,
        bytes calldata data
    ) external override {
        // Find suitable pool for flash loan
        address pool = _findBestPool(asset);
        require(pool != address(0), "No pool found for asset");
        
        IUniswapV3Pool uniPool = IUniswapV3Pool(pool);
        
        // Get pool tokens
        address token0 = uniPool.token0();
        address token1 = uniPool.token1();
        
        uint256 amount0 = token0 == asset ? amount : 0;
        uint256 amount1 = token1 == asset ? amount : 0;
        
        // Calculate fee
        uint24 fee = uniPool.fee();
        uint256 flashFee = (amount * fee) / 1e6;
        
        // Encode callback data
        bytes memory callbackData = abi.encode(
            FlashLoanCallbackData({
                receiver: receiver,
                asset: asset,
                amount: amount,
                originalData: data,
                pool: pool,
                fee: flashFee
            })
        );
        
        // Execute flash loan
        uniPool.flash(address(this), amount0, amount1, callbackData);
    }
    
    function uniswapV3FlashCallback(
        uint256 fee0,
        uint256 fee1,
        bytes calldata data
    ) external override {
        FlashLoanCallbackData memory decoded = abi.decode(data, (FlashLoanCallbackData));
        
        // Verify callback is from expected pool
        require(msg.sender == decoded.pool, "Unauthorized callback");
        
        // Transfer borrowed amount to receiver
        IERC20(decoded.asset).transfer(decoded.receiver, decoded.amount);
        
        // Calculate total fee
        uint256 totalFee = fee0 > 0 ? fee0 : fee1;
        
        // Call receiver
        bool success = IFlashLoanReceiver(decoded.receiver).executeOperation(
            decoded.asset,
            decoded.amount,
            totalFee,
            address(this),
            decoded.originalData
        );
        
        require(success, "Receiver execution failed");
        
        // Pull back the owed amount
        uint256 amountOwed = decoded.amount + totalFee;
        IERC20(decoded.asset).transferFrom(decoded.receiver, address(this), amountOwed);
        
        // Repay to pool
        IERC20(decoded.asset).transfer(decoded.pool, amountOwed);
    }
    
    function _findBestPool(address asset) internal view returns (address) {
        // In production, this would involve complex logic to find the best pool
        // For now, we'll use a simple mapping approach
        
        // Common stable pairs for USDC, USDT, DAI
        address WETH = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;
        
        if (tokenPools[asset][WETH] != address(0)) {
            return tokenPools[asset][WETH];
        }
        
        // Return first available pool
        // In real implementation, this would iterate through multiple pairs
        return address(0);
    }
    
    function registerPool(address token0, address token1, address pool) external {
        tokenPools[token0][token1] = pool;
        tokenPools[token1][token0] = pool;
    }
}