// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./CLMMBooster.sol";
import "./security/SecurityManager.sol";
import "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";

/**
 * @title CLMMBoosterV2
 * @dev Enhanced version with security features and gas optimizations
 */
contract CLMMBoosterV2 is CLMMBooster, Initializable, UUPSUpgradeable {
    SecurityManager public securityManager;
    
    // Gas optimization: Pack struct
    struct OptimizedBoostParams {
        address clmmProtocol;
        address tokenToBorrow;
        uint128 borrowAmount;
        uint64 positionId;
        uint32 strategyId;
        bytes strategyData;
    }
    
    // Cache for gas optimization
    mapping(bytes32 => uint256) private strategyGasEstimates;
    mapping(address => mapping(address => uint256)) private lastProfitability;
    
    // Events
    event SecurityManagerUpdated(address indexed oldManager, address indexed newManager);
    event GasEstimateUpdated(bytes32 indexed strategyHash, uint256 gasEstimate);
    
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }
    
    function initialize(
        address _feeRecipient,
        address _securityManager
    ) public initializer {
        __Ownable_init();
        __ReentrancyGuard_init();
        __UUPSUpgradeable_init();
        
        feeRecipient = _feeRecipient;
        securityManager = SecurityManager(_securityManager);
    }
    
    /**
     * @dev Enhanced boost position with security checks and gas optimizations
     */
    function boostPositionV2(
        OptimizedBoostParams calldata params,
        address flashLoanProvider
    ) external nonReentrant {
        // Security checks
        require(
            securityManager.validateFlashLoan(
                msg.sender, 
                params.tokenToBorrow, 
                params.borrowAmount
            ),
            "Security validation failed"
        );
        
        require(
            securityManager.validateProtocol(params.clmmProtocol),
            "Protocol not whitelisted"
        );
        
        // Gas optimization: Check estimated profitability
        bytes32 strategyHash = keccak256(abi.encode(
            params.clmmProtocol,
            params.strategyId,
            params.tokenToBorrow
        ));
        
        uint256 estimatedGas = strategyGasEstimates[strategyHash];
        if (estimatedGas > 0) {
            uint256 gasCost = estimatedGas * tx.gasprice;
            uint256 minProfit = gasCost * 150 / 100; // Require 50% profit margin
            
            uint256 lastProfit = lastProfitability[params.clmmProtocol][params.tokenToBorrow];
            require(lastProfit >= minProfit, "Strategy not profitable");
        }
        
        // Convert to standard params and execute
        BoostParams memory standardParams = BoostParams({
            clmmProtocol: params.clmmProtocol,
            positionId: params.positionId,
            tokenToBorrow: params.tokenToBorrow,
            borrowAmount: params.borrowAmount,
            strategyData: params.strategyData
        });
        
        // Track gas usage
        uint256 gasStart = gasleft();
        
        // Execute boost
        super.boostPosition(standardParams, flashLoanProvider);
        
        // Update gas estimate
        uint256 gasUsed = gasStart - gasleft();
        strategyGasEstimates[strategyHash] = gasUsed;
        emit GasEstimateUpdated(strategyHash, gasUsed);
        
        // Update security manager volume
        securityManager.updateDailyVolume(msg.sender, params.borrowAmount);
    }
    
    /**
     * @dev Batch boost multiple positions
     */
    function batchBoostPositions(
        OptimizedBoostParams[] calldata paramsArray,
        address[] calldata flashLoanProviders
    ) external nonReentrant {
        require(paramsArray.length == flashLoanProviders.length, "Array length mismatch");
        require(paramsArray.length <= 10, "Too many positions");
        
        for (uint256 i = 0; i < paramsArray.length; i++) {
            boostPositionV2(paramsArray[i], flashLoanProviders[i]);
        }
    }
    
    /**
     * @dev Override executeOperation with additional checks
     */
    function executeOperation(
        address asset,
        uint256 amount,
        uint256 premium,
        address initiator,
        bytes calldata data
    ) external override returns (bool) {
        // Additional security check
        require(!securityManager.emergencyMode(), "Emergency mode active");
        
        // Execute parent logic
        bool success = super.executeOperation(asset, amount, premium, initiator, data);
        
        // Update profitability tracking
        if (success) {
            FlashLoanData memory flashData = abi.decode(data, (FlashLoanData));
            uint256 profit = IERC20(asset).balanceOf(flashData.initiator);
            lastProfitability[flashData.boostParams.clmmProtocol][asset] = profit;
        }
        
        return success;
    }
    
    /**
     * @dev Set new security manager
     */
    function setSecurityManager(address newManager) external onlyOwner {
        require(newManager != address(0), "Invalid manager");
        address oldManager = address(securityManager);
        securityManager = SecurityManager(newManager);
        emit SecurityManagerUpdated(oldManager, newManager);
    }
    
    /**
     * @dev Required by UUPSUpgradeable
     */
    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}
    
    /**
     * @dev Get estimated gas for strategy
     */
    function getStrategyGasEstimate(
        address clmmProtocol,
        uint32 strategyId,
        address token
    ) external view returns (uint256) {
        bytes32 strategyHash = keccak256(abi.encode(clmmProtocol, strategyId, token));
        return strategyGasEstimates[strategyHash];
    }
    
    /**
     * @dev Check if strategy is profitable
     */
    function isStrategyProfitable(
        address clmmProtocol,
        address token,
        uint256 amount
    ) external view returns (bool profitable, uint256 estimatedProfit) {
        uint256 lastProfit = lastProfitability[clmmProtocol][token];
        uint256 gasCost = tx.gasprice * 500000; // Estimated gas usage
        
        profitable = lastProfit > gasCost * 150 / 100;
        estimatedProfit = profitable ? lastProfit - gasCost : 0;
    }
}