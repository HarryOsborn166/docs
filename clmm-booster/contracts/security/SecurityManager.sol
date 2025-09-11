// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

/**
 * @title SecurityManager
 * @dev Comprehensive security management for CLMM Booster
 */
contract SecurityManager is AccessControl, Pausable {
    using EnumerableSet for EnumerableSet.AddressSet;
    
    // Roles
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");
    bytes32 public constant GUARDIAN_ROLE = keccak256("GUARDIAN_ROLE");
    
    // Security parameters
    uint256 public maxFlashLoanAmount;
    uint256 public maxPositionsPerUser;
    uint256 public cooldownPeriod;
    uint256 public maxGasPrice;
    
    // Whitelists and blacklists
    EnumerableSet.AddressSet private whitelistedUsers;
    EnumerableSet.AddressSet private blacklistedUsers;
    EnumerableSet.AddressSet private whitelistedTokens;
    EnumerableSet.AddressSet private whitelistedProtocols;
    
    // Rate limiting
    mapping(address => uint256) public lastActionTimestamp;
    mapping(address => uint256) public dailyActionCount;
    mapping(address => uint256) public dailyVolumeUsed;
    uint256 public maxDailyActions = 10;
    uint256 public maxDailyVolume = 1000000 * 10**18; // 1M USD equivalent
    
    // Circuit breakers
    bool public emergencyMode;
    uint256 public emergencyModeActivatedAt;
    uint256 public constant EMERGENCY_MODE_DURATION = 24 hours;
    
    // Events
    event SecurityParameterUpdated(string parameter, uint256 oldValue, uint256 newValue);
    event UserWhitelisted(address indexed user);
    event UserBlacklisted(address indexed user);
    event EmergencyModeActivated(address indexed activator);
    event EmergencyModeDeactivated(address indexed deactivator);
    
    constructor() {
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _setupRole(ADMIN_ROLE, msg.sender);
        
        // Initialize security parameters
        maxFlashLoanAmount = 10000000 * 10**18; // 10M
        maxPositionsPerUser = 50;
        cooldownPeriod = 1 minutes;
        maxGasPrice = 500 gwei;
    }
    
    // Security checks
    
    modifier onlyWhitelisted(address user) {
        require(!blacklistedUsers.contains(user), "User is blacklisted");
        require(whitelistedUsers.contains(user) || !isWhitelistEnabled(), "User not whitelisted");
        _;
    }
    
    modifier rateLimited(address user) {
        require(block.timestamp >= lastActionTimestamp[user] + cooldownPeriod, "Cooldown period not met");
        
        // Reset daily counters if new day
        if (block.timestamp >= lastActionTimestamp[user] + 1 days) {
            dailyActionCount[user] = 0;
            dailyVolumeUsed[user] = 0;
        }
        
        require(dailyActionCount[user] < maxDailyActions, "Daily action limit exceeded");
        
        lastActionTimestamp[user] = block.timestamp;
        dailyActionCount[user]++;
        _;
    }
    
    modifier checkGasPrice() {
        require(tx.gasprice <= maxGasPrice, "Gas price too high");
        _;
    }
    
    modifier notInEmergency() {
        require(!emergencyMode || _isEmergencyExpired(), "Emergency mode active");
        if (_isEmergencyExpired() && emergencyMode) {
            emergencyMode = false;
            emit EmergencyModeDeactivated(address(0));
        }
        _;
    }
    
    // Security validation functions
    
    function validateFlashLoan(
        address user,
        address token,
        uint256 amount
    ) external view returns (bool) {
        if (emergencyMode && !_isEmergencyExpired()) return false;
        if (blacklistedUsers.contains(user)) return false;
        if (!whitelistedTokens.contains(token)) return false;
        if (amount > maxFlashLoanAmount) return false;
        if (dailyVolumeUsed[user] + amount > maxDailyVolume) return false;
        
        return true;
    }
    
    function validateProtocol(address protocol) external view returns (bool) {
        return whitelistedProtocols.contains(protocol);
    }
    
    function updateDailyVolume(address user, uint256 amount) external onlyRole(OPERATOR_ROLE) {
        dailyVolumeUsed[user] += amount;
    }
    
    // Whitelist management
    
    function addToWhitelist(address user) external onlyRole(ADMIN_ROLE) {
        whitelistedUsers.add(user);
        emit UserWhitelisted(user);
    }
    
    function removeFromWhitelist(address user) external onlyRole(ADMIN_ROLE) {
        whitelistedUsers.remove(user);
    }
    
    function addToBlacklist(address user) external onlyRole(GUARDIAN_ROLE) {
        blacklistedUsers.add(user);
        emit UserBlacklisted(user);
    }
    
    function removeFromBlacklist(address user) external onlyRole(ADMIN_ROLE) {
        blacklistedUsers.remove(user);
    }
    
    function whitelistToken(address token) external onlyRole(ADMIN_ROLE) {
        whitelistedTokens.add(token);
    }
    
    function whitelistProtocol(address protocol) external onlyRole(ADMIN_ROLE) {
        whitelistedProtocols.add(protocol);
    }
    
    // Parameter updates
    
    function setMaxFlashLoanAmount(uint256 newAmount) external onlyRole(ADMIN_ROLE) {
        uint256 oldAmount = maxFlashLoanAmount;
        maxFlashLoanAmount = newAmount;
        emit SecurityParameterUpdated("maxFlashLoanAmount", oldAmount, newAmount);
    }
    
    function setMaxDailyActions(uint256 newLimit) external onlyRole(ADMIN_ROLE) {
        uint256 oldLimit = maxDailyActions;
        maxDailyActions = newLimit;
        emit SecurityParameterUpdated("maxDailyActions", oldLimit, newLimit);
    }
    
    function setMaxDailyVolume(uint256 newVolume) external onlyRole(ADMIN_ROLE) {
        uint256 oldVolume = maxDailyVolume;
        maxDailyVolume = newVolume;
        emit SecurityParameterUpdated("maxDailyVolume", oldVolume, newVolume);
    }
    
    function setCooldownPeriod(uint256 newPeriod) external onlyRole(ADMIN_ROLE) {
        uint256 oldPeriod = cooldownPeriod;
        cooldownPeriod = newPeriod;
        emit SecurityParameterUpdated("cooldownPeriod", oldPeriod, newPeriod);
    }
    
    // Emergency functions
    
    function activateEmergencyMode() external onlyRole(GUARDIAN_ROLE) {
        emergencyMode = true;
        emergencyModeActivatedAt = block.timestamp;
        emit EmergencyModeActivated(msg.sender);
    }
    
    function deactivateEmergencyMode() external onlyRole(ADMIN_ROLE) {
        emergencyMode = false;
        emit EmergencyModeDeactivated(msg.sender);
    }
    
    function pause() external onlyRole(GUARDIAN_ROLE) {
        _pause();
    }
    
    function unpause() external onlyRole(ADMIN_ROLE) {
        _unpause();
    }
    
    // View functions
    
    function isWhitelistEnabled() public pure returns (bool) {
        return true; // Can be made configurable
    }
    
    function isUserWhitelisted(address user) external view returns (bool) {
        return whitelistedUsers.contains(user);
    }
    
    function isUserBlacklisted(address user) external view returns (bool) {
        return blacklistedUsers.contains(user);
    }
    
    function isTokenWhitelisted(address token) external view returns (bool) {
        return whitelistedTokens.contains(token);
    }
    
    function getWhitelistedTokens() external view returns (address[] memory) {
        return whitelistedTokens.values();
    }
    
    function getWhitelistedProtocols() external view returns (address[] memory) {
        return whitelistedProtocols.values();
    }
    
    function _isEmergencyExpired() internal view returns (bool) {
        return block.timestamp >= emergencyModeActivatedAt + EMERGENCY_MODE_DURATION;
    }
}