# Flutter Integration Guide for Ledgerly Blockchain Middleware

This guide explains how to connect your Flutter app to the Node.js blockchain middleware and PHP backend for user payments, transaction status, and history.

---

## 1. Setup HTTP Requests in Flutter

Use the `http` package:
```dart
import 'package:http/http.dart' as http;
import 'dart:convert';

final baseUrl = 'http://localhost:3001'; // Or your server IP/URL
```

---

## 2. Payment Endpoints

### Send Payment (Deployer)
```dart
Future<void> sendPayment(String toWallet, String amountEth) async {
  final response = await http.post(
    Uri.parse('$baseUrl/payment/send'),
    headers: {'Content-Type': 'application/json'},
    body: jsonEncode({'toWallet': toWallet, 'amountEth': amountEth}),
  );
  print(response.body); // Contains txHash
}
```

### User-to-User Payment
```dart
Future<void> sendPaymentFrom(String fromWallet, String toWallet, String amountEth) async {
  final response = await http.post(
    Uri.parse('$baseUrl/payment/send-from'),
    headers: {'Content-Type': 'application/json'},
    body: jsonEncode({'fromWallet': fromWallet, 'toWallet': toWallet, 'amountEth': amountEth}),
  );
  print(response.body); // Contains txHash
}
```

### Email-to-Email Payment
```dart
Future<void> emailToEmailPayment(String fromEmail, String toEmail, String amountEth, String memo) async {
  final response = await http.post(
    Uri.parse('$baseUrl/payment/email-to-email'),
    headers: {'Content-Type': 'application/json'},
    body: jsonEncode({'fromEmail': fromEmail, 'toEmail': toEmail, 'amountEth': amountEth, 'memo': memo}),
  );
  print(response.body); // Contains txHash and status
}
```

---

## 3. Check Transaction Status

```dart
Future<void> checkTxStatus(String txHash) async {
  final response = await http.get(
    Uri.parse('$baseUrl/payment/status/$txHash'),
    headers: {'Content-Type': 'application/json'},
  );
  print(response.body); // Contains status: pending/completed/failed
}
```

---

## 4. Get Transaction History & Summary (PHP Backend)

```dart
final phpBaseUrl = 'https://ledgerly.hivizstudios.com/backend_example';
Future<void> getTransactionSummary(String userId) async {
  final response = await http.get(
    Uri.parse('$phpBaseUrl/transaction_api.php?action=summary&user_id=$userId'),
    headers: {'Content-Type': 'application/json'},
  );
  print(response.body); // Contains transaction summary
}
```

---

## 5. Best Practices
- Handle errors and show user-friendly messages.
- Use HTTPS endpoints in production.
- Store wallet addresses securely on the device.
- Use PHP backend endpoints for user and transaction history if needed.

---

## 6. Example Workflow
1. User enters payment details (emails or wallet addresses).
2. Flutter calls the appropriate payment endpoint.
3. Middleware returns a transaction hash.
4. Flutter polls `/payment/status/{txHash}` until status is `completed` or `failed`.
5. Optionally, update UI with transaction history from PHP backend.

---

For more advanced integration, see the middleware API documentation or ask for specific Flutter code samples.
