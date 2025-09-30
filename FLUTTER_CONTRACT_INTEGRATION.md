# Flutter Integration Guide: Dynamic Smart Contract Loading

This guide explains how to dynamically fetch and use deployed smart contract details in your Flutter app using your backend API and web3dart.

---

## 1. Deployment Pipeline Outcome
- **Contracts Deployed:**
  - `EmailRegistry` (address: e.g., 0xC89Ce4735882C9F0f0FE26686c53074E09B0D550)
  - `PaymentManager` (address: e.g., 0xe982E462b094850F12AF94d21D470e21bE9D0E9C)
- **Contract details (address, ABI, etc.) are posted to your PHP backend.**
- **Flutter will fetch contract info from:**
  `https://ledgerly.hivizstudios.com/backend_example/save_contract.php?contract_name=PaymentManager&chain_id=1337`
  (and similarly for EmailRegistry)

---

## 2. Example PHP Backend Response

```
{
  "success": true,
  "contracts": [
    {
      "contract_name": "PaymentManager",
      "contract_address": "0xe982E462b094850F12AF94d21D470e21bE9D0E9C",
      "chain_id": 1337,
      "abi": "[{...}]", // JSON string
      "deployment_tx": "...",
      "network_mode": "local",
      "version": "v1.0.0",
      "deployed_at": "2025-09-28T12:34:56Z"
    }
  ],
  "count": 1
}
```

---

## 3. Flutter Integration Steps

### a. Fetch Contract Info

```dart
import 'dart:convert';
import 'package:http/http.dart' as http;

Future<Map<String, dynamic>> fetchContract(String contractName, int chainId) async {
  final url = 'https://ledgerly.hivizstudios.com/backend_example/save_contract.php?contract_name=$contractName&chain_id=$chainId';
  final response = await http.get(Uri.parse(url));
  final data = jsonDecode(response.body);
  if (data['success'] && data['count'] > 0) {
    return data['contracts'][0];
  } else {
    throw Exception('Contract not found');
  }
}
```

### b. Parse ABI and Address

```dart
final contract = await fetchContract('PaymentManager', 1337);
final abi = jsonDecode(contract['abi']);
final address = contract['contract_address'];
```

### c. Use with web3dart

```dart
import 'package:web3dart/web3dart.dart';

final client = Web3Client('http://127.0.0.1:8545', Client());
final contractAddr = EthereumAddress.fromHex(address);
final contractAbi = ContractAbi.fromJson(jsonEncode(abi), 'PaymentManager');
final paymentManager = DeployedContract(contractAbi, contractAddr);

// Example: call a function
final result = await client.call(
  contract: paymentManager,
  function: paymentManager.function('sendPaymentToEmail'),
  params: [/* your params here */],
);
```

---

## 4. Summary
- Deploy contracts → Register with backend → Fetch in Flutter → Parse ABI/address → Use with web3dart.
- You do NOT hardcode contract addresses or ABIs in Flutter; always fetch from backend for flexibility and upgradability.

---

**Need a ready-to-use Flutter service class or more function call examples? Just ask!**
