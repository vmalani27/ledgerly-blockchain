// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title BasicFaucet
 * @dev Ultra-simple faucet for development only
 */
contract BasicFaucet {
    address public owner;
    uint256 public faucetAmount = 0.5 ether;
    mapping(address => uint256) public lastRequest;
    uint256 public cooldown = 1 hours; // Reduced cooldown
    
    event FaucetUsed(address indexed user, uint256 amount);
    
    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }
    
    constructor() payable {
        owner = msg.sender;
    }
    
    receive() external payable {}
    
    function requestFunds() external {
        require(address(this).balance >= faucetAmount, "Empty faucet");
        require(block.timestamp >= lastRequest[msg.sender] + cooldown, "Too soon");
        
        lastRequest[msg.sender] = block.timestamp;
        
        (bool sent, ) = payable(msg.sender).call{value: faucetAmount}("");
        require(sent, "Transfer failed");
        
        emit FaucetUsed(msg.sender, faucetAmount);
    }
    
    function setAmount(uint256 _amount) external onlyOwner {
        faucetAmount = _amount;
    }
    
    function withdraw() external onlyOwner {
        (bool sent, ) = payable(owner).call{value: address(this).balance}("");
        require(sent, "Withdraw failed");
    }
}