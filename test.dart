
// GENERATED FILE - DO NOT EDIT MANUALLY
// Generated at: 2025-09-24T10:08:43.936Z
// Modular Contract Deployment

class ContractConfig {
  // Email Registry Contract
  static const String emailRegistryAddress = '0x988B6CFBf3332FF98FFBdED665b1F53a61f92612';
  static const String emailRegistryTx = '0xb5b2ba1fe4cc401839de7153c3c019c82a5c9e3c587d42afaff8a529b8839269';
  
  // Payment Manager Contract  
  static const String paymentManagerAddress = '0xeea2Fc1D255Fd28aA15c6c2324Ad40B03267f9c5';
  static const String paymentManagerTx = '0x56c431853687d40ee77828a82e16f0eff6f19b2773529256601c53873f23fe0a';
  
  // Basic Faucet Contract
  static const String basicFaucetAddress = '0xc34175A79ACca40392bECD22ff10fAeBFE780Ae7';
  static const String basicFaucetTx = '0x281aced3301f59612cf47d377d2f49588ed8bf4c035e32dffa76f169f9f430f2';
  
  // Network Info
  static const int chainId = 5777;
  static const String networkMode = 'local';
  static const String deployedAt = '2025-09-24T10:08:38.976Z';
  
  // Contract ABIs (for client-side interaction)
  static const String emailRegistryAbi = '''[{"anonymous":false,"inputs":[{"indexed":true,"internalType":"bytes32","name":"emailHash","type":"bytes32"},{"indexed":true,"internalType":"address","name":"wallet","type":"address"}],"name":"EmailRegistered","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"bytes32","name":"emailHash","type":"bytes32"},{"indexed":true,"internalType":"address","name":"oldWallet","type":"address"},{"indexed":true,"internalType":"address","name":"newWallet","type":"address"}],"name":"EmailUpdated","type":"event"},{"inputs":[{"internalType":"bytes32","name":"emailHash","type":"bytes32"},{"internalType":"address","name":"wallet","type":"address"}],"name":"registerEmail","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"bytes32","name":"emailHash","type":"bytes32"}],"name":"getWalletByEmail","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function","constant":true},{"inputs":[{"internalType":"address","name":"wallet","type":"address"}],"name":"getEmailByWallet","outputs":[{"internalType":"bytes32","name":"","type":"bytes32"}],"stateMutability":"view","type":"function","constant":true},{"inputs":[{"internalType":"bytes32","name":"emailHash","type":"bytes32"}],"name":"isEmailRegistered","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"view","type":"function","constant":true},{"inputs":[{"internalType":"address","name":"wallet","type":"address"}],"name":"isWalletRegistered","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"view","type":"function","constant":true},{"inputs":[{"internalType":"bytes32","name":"emailHash","type":"bytes32"}],"name":"getRegistrationTime","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function","constant":true},{"inputs":[{"internalType":"string","name":"email","type":"string"}],"name":"computeEmailHash","outputs":[{"internalType":"bytes32","name":"","type":"bytes32"}],"stateMutability":"pure","type":"function","constant":true}]''';
  static const String paymentManagerAbi = '''[{"inputs":[{"internalType":"address","name":"_emailRegistryAddress","type":"address"}],"stateMutability":"nonpayable","type":"constructor"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"from","type":"address"},{"indexed":true,"internalType":"address","name":"to","type":"address"},{"indexed":false,"internalType":"bytes32","name":"fromEmailHash","type":"bytes32"},{"indexed":true,"internalType":"bytes32","name":"toEmailHash","type":"bytes32"},{"indexed":false,"internalType":"uint256","name":"amount","type":"uint256"}],"name":"PaymentSent","type":"event"},{"inputs":[],"name":"emailRegistry","outputs":[{"internalType":"contract EmailRegistry","name":"","type":"address"}],"stateMutability":"view","type":"function","constant":true},{"inputs":[{"internalType":"bytes32","name":"toEmailHash","type":"bytes32"}],"name":"sendPaymentToEmail","outputs":[],"stateMutability":"payable","type":"function","payable":true},{"inputs":[{"internalType":"bytes32","name":"fromEmailHash","type":"bytes32"},{"internalType":"bytes32","name":"toEmailHash","type":"bytes32"}],"name":"sendPaymentByEmail","outputs":[],"stateMutability":"payable","type":"function","payable":true},{"inputs":[{"internalType":"bytes32[]","name":"toEmailHashes","type":"bytes32[]"},{"internalType":"uint256[]","name":"amounts","type":"uint256[]"}],"name":"batchPaymentToEmails","outputs":[],"stateMutability":"payable","type":"function","payable":true}]''';
  static const String basicFaucetAbi = '''[{"inputs":[],"stateMutability":"payable","type":"constructor","payable":true},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"user","type":"address"},{"indexed":false,"internalType":"uint256","name":"amount","type":"uint256"}],"name":"FaucetUsed","type":"event"},{"inputs":[],"name":"cooldown","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function","constant":true},{"inputs":[],"name":"faucetAmount","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function","constant":true},{"inputs":[{"internalType":"address","name":"","type":"address"}],"name":"lastRequest","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function","constant":true},{"inputs":[],"name":"owner","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function","constant":true},{"stateMutability":"payable","type":"receive","payable":true},{"inputs":[],"name":"requestFunds","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"uint256","name":"_amount","type":"uint256"}],"name":"setAmount","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[],"name":"withdraw","outputs":[],"stateMutability":"nonpayable","type":"function"}]''';
  
  // Legacy compatibility
  static const String contractAddress = '0x988B6CFBf3332FF98FFBdED665b1F53a61f92612';
  static const String contractName = 'LedgerlyModular';
  
  // Helper method to get contract info by name
  static Map<String, dynamic> getContractInfo(String contractName) {
    switch (contractName.toLowerCase()) {
      case 'emailregistry':
        return {
          'address': emailRegistryAddress,
          'abi': emailRegistryAbi,
          'tx': emailRegistryTx,
        };
      case 'paymentmanager':
        return {
          'address': paymentManagerAddress,
          'abi': paymentManagerAbi,
          'tx': paymentManagerTx,
        };
      case 'basicfaucet':
        return {
          'address': basicFaucetAddress,
          'abi': basicFaucetAbi,
          'tx': basicFaucetTx,
        };
      default:
        throw Exception('Unknown contract: $contractName');
    }
  }
  
  // Get all contract addresses
  static Map<String, String> getAllAddresses() {
    return {
      'EmailRegistry': emailRegistryAddress,
      'PaymentManager': paymentManagerAddress,
      'BasicFaucet': basicFaucetAddress,
    };
  }
}
