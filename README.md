# Stripe Payment Element Demo

This demo integrates Stripe Payment Element into a hotel checkout page.

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
   - Also update the publishable key in `index.html` (search for `pk_test_REPLACE_WITH_YOUR_PUBLISHABLE_KEY`)

3. **Start the Server**

   ```bash
   npm start
   ```

   For development with auto-reload:

   ```bash
   npm run dev
   ```

4. **Test the Integration**
   - Visit `http://localhost:3000`
   - Fill out the guest information form
   - Use Stripe test card numbers:
     - `4242 4242 4242 4242` (Visa)
     - `4000 0025 0000 3155` (Visa - requires authentication)
     - Use any future expiry date and any 3-digit CVC

## Features Implemented

- ✅ Removed original credit card form
- ✅ Integrated Stripe Payment Element
- ✅ Node.js Express server
- ✅ Payment Intent creation endpoint
- ✅ Responsive payment form
- ✅ Error handling
- ✅ Loading states

## Test Cards

For testing, use these Stripe test card numbers:

| Card Number         | Brand | Outcome                 |
| ------------------- | ----- | ----------------------- |
| 4242 4242 4242 4242 | Visa  | Success                 |
| 4000 0025 0000 3155 | Visa  | Requires authentication |
| 4000 0000 0000 0002 | Visa  | Declined                |

## Notes

- The payment amount is hardcoded to €360 (matching the demo reservation)
- Static files are served from the `Checkout - Dean DEMO_files` directory
- The integration preserves the original styling and layout
