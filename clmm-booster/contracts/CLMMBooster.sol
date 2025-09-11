// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./interfaces/IFlashLoanReceiver.sol";
import "./interfaces/ICLMM.sol";

/**
 * @title CLMMBooster
 * @dev Contract for boosting CLMM positions using flash loans
 * @notice This contract allows users to leverage their positions temporarily using flash loans
 */
contract CLMMBooster is IFlashLoanReceiver, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // Events
    event PositionBoosted(
        address indexed user,
        address indexed clmmProtocol,
        uint256 positionId,
        uint256 borrowAmount,
        uint256 profitGenerated
    );
    
    event FlashLoanExecuted(
        address indexed asset,
        uint256 amount,
        uint256 premium,
        address indexed initiator
    );

    // State variables
    mapping(address => bool) public supportedCLMMs;
    mapping(address => bool) public supportedFlashLoanProviders;
    mapping(address => uint256) public protocolFees; // In basis points (1% = 100)
    
    address public feeRecipient;
    uint256 public defaultProtocolFee = 50; // 0.5%
    
    // Structs
    struct BoostParams {
        address clmmProtocol;
        uint256 positionId;
        address tokenToBorrow;
        uint256 borrowAmount;
        bytes strategyData;
    }
    
    struct FlashLoanData {
        address initiator;
        BoostParams boostParams;
    }

    constructor(address _feeRecipient) {
        feeRecipient = _feeRecipient;
    }

    /**
     * @dev Initiates a position boost using flash loan
     * @param params Parameters for the boost operation
     * @param flashLoanProvider Address of the flash loan provider
     */
    function boostPosition(
        BoostParams calldata params,
        address flashLoanProvider
    ) external nonReentrant {
        require(supportedCLMMs[params.clmmProtocol], "CLMM not supported");
        require(supportedFlashLoanProviders[flashLoanProvider], "Flash loan provider not supported");
        
        // Encode data for flash loan callback
        bytes memory data = abi.encode(FlashLoanData({
            initiator: msg.sender,
            boostParams: params
        }));
        
        // Request flash loan
        IFlashLoanProvider(flashLoanProvider).flashLoan(
            address(this),
            params.tokenToBorrow,
            params.borrowAmount,
            data
        );
    }

    /**
     * @dev Callback function for flash loan providers
     * @param asset The asset being borrowed
     * @param amount The amount borrowed
     * @param premium The fee for the flash loan
     * @param initiator The address that initiated the flash loan
     * @param data Additional data for the operation
     */
    function executeOperation(
        address asset,
        uint256 amount,
        uint256 premium,
        address initiator,
        bytes calldata data
    ) external override returns (bool) {
        require(supportedFlashLoanProviders[msg.sender], "Unauthorized flash loan provider");
        
        FlashLoanData memory flashData = abi.decode(data, (FlashLoanData));
        require(initiator == address(this), "Invalid initiator");
        
        emit FlashLoanExecuted(asset, amount, premium, flashData.initiator);
        
        // Execute boost strategy
        uint256 profitGenerated = _executeBoostStrategy(
            flashData.boostParams,
            amount,
            premium
        );
        
        // Calculate and transfer protocol fee
        uint256 protocolFee = _calculateProtocolFee(profitGenerated);
        if (protocolFee > 0) {
            IERC20(asset).safeTransfer(feeRecipient, protocolFee);
        }
        
        // Transfer remaining profit to user
        uint256 userProfit = profitGenerated - protocolFee;
        if (userProfit > 0) {
            IERC20(asset).safeTransfer(flashData.initiator, userProfit);
        }
        
        // Approve flash loan provider to pull back the loan + premium
        uint256 totalDebt = amount + premium;
        IERC20(asset).safeApprove(msg.sender, totalDebt);
        
        emit PositionBoosted(
            flashData.initiator,
            flashData.boostParams.clmmProtocol,
            flashData.boostParams.positionId,
            amount,
            profitGenerated
        );
        
        return true;
    }

    /**
     * @dev Internal function to execute the boost strategy
     */
    function _executeBoostStrategy(
        BoostParams memory params,
        uint256 borrowedAmount,
        uint256 flashLoanPremium
    ) internal returns (uint256 profitGenerated) {
        // Get CLMM protocol interface
        ICLMM clmm = ICLMM(params.clmmProtocol);
        
        // Approve CLMM to use borrowed tokens
        IERC20(params.tokenToBorrow).safeApprove(params.clmmProtocol, borrowedAmount);
        
        // Execute strategy based on protocol type
        if (keccak256(params.strategyData) == keccak256("COMPOUND_POSITION")) {
            profitGenerated = _compoundPosition(clmm, params, borrowedAmount);
        } else if (keccak256(params.strategyData) == keccak256("ARBITRAGE")) {
            profitGenerated = _executeArbitrage(clmm, params, borrowedAmount);
        } else {
            // Custom strategy execution
            profitGenerated = clmm.executeCustomStrategy(
                params.positionId,
                borrowedAmount,
                params.strategyData
            );
        }
        
        // Ensure we have enough to repay flash loan
        require(
            profitGenerated + borrowedAmount >= borrowedAmount + flashLoanPremium,
            "Insufficient profit to repay flash loan"
        );
        
        return profitGenerated;
    }

    /**
     * @dev Compounds a position by adding liquidity and harvesting fees
     */
    function _compoundPosition(
        ICLMM clmm,
        BoostParams memory params,
        uint256 borrowedAmount
    ) internal returns (uint256) {
        // Add liquidity to position
        uint256 liquidityAdded = clmm.addLiquidity(
            params.positionId,
            params.tokenToBorrow,
            borrowedAmount
        );
        
        // Harvest accumulated fees
        uint256 feesHarvested = clmm.harvestFees(params.positionId);
        
        // Remove the added liquidity
        uint256 amountRecovered = clmm.removeLiquidity(
            params.positionId,
            liquidityAdded,
            params.tokenToBorrow
        );
        
        // Calculate profit (recovered amount + fees - borrowed amount)
        return amountRecovered + feesHarvested - borrowedAmount;
    }

    /**
     * @dev Executes arbitrage strategy using the position
     */
    function _executeArbitrage(
        ICLMM clmm,
        BoostParams memory params,
        uint256 borrowedAmount
    ) internal returns (uint256) {
        // This is a simplified arbitrage logic
        // In practice, this would involve complex routing and price calculations
        
        // Get current position details
        (uint256 token0Amount, uint256 token1Amount) = clmm.getPositionAmounts(params.positionId);
        
        // Execute arbitrage through the CLMM protocol
        uint256 arbitrageProfit = clmm.executeArbitrage(
            params.positionId,
            borrowedAmount,
            params.strategyData
        );
        
        return arbitrageProfit;
    }

    /**
     * @dev Calculates protocol fee based on profit
     */
    function _calculateProtocolFee(uint256 profit) internal view returns (uint256) {
        return (profit * defaultProtocolFee) / 10000;
    }

    // Admin functions
    
    function setSupportedCLMM(address clmm, bool supported) external onlyOwner {
        supportedCLMMs[clmm] = supported;
    }
    
    function setSupportedFlashLoanProvider(address provider, bool supported) external onlyOwner {
        supportedFlashLoanProviders[provider] = supported;
    }
    
    function setProtocolFee(uint256 newFee) external onlyOwner {
        require(newFee <= 1000, "Fee too high"); // Max 10%
        defaultProtocolFee = newFee;
    }
    
    function setFeeRecipient(address newRecipient) external onlyOwner {
        require(newRecipient != address(0), "Invalid recipient");
        feeRecipient = newRecipient;
    }
    
    // Emergency functions
    
    function emergencyWithdraw(address token) external onlyOwner {
        uint256 balance = IERC20(token).balanceOf(address(this));
        if (balance > 0) {
            IERC20(token).safeTransfer(owner(), balance);
        }
    }
}