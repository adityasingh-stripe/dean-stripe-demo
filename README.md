# TDG Hotel Booking - Stripe Payment Integration

This integration provides a comprehensive Stripe Payment Element solution for hotel booking with proper customer management for future off-session payments.

## Setup Instructions

1. **Install Dependencies**

   ```bash
   npm install
   ```

2. **Configure Stripe Keys**

   - Create a `.env` file in the project root with your Stripe keys:
     ```
     STRIPE_SECRET_KEY=sk_test_your_secret_key_here
     STRIPE_PUBLISHABLE_KEY=pk_test_your_publishable_key_here
     PORT=3000
     ```
   - Get your API keys from [Stripe Dashboard](https://dashboard.stripe.com/apikeys)
   - Also update the publishable key in `html/index.html` (search for `pk_test_REPLACE_WITH_YOUR_PUBLISHABLE_KEY`)

3. **Start the Server**

   ```bash
   npm start
   ```

   For development with auto-reload:

   ```bash
   npm run dev
   ```

## Payment Flows

### Two Payment Flow Options

#### **1. Full Payment Flow** (`/checkout?flow=full`)

- **Purpose**: Immediate payment collection
- **Creates**: PaymentIntent with `setup_future_usage=off_session`
- **Result**: Payment processed + payment method saved for future use

#### **2. Deferred Payment Flow** (`/checkout?flow=deferred`)

- **Purpose**: Save payment method without charging
- **Creates**: SetupIntent for off-session usage
- **Result**: Payment method saved + customer created for future charging

### Customer Management Strategy

#### **Step 1: Empty Customer Creation**

```javascript
// Both flows create empty customer first
const customer = await stripe.customers.create({
  // Created with minimal info, updated later with real form data
});

// Associate customer ID with PaymentIntent/SetupIntent
const intentData = {
  customer: customerId,
  // ... other parameters
};
```

#### **Step 2: Payment/Setup Confirmation**

- User fills out guest information form with complete billing details
- Billing details passed to `stripe.confirmPayment()` or `stripe.confirmSetup()`
- Payment method automatically attached to customer

#### **Step 3: Customer Update (Post-Confirmation)**

```javascript
// AFTER successful confirmation, update customer with real data
await fetch("/update-customer", {
  body: JSON.stringify({
    customer_id: customerId,
    billing_details: {
      name: "John Doe",
      email: "john@example.com",
      phone: "+44 20 1234 5678",
      address: {
        line1: "126 Loampit Vale",
        city: "London",
        postal_code: "SE13 7SN",
        country: "GB",
      },
    },
  }),
});
```

## API Endpoints

### **POST /create-payment-intent**

- Creates empty customer + PaymentIntent for full payment
- Returns: `clientSecret`, `paymentIntentId`, `customerId`

### **POST /create-setup-intent**

- Creates empty customer + SetupIntent for deferred payment
- Returns: `clientSecret`, `setupIntentId`, `customerId`

### **POST /update-customer**

- Updates customer with complete billing details after confirmation
- Called automatically after successful payment/setup

### **GET /success**

- Handles success redirects for both payment flows
- Supports: `?payment_intent=pi_xxx` and `?setup_intent=seti_xxx`

## Key Implementation Details

### **Billing Details Collection**

- Complete billing details collected from existing guest information form
- Includes: name, email, phone, full address (including optional billing address)
- Billing details passed to Stripe for optimal authorization rates

### **Customer Management for MIT Payments**

1. **Empty customer created** - immediate customer ID available
2. **PaymentIntent/SetupIntent** - associated with customer ID
3. **Payment confirmation** - billing details sent to networks
4. **Customer update** - complete customer profile for future payments
5. **Ready for off-session** - saved payment methods + complete customer data

### **Payment Method Saving**

- **PaymentIntent**: Uses `setup_future_usage=off_session`
- **SetupIntent**: Configured for off-session usage
- **Payment methods** automatically attached to customer

## Testing

### **Test URLs**

- **Full Payment**: `http://localhost:3000/checkout?flow=full`
- **Deferred Payment**: `http://localhost:3000/checkout?flow=deferred`

### **Test Cards**

| Card Number         | Brand | Outcome                 |
| ------------------- | ----- | ----------------------- |
| 4242 4242 4242 4242 | Visa  | Success                 |
| 4000 0025 0000 3155 | Visa  | Requires authentication |
| 4000 0000 0000 0002 | Visa  | Declined                |

### **Expected Results**

- **Full Flow**: Payment processed + payment method saved + customer updated
- **Deferred Flow**: Payment method saved + customer created + ready for future charging

## Features Implemented

- **Dual payment flows** (full payment + deferred setup)
- **Proper customer management** for off-session MIT payments
- **Complete billing details collection** from guest form
- **Post-confirmation customer updates** with real data
- **Dynamic payment methods** (Apple Pay, Google Pay, cards)
- **Comprehensive error handling** and loading states
- **Success page handling** for both flows

## Notes

- Payment amount: €760 (configurable in frontend)
- Customer management optimized for future off-session payments
- Billing details ensure high authorization rates from payment networks
- Integration preserves original hotel booking form styling
