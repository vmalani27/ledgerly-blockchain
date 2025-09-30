// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title EmailRegistry
 * @dev Core contract for mapping email addresses to wallet addresses
 * Single responsibility: Email-to-wallet mapping only
 */
contract EmailRegistry {
    // Core mapping: email hash => wallet address
    mapping(bytes32 => address) private emailToWallet;
    
    // Reverse lookup: wallet => email hash (for efficient lookups)
    mapping(address => bytes32) private walletToEmail;
    
    // Track registration timestamps
    mapping(bytes32 => uint256) private registrationTimestamps;
    
    // Events
    event EmailRegistered(bytes32 indexed emailHash, address indexed wallet);
    event EmailUpdated(bytes32 indexed emailHash, address indexed oldWallet, address indexed newWallet);
    
    /**
     * @dev Register or update an email-to-wallet mapping
     * @param emailHash The keccak256 hash of the email address
     * @param wallet The wallet address to associate with this email
     */
    function registerEmail(bytes32 emailHash, address wallet) external {
        require(wallet != address(0), "Cannot register zero address");
        require(emailHash != bytes32(0), "Invalid email hash");
        
        address currentWallet = emailToWallet[emailHash];
        
        // If email is already registered, ensure it's being updated by the current wallet owner
        if (currentWallet != address(0)) {
            require(currentWallet == msg.sender, "Email already registered to another wallet");
            
            // Clear old reverse lookup
            delete walletToEmail[currentWallet];
            
            emit EmailUpdated(emailHash, currentWallet, wallet);
        } else {
            // New registration
            registrationTimestamps[emailHash] = block.timestamp;
            emit EmailRegistered(emailHash, wallet);
        }
        
        // Set new mapping
        emailToWallet[emailHash] = wallet;
        walletToEmail[wallet] = emailHash;
    }
    
    /**
     * @dev Get wallet address associated with email hash
     * @param emailHash The keccak256 hash of the email address
     * @return The wallet address associated with this email
     */
    function getWalletByEmail(bytes32 emailHash) external view returns (address) {
        return emailToWallet[emailHash];
    }
    
    /**
     * @dev Get email hash associated with wallet address
     * @param wallet The wallet address
     * @return The email hash associated with this wallet
     */
    function getEmailByWallet(address wallet) external view returns (bytes32) {
        return walletToEmail[wallet];
    }
    
    /**
     * @dev Check if an email is registered
     * @param emailHash The keccak256 hash of the email address
     * @return True if the email is registered
     */
    function isEmailRegistered(bytes32 emailHash) external view returns (bool) {
        return emailToWallet[emailHash] != address(0);
    }
    
    /**
     * @dev Check if a wallet is registered
     * @param wallet The wallet address
     * @return True if the wallet is registered
     */
    function isWalletRegistered(address wallet) external view returns (bool) {
        return walletToEmail[wallet] != bytes32(0);
    }
    
    /**
     * @dev Get registration timestamp
     * @param emailHash The keccak256 hash of the email address
     * @return The timestamp when this email was registered
     */
    function getRegistrationTime(bytes32 emailHash) external view returns (uint256) {
        return registrationTimestamps[emailHash];
    }
    
    /**
     * @dev Utility function to compute email hash
     * @param email The email address as a string
     * @return The keccak256 hash of the email
     */
    function computeEmailHash(string memory email) external pure returns (bytes32) {
        return keccak256(abi.encodePacked(email));
    }
}