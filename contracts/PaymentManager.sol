// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./EmailRegistry.sol";

/**
 * @title PaymentManager
 * @dev Handles ETH payments between email addresses
 * Single responsibility: Payment processing only
 */
contract PaymentManager {
    EmailRegistry public emailRegistry;
    
    // Events
    event PaymentSent(
        address indexed from,
        address indexed to,
        bytes32 fromEmailHash,
        bytes32 indexed toEmailHash,
        uint256 amount
    );
    
    constructor(address _emailRegistryAddress) {
        require(_emailRegistryAddress != address(0), "Invalid registry address");
        emailRegistry = EmailRegistry(_emailRegistryAddress);
    }
    
    /**
     * @dev Send payment to an email address
     * @param toEmailHash The recipient's email hash
     */
    function sendPaymentToEmail(bytes32 toEmailHash) external payable {
        require(msg.value > 0, "Payment amount must be greater than 0");
        
        address payable toWallet = payable(emailRegistry.getWalletByEmail(toEmailHash));
        require(toWallet != address(0), "Recipient email not registered");
        
        // Get sender's email hash (if registered)
        bytes32 fromEmailHash = emailRegistry.getEmailByWallet(msg.sender);
        
        // Send payment
        (bool sent, ) = toWallet.call{value: msg.value}("");
        require(sent, "Failed to send payment");
        
        emit PaymentSent(msg.sender, toWallet, fromEmailHash, toEmailHash, msg.value);
    }
    
    /**
     * @dev Send payment from one specific email to another (requires authorization)
     * @param fromEmailHash The sender's email hash
     * @param toEmailHash The recipient's email hash
     */
    function sendPaymentByEmail(bytes32 fromEmailHash, bytes32 toEmailHash) external payable {
        require(msg.value > 0, "Payment amount must be greater than 0");
        
        address fromWallet = emailRegistry.getWalletByEmail(fromEmailHash);
        require(fromWallet == msg.sender, "Sender not authorized for this email");
        
        address payable toWallet = payable(emailRegistry.getWalletByEmail(toEmailHash));
        require(toWallet != address(0), "Recipient email not registered");
        
        // Send payment
        (bool sent, ) = toWallet.call{value: msg.value}("");
        require(sent, "Failed to send payment");
        
        emit PaymentSent(msg.sender, toWallet, fromEmailHash, toEmailHash, msg.value);
    }
    
    /**
     * @dev Batch payment to multiple email addresses
     * @param toEmailHashes Array of recipient email hashes
     * @param amounts Array of amounts to send (must match email array length)
     */
    function batchPaymentToEmails(bytes32[] calldata toEmailHashes, uint256[] calldata amounts) external payable {
        require(toEmailHashes.length == amounts.length, "Arrays length mismatch");
        require(toEmailHashes.length > 0, "No recipients provided");
        
        uint256 totalRequired = 0;
        for (uint256 i = 0; i < amounts.length; i++) {
            totalRequired += amounts[i];
        }
        require(msg.value >= totalRequired, "Insufficient payment amount");
        
        bytes32 fromEmailHash = emailRegistry.getEmailByWallet(msg.sender);
        
        for (uint256 i = 0; i < toEmailHashes.length; i++) {
            address payable toWallet = payable(emailRegistry.getWalletByEmail(toEmailHashes[i]));
            require(toWallet != address(0), "Recipient email not registered");
            
            if (amounts[i] > 0) {
                (bool sent, ) = toWallet.call{value: amounts[i]}("");
                require(sent, "Failed to send payment");
                
                emit PaymentSent(msg.sender, toWallet, fromEmailHash, toEmailHashes[i], amounts[i]);
            }
        }
        
        // Refund excess if any
        uint256 excess = msg.value - totalRequired;
        if (excess > 0) {
            (bool refunded, ) = payable(msg.sender).call{value: excess}("");
            require(refunded, "Failed to refund excess");
        }
    }
}