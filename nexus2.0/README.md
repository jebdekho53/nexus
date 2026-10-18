# Nexus 2.0 - Standalone Booking & Payment Engine

Nexus 2.0 is a 100% clean, extracted, and human-readable booking and payment engine decoupled from the legacy Matrix obfuscation and license checks.

## Architecture & Modules

### 1. `booking/`
- **`browser-booking.cjs`**: Browser booking orchestration, passenger form processing, submission loop, and captcha hooks.
- **`rules.cjs`**: Passenger validation rules, senior citizen lower-berth auto allotment, Tatkal/General opening hours, and quota checks.
- **`safe-call.cjs`**: Akamai-safe direct HTTP engine with rate-limit handling, CSRF resync, and backoff pacing.
- **`availability.cjs`**: Train seat availability polling and Tatkal slot gating.
- **`railone-submit.cjs` & `railone-payment.cjs`**: Direct booking submit and payment flow.
- **`transport-retry.cjs`**: Sensor-preserving HTTP transport with retries.

### 2. `payment/`
- **`payment-init.cjs`**: Payment session initialization and gateway routing.
- **`gateway-redirect.cjs`**: HTML payment form parsing and auto-redirect submission.
- **`gateway-dispatch.cjs`**: Gateway routing (Paytm, PhonePe, Razorpay, UPI).
- **`paytm*.cjs`**: Paytm QR, status polling, WebSocket notification handler.
- **`phonepe*.cjs`**: PhonePe direct transport and verification.
- **`razorpay*.cjs`**: Razorpay transport and checkout handler.

## How to Run

### Run the Pipeline Demo:
```bash
node index.cjs
```

### Run Module Verification Tests:
```bash
node test.cjs
```
