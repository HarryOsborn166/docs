// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@aave/core-v3/contracts/flashloan/interfaces/IFlashLoanReceiver.sol";
import "@aave/core-v3/contracts/interfaces/IPool.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "../interfaces/IFlashLoanProvider.sol";
import "../interfaces/IFlashLoanReceiver.sol" as LocalInterfaces;

/**
 * @title AaveFlashLoanProvider
 * @dev Adapter for Aave V3 flash loans
 */
contract AaveFlashLoanProvider is IFlashLoanProvider, IFlashLoanReceiver, Ownable {
    IPool public immutable AAVE_POOL;
    
    mapping(bytes32 => FlashLoanRequest) private pendingRequests;
    
    struct FlashLoanRequest {
        address receiver;
        bytes originalData;
        bool active;
    }
    
    constructor(address _aavePool) {
        AAVE_POOL = IPool(_aavePool);
    }
    
    function flashLoan(
        address receiver,
        address asset,
        uint256 amount,
        bytes calldata data
    ) external override {
        // Create unique request ID
        bytes32 requestId = keccak256(abi.encodePacked(receiver, asset, amount, block.timestamp));
        
        // Store request data
        pendingRequests[requestId] = FlashLoanRequest({
            receiver: receiver,
            originalData: data,
            active: true
        });
        
        // Prepare Aave flash loan
        address[] memory assets = new address[](1);
        assets[0] = asset;
        
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = amount;
        
        uint256[] memory modes = new uint256[](1);
        modes[0] = 0; // No debt mode
        
        bytes memory params = abi.encode(requestId);
        
        // Execute flash loan
        AAVE_POOL.flashLoan(
            address(this),
            assets,
            amounts,
            modes,
            address(this),
            params,
            0 // referral code
        );
    }
    
    function executeOperation(
        address[] calldata assets,
        uint256[] calldata amounts,
        uint256[] calldata premiums,
        address initiator,
        bytes calldata params
    ) external override returns (bool) {
        require(msg.sender == address(AAVE_POOL), "Unauthorized");
        require(initiator == address(this), "Invalid initiator");
        
        bytes32 requestId = abi.decode(params, (bytes32));
        FlashLoanRequest memory request = pendingRequests[requestId];
        require(request.active, "Invalid request");
        
        // Clean up
        delete pendingRequests[requestId];
        
        // Transfer borrowed assets to receiver
        IERC20(assets[0]).transfer(request.receiver, amounts[0]);
        
        // Call receiver
        bool success = LocalInterfaces.IFlashLoanReceiver(request.receiver).executeOperation(
            assets[0],
            amounts[0],
            premiums[0],
            address(this),
            request.originalData
        );
        
        require(success, "Receiver execution failed");
        
        // Pull back the owed amount
        uint256 amountOwed = amounts[0] + premiums[0];
        IERC20(assets[0]).transferFrom(request.receiver, address(this), amountOwed);
        
        // Approve Aave to pull the funds
        IERC20(assets[0]).approve(address(AAVE_POOL), amountOwed);
        
        return true;
    }
}