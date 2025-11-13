# Express Checkout Element: Customer Email Validation Guide

## Overview

This guide explains how to retrieve customer details (especially email) from Stripe's Express Checkout Element and implement proper validation before proceeding with payment.

## Key Concept

Express Checkout Element provides customer details through the `confirm` event. While you can set `emailRequired: true` in the configuration, it's critical to validate the email server-side and handle cases where it might be missing.

---

## Step 1: Configure Express Checkout Element

When creating the Express Checkout Element, specify that email is required:

```javascript
const expressCheckoutElement = elements.create("expressCheckout", {
  emailRequired: true,           // Request email from payment provider
  phoneNumberRequired: true,     // Optional: request phone number
  paymentMethodOrder: ['applePay', 'googlePay'],
  paymentMethods: {
    applePay: "always",
    googlePay: "always",
  },
});
```

---

## Step 2: Retrieve Customer Details from `confirm` Event

Customer details are provided in the `event.billingDetails` object when the user completes the express checkout flow:

```javascript
expressCheckoutElement.on('confirm', async (event) => {
  const billingDetails = event.billingDetails;

  // Available fields:
  console.log('Email:', billingDetails.email);           // Primary identifier
  console.log('Name:', billingDetails.name);             // Full name
  console.log('Phone:', billingDetails.phone);           // Phone number
  console.log('Address:', billingDetails.address);       // Address object
  //   - line1, line2, city, state, postal_code, country

  // Your validation logic here...
});
```

---

## Step 3: Validate Email and Handle Missing Data

**Critical:** Always validate that email is present before proceeding. Use `event.reject()` to properly cancel the payment if validation fails:

```javascript
expressCheckoutElement.on('confirm', async (event) => {
  const billingDetails = event.billingDetails;

  // Email validation
  if (!billingDetails.email) {
    console.error('Express checkout missing required email');

    // Show user-friendly error message
    showPaymentError(
      'Email address is required. Please try again or use the card payment form below.'
    );

    // Re-enable the express checkout buttons
    const expressContainer = document.getElementById('express-checkout-element');
    if (expressContainer) {
      expressContainer.style.opacity = '1';
      expressContainer.style.pointerEvents = 'auto';
    }

    // CRITICAL: Reject the payment flow
    event.reject({ reason: 'invalid_payer_email' });
    return;
  }

  // Email is present - proceed with payment
  console.log('Valid email provided:', billingDetails.email);
  await processPayment(billingDetails);
});
```

---

## Step 4: Handle User Cancellation

Users may close the payment dialog without completing. Add a `cancel` event handler to restore UI state:

```javascript
expressCheckoutElement.on('cancel', () => {
  console.log('Express checkout canceled by user');

  // Re-enable buttons so user can retry
  const expressContainer = document.getElementById('express-checkout-element');
  if (expressContainer) {
    expressContainer.style.opacity = '1';
    expressContainer.style.pointerEvents = 'auto';
  }
});
```

---

## Step 5: Process Valid Payment

When email is present and valid, proceed with payment confirmation:

```javascript
async function processPayment(billingDetails) {
  try {
    // Confirm the payment with Stripe
    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/success?email=${encodeURIComponent(billingDetails.email)}`,
        // Or handle locally with redirect: "if_required"
      },
    });

    if (error) {
      showPaymentError(error.message);
      // Re-enable UI for retry
      restoreExpressCheckoutUI();
    }
  } catch (err) {
    console.error('Payment processing error:', err);
    showPaymentError('Payment failed. Please try again.');
    restoreExpressCheckoutUI();
  }
}
```

---

## Complete Example

```javascript
// Initialize Stripe Elements
const stripe = Stripe('pk_test_YOUR_KEY');
const elements = stripe.elements({ clientSecret });

// Create Express Checkout Element
const expressCheckoutElement = elements.create("expressCheckout", {
  emailRequired: true,
  phoneNumberRequired: true,
  paymentMethodOrder: ['applePay', 'googlePay'],
  paymentMethods: {
    applePay: "always",
    googlePay: "always",
  },
});

// Handle click event - show loading state
expressCheckoutElement.on('click', async (event) => {
  console.log('Express checkout clicked:', event.expressPaymentType);

  const expressContainer = document.getElementById('express-checkout-element');
  if (expressContainer) {
    expressContainer.style.opacity = '0.6';
    expressContainer.style.pointerEvents = 'none';
  }

  event.resolve();
});

// Handle confirm event - validate email and process payment
expressCheckoutElement.on('confirm', async (event) => {
  const billingDetails = event.billingDetails;

  // Validate email is present
  if (!billingDetails.email) {
    console.error('Express checkout missing required email');
    showPaymentError('Email address is required. Please try again.');
    restoreExpressCheckoutUI();
    event.reject({ reason: 'invalid_payer_email' });
    return;
  }

  console.log('Processing payment for:', billingDetails.email);

  // Proceed with payment confirmation
  const { error } = await stripe.confirmPayment({
    elements,
    confirmParams: {
      return_url: `${window.location.origin}/success?email=${encodeURIComponent(billingDetails.email)}`,
    },
  });

  if (error) {
    console.error('Express payment failed:', error);
    showPaymentError(error.message);
    restoreExpressCheckoutUI();
  }
});

// Handle cancel event - restore UI when user closes dialog
expressCheckoutElement.on('cancel', () => {
  console.log('Express checkout canceled by user');
  restoreExpressCheckoutUI();
});

// Mount the element
expressCheckoutElement.mount("#express-checkout-element");

// Helper functions
function showPaymentError(message) {
  const errorElement = document.getElementById("payment-errors");
  if (errorElement) {
    errorElement.textContent = message;
    errorElement.style.display = "block";
  }
}

function restoreExpressCheckoutUI() {
  const expressContainer = document.getElementById('express-checkout-element');
  if (expressContainer) {
    expressContainer.style.opacity = '1';
    expressContainer.style.pointerEvents = 'auto';
  }
}
```

---

## Best Practices

### ✅ DO:
- Always set `emailRequired: true` in configuration
- Validate email presence in the `confirm` event handler
- Use `event.reject()` to properly cancel invalid payments
- Implement `cancel` event handler to restore UI
- Show clear error messages to users
- Re-enable UI on errors so users can retry

### ❌ DON'T:
- Don't assume email will always be present
- Don't use `return` without `event.reject()` for validation failures
- Don't forget to restore UI state on cancellation
- Don't proceed with payment if email is missing

---

## Error Handling Scenarios

| Scenario | Action | Method |
|----------|--------|--------|
| Email missing | Show error, reject payment | `event.reject({ reason: 'invalid_payer_email' })` |
| User closes dialog | Restore UI, allow retry | `on('cancel')` event handler |
| Payment fails | Show error, restore UI | Handle error in `confirmPayment()` |
| Network error | Show error, restore UI | Try-catch block |

---

## Additional Resources

- [Stripe Express Checkout Element Documentation](https://stripe.com/docs/elements/express-checkout-element)
- [Payment Element vs Express Checkout](https://stripe.com/docs/payments/payment-element#express-checkout)
- [Handling Payment Errors](https://stripe.com/docs/payments/accept-a-payment#web-handle-errors)

---

## Summary

The key to successful email validation with Express Checkout Element:

1. Configure `emailRequired: true`
2. Validate `event.billingDetails.email` in the `confirm` handler
3. Use `event.reject()` for validation failures (not just `return`)
4. Add `cancel` event handler to restore UI
5. Always provide clear user feedback

This ensures a smooth checkout experience while maintaining data integrity for your booking system.
