// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/// @title PaymentManager (hardened)
// @notice Lightweight ETH payment processor with batch support, refunds, withdraws and reentrancy guard.
contract PaymentManager {
    /* ========== STATE ========== */
    address public owner;

    // simple reentrancy guard
    uint8 private _status;
    uint8 private constant _NOT_ENTERED = 1;
    uint8 private constant _ENTERED = 2;

    /* ========== EVENTS ========== */
    event PaymentSent(address indexed from, address indexed to, uint256 amount);
    event BatchCompleted(address indexed from, uint256 totalSent, uint256 refunded);
    event Refunded(address indexed to, uint256 amount);
    event Withdrawn(address indexed to, uint256 amount);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    /* ========== MODIFIERS ========== */
    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    modifier nonReentrant() {
        require(_status != _ENTERED, "ReentrancyGuard: reentrant call");
        _status = _ENTERED;
        _;
        _status = _NOT_ENTERED;
    }

    constructor() {
        owner = msg.sender;
        _status = _NOT_ENTERED;
    }

    /* ========== RECEIVE / FALLBACK ========== */
    // allow contract to receive ETH (owner can top-up if needed)
    receive() external payable {}

    fallback() external payable {}

    /* ========== OWNER ACTIONS ========== */
    /// @notice Withdraw all ETH from contract to owner
    function withdrawAll() external onlyOwner nonReentrant {
        uint256 bal = address(this).balance;
        require(bal > 0, "No balance");
        (bool sent, ) = payable(owner).call{value: bal}("");
        require(sent, "Withdraw failed");
        emit Withdrawn(owner, bal);
    }

    /// @notice Emergency withdraw a specific amount (owner)
    function withdrawAmount(uint256 amount) external onlyOwner nonReentrant {
        require(amount <= address(this).balance, "Insufficient contract balance");
        (bool sent, ) = payable(owner).call{value: amount}("");
        require(sent, "Withdraw failed");
        emit Withdrawn(owner, amount);
    }

    /// @notice Transfer ownership
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Zero owner");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    /* ========== VIEW ========== */
    function contractBalance() external view returns (uint256) {
        return address(this).balance;
    }

    /* ========== PAYMENT FUNCTIONS ========== */

    /// @notice Send ETH to a single wallet (msg.value must equal amount)
    function sendPaymentToWallet(address payable toWallet) external payable nonReentrant {
        require(msg.value > 0, "Payment must be > 0");
        require(toWallet != address(0), "Invalid recipient");

        (bool sent, ) = toWallet.call{value: msg.value}("");
        require(sent, "Transfer failed");

        emit PaymentSent(msg.sender, toWallet, msg.value);
    }

    /// @notice Send ETH from msg.sender to another wallet (msg.value is forwarded)
    /// @dev This function is logically same as sendPaymentToWallet but kept for explicit API parity
    function sendPaymentFromWallet(address payable toWallet) external payable nonReentrant {
        require(msg.value > 0, "Payment must be > 0");
        require(toWallet != address(0), "Invalid recipient");

        (bool sent, ) = toWallet.call{value: msg.value}("");
        require(sent, "Transfer failed");

        emit PaymentSent(msg.sender, toWallet, msg.value);
    }

    /// @notice Batch payment in a single call.
    /// @param toWallets List of recipient addresses
    /// @param amounts Corresponding list of amounts (wei)
    ///
    /// Important: this function attempts to make payments in one transaction.
    /// If gas for the whole batch is insufficient, the entire call will revert.
    /// The function refunds any leftover ETH (msg.value - sum(amounts)) to the sender.
    function batchPaymentToWallets(address payable[] calldata toWallets, uint256[] calldata amounts)
        external
        payable
        nonReentrant
    {
        uint256 n = toWallets.length;
        require(n > 0, "No recipients");
        require(n == amounts.length, "Length mismatch");

        uint256 remaining = msg.value;
        uint256 totalSent = 0;

        // single-pass: for each recipient check remaining >= amount, send amount, decrement remaining
        for (uint256 i = 0; i < n; i++) {
            address payable to = toWallets[i];
            uint256 amt = amounts[i];

            require(to != address(0), "Invalid recipient address");

            if (amt == 0) {
                continue; // skip zero-amount entries (still counted)
            }

            require(remaining >= amt, "Insufficient msg.value for batch");

            // decrement remaining before external call to reduce reentrancy risk
            remaining -= amt;
            totalSent += amt;

            (bool sent, ) = to.call{value: amt}("");
            require(sent, "Transfer to recipient failed");

            emit PaymentSent(msg.sender, to, amt);
        }

        // refund remaining back to sender (if any)
        if (remaining > 0) {
            (bool refunded, ) = payable(msg.sender).call{value: remaining}("");
            require(refunded, "Refund failed");
            emit Refunded(msg.sender, remaining);
        }

        emit BatchCompleted(msg.sender, totalSent, remaining);
    }
}
