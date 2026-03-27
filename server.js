const express = require("express");
const dotenv = require("dotenv");
dotenv.config();
const stripe = require("stripe")(
  process.env.STRIPE_SECRET_KEY || "sk_test_..."
);
const cors = require("cors");
const bodyParser = require("body-parser");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// Block Amex (and tune other brands) for card payments; Payment Element reads this from the Intent via clientSecret.
// See https://docs.stripe.com/payments/checkout/customization/card-brands
const CARD_BRAND_RESTRICTIONS = {
  card: {
    restrictions: {
      brands_blocked: ["american_express"],
    },
  },
};

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Serve static files (CSS, JS, images)
app.use("/assets", express.static(path.join(__dirname, "assets")));

// Serve the main Payment Links interface
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "html/index.html"));
});

// Serve checkout page with Payment Element integration
app.get("/checkout", (req, res) => {
  res.sendFile(path.join(__dirname, "html/index.html"));
});

// Create PaymentIntent for full payment flow
app.post("/create-payment-intent", async (req, res) => {
  try {
    const { amount, currency = "eur", customer_info } = req.body;

    console.log("Creating PaymentIntent for full payment:", {
      amount,
      currency,
      customer_info,
    });

    // Payment intent configuration with dynamic payment methods
    // Customer will be created AFTER successful payment with complete billing details
    const paymentIntentData = {
      amount: amount * 100, // Convert to cents
      currency: currency,
      // No customer parameter - will create customer after payment with billing details
      setup_future_usage: "off_session", // Enable future off-session payments
      automatic_payment_methods: {
        enabled: true, // Enables dynamic payment methods (Apple Pay, Google Pay, etc.)
      },
      payment_method_options: CARD_BRAND_RESTRICTIONS,
      // No confirmation_method specified = defaults to "automatic"
      // We'll still collect billing details from form and pass them in confirmPayment()
    };

    // Add customer information if provided
    if (customer_info) {
      if (customer_info.address) {
        paymentIntentData.shipping = {
          name: customer_info.name || "Customer",
          address: {
            line1: customer_info.address.line1,
            line2: customer_info.address.line2,
            city: customer_info.address.city,
            state: customer_info.address.state,
            postal_code: customer_info.address.postal_code,
            country: customer_info.address.country,
          },
        };
      }

      if (customer_info.email) {
        paymentIntentData.receipt_email = customer_info.email;
      }

      paymentIntentData.metadata = {
        integration_type: "payment_element",
        flow_type: "full",
        customer_name: customer_info.name || "",
        customer_email: customer_info.email || "",
        customer_phone: customer_info.phone || "",
      };
    }

    const paymentIntent = await stripe.paymentIntents.create(paymentIntentData);

    console.log("PaymentIntent created:", paymentIntent.id);

    res.send({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    });
  } catch (error) {
    console.error("Error creating PaymentIntent:", error);
    res.status(500).send({
      error: error.message,
    });
  }
});

// Create SetupIntent for deferred payment flow
app.post("/create-setup-intent", async (req, res) => {
  try {
    const { customer_info, currency = "eur" } = req.body;

    console.log("Creating SetupIntent for deferred payment:", {
      customer_info,
    });

    // Customer will be created AFTER successful setup with complete billing details
    const setupIntentData = {
      // No customer parameter - will create customer after setup with billing details
      automatic_payment_methods: {
        enabled: true, // Enables dynamic payment methods for SetupIntent too
      },
      payment_method_options: CARD_BRAND_RESTRICTIONS,
      usage: "off_session",
      metadata: {
        integration_type: "payment_element",
        flow_type: "deferred",
        customer_name: customer_info?.name || "",
        customer_email: customer_info?.email || "",
        customer_phone: customer_info?.phone || "",
      },
    };

    const setupIntent = await stripe.setupIntents.create(setupIntentData);

    console.log("SetupIntent created:", setupIntent.id);

    res.send({
      clientSecret: setupIntent.client_secret,
      setupIntentId: setupIntent.id,
    });
  } catch (error) {
    console.error("Error creating SetupIntent:", error);
    res.status(500).send({
      error: error.message,
    });
  }
});

// Update customer with complete billing details from form (called after payment confirmation)
app.post("/update-customer", async (req, res) => {
  try {
    const { customer_id, billing_details } = req.body;

    if (!customer_id) {
      return res.status(400).json({ error: "Customer ID is required" });
    }

    console.log("Updating customer with billing details:", {
      customer_id,
      billing_details,
    });

    // Update customer with complete information from form
    const updateData = {};

    if (billing_details.name) {
      updateData.name = billing_details.name;
    }

    if (billing_details.email) {
      updateData.email = billing_details.email;
    }

    if (billing_details.phone) {
      updateData.phone = billing_details.phone;
    }

    if (billing_details.address) {
      updateData.address = {
        line1: billing_details.address.line1,
        line2: billing_details.address.line2,
        city: billing_details.address.city,
        state: billing_details.address.state,
        postal_code: billing_details.address.postal_code,
        country: billing_details.address.country,
      };
    }

    const customer = await stripe.customers.update(customer_id, updateData);

    console.log("Customer updated successfully:", customer.id);

    res.json({
      success: true,
      customer_id: customer.id,
      updated_fields: Object.keys(updateData),
    });
  } catch (error) {
    console.error("Error updating customer:", error);
    res.status(500).json({ error: error.message });
  }
});

// Create customer AFTER successful payment with complete billing details from PaymentMethod
app.post("/create-customer-from-payment", async (req, res) => {
  try {
    const { payment_intent_id, setup_intent_id } = req.body;

    console.log("Creating customer from payment:", {
      payment_intent_id,
      setup_intent_id,
    });

    // Retrieve the PaymentIntent or SetupIntent to get the PaymentMethod
    let paymentMethodId;
    let intentType;

    if (payment_intent_id) {
      const paymentIntent = await stripe.paymentIntents.retrieve(payment_intent_id);
      paymentMethodId = paymentIntent.payment_method;
      intentType = "payment";
      console.log("Retrieved PaymentIntent:", payment_intent_id, "PaymentMethod:", paymentMethodId);
    } else if (setup_intent_id) {
      const setupIntent = await stripe.setupIntents.retrieve(setup_intent_id);
      paymentMethodId = setupIntent.payment_method;
      intentType = "setup";
      console.log("Retrieved SetupIntent:", setup_intent_id, "PaymentMethod:", paymentMethodId);
    } else {
      return res.status(400).json({ error: "Either payment_intent_id or setup_intent_id is required" });
    }

    if (!paymentMethodId) {
      return res.status(400).json({ error: "No payment method found on intent" });
    }

    // Retrieve the PaymentMethod to get billing details
    const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);

    console.log("PaymentMethod billing details:", paymentMethod.billing_details);

    // Create customer with complete billing details from PaymentMethod
    const customerData = {
      payment_method: paymentMethodId,
      invoice_settings: {
        default_payment_method: paymentMethodId,
      },
    };

    if (paymentMethod.billing_details.name) {
      customerData.name = paymentMethod.billing_details.name;
    }

    if (paymentMethod.billing_details.email) {
      customerData.email = paymentMethod.billing_details.email;
    }

    if (paymentMethod.billing_details.phone) {
      customerData.phone = paymentMethod.billing_details.phone;
    }

    if (paymentMethod.billing_details.address) {
      customerData.address = paymentMethod.billing_details.address;
    }

    const customer = await stripe.customers.create(customerData);

    console.log("Customer created successfully with complete billing details:", customer.id);

    // Update the PaymentIntent or SetupIntent with the customer ID
    if (payment_intent_id) {
      await stripe.paymentIntents.update(payment_intent_id, {
        customer: customer.id,
      });
      console.log("PaymentIntent updated with customer ID");
    } else if (setup_intent_id) {
      await stripe.setupIntents.update(setup_intent_id, {
        customer: customer.id,
      });
      console.log("SetupIntent updated with customer ID");
    }

    res.json({
      success: true,
      customer_id: customer.id,
      intent_type: intentType,
    });
  } catch (error) {
    console.error("Error creating customer from payment:", error);
    res.status(500).json({ error: error.message });
  }
});

// Success page for both Payment Links and Payment Element
app.get("/success", async (req, res) => {
  const sessionId = req.query.session_id;
  const paymentIntentId = req.query.payment_intent;
  const setupIntentId = req.query.setup_intent;
  // Handle different success scenarios
  if (sessionId) {
    // Payment Links flow
    return handlePaymentLinksSuccess(sessionId, res);
  } else if (paymentIntentId) {
    // Payment Element full payment flow
    return handlePaymentElementSuccess(paymentIntentId, "payment", res);
  } else if (setupIntentId) {
    // Payment Element deferred flow
    return handlePaymentElementSuccess(setupIntentId, "setup", res);
  } else {
    // No valid parameters, redirect to home
    return res.redirect("/");
  }
});

// Handle Payment Links success
async function handlePaymentLinksSuccess(sessionId, res) {
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["line_items", "customer_details"],
    });

    console.log("Payment Links success:", {
      sessionId: session.id,
      bookingId: session.metadata?.booking_id,
      customerEmail: session.customer_details?.email,
    });

    // Use the success.html file from html folder
    const fs = require("fs");
    let successHtml = fs.readFileSync(
      path.join(__dirname, "html/success.html"),
      "utf8"
    );

    // Inject session data into the success page
    const sessionDataScript = `
      <script>
        window.sessionData = {
          type: 'payment_link',
          bookingId: '${session.metadata?.booking_id || ""}',
          amount: ${session.amount_total / 100},
          currency: '${session.currency.toUpperCase()}',
          customerName: '${session.customer_details?.name || ""}',
          customerEmail: '${session.customer_details?.email || ""}',
          checkIn: '${session.metadata?.check_in_date || ""}',
          checkOut: '${session.metadata?.check_out_date || ""}'
        };
      </script>
    `;

    // Insert the script before closing </head>
    successHtml = successHtml.replace("</head>", sessionDataScript + "</head>");
    res.send(successHtml);
  } catch (error) {
    console.error("Error retrieving session:", error);
    res.status(500).send("Error retrieving booking information");
  }
}

// Handle Payment Element success (PaymentIntent or SetupIntent)
async function handlePaymentElementSuccess(intentId, type, res) {
  try {
    const fs = require("fs");
    let successHtml = fs.readFileSync(
      path.join(__dirname, "html/success.html"),
      "utf8"
    );

    let intentData;
    if (type === "payment") {
      intentData = await stripe.paymentIntents.retrieve(intentId);
      console.log("PaymentIntent success:", {
        paymentIntentId: intentData.id,
        amount: intentData.amount / 100,
        currency: intentData.currency,
      });
    } else {
      intentData = await stripe.setupIntents.retrieve(intentId);
      console.log("SetupIntent success:", {
        setupIntentId: intentData.id,
        paymentMethod: intentData.payment_method,
      });
    }

    // Inject intent data into the success page
    const intentDataScript = `
      <script>
        window.sessionData = {
          type: '${
            type === "payment"
              ? "payment_element_full"
              : "payment_element_deferred"
          }',
          intentId: '${intentData.id}',
          ${
            type === "payment"
              ? `
            amount: ${intentData.amount / 100},
            currency: '${intentData.currency.toUpperCase()}',
          `
              : `
            paymentMethodSaved: true,
          `
          }
          customerName: '${intentData.metadata?.customer_name || ""}',
          customerEmail: '${intentData.metadata?.customer_email || ""}',
          flow: '${intentData.metadata?.flow_type || type}'
        };
      </script>
    `;

    successHtml = successHtml.replace("</head>", intentDataScript + "</head>");
    res.send(successHtml);
  } catch (error) {
    console.error(`Error retrieving ${type} intent:`, error);
    res.status(500).send("Error retrieving payment information");
  }
}

// Create Payment Link for hotel booking
app.post("/create-payment-link", async (req, res) => {
  try {
    const {
      guestName,
      guestEmail,
      checkInDate,
      checkOutDate,
      roomType,
      nightlyRate,
      numberOfNights,
      addOns = [],
      currency = "eur",
    } = req.body;

    console.log("Creating payment link for booking:", {
      guestName,
      guestEmail,
      checkInDate,
      checkOutDate,
      roomType,
      numberOfNights,
    });

    // Build line items for each night
    const lineItems = [];

    // Add per-night charges
    for (let night = 0; night < numberOfNights; night++) {
      const nightDate = new Date(checkInDate);
      nightDate.setDate(nightDate.getDate() + night);

      lineItems.push({
        price_data: {
          currency: currency,
          product_data: {
            name: `${roomType} - Night ${night + 1}`,
            description: `${nightDate.toLocaleDateString(
              "en-GB"
            )} - Premium accommodation`,
            images: [
              "https://images.unsplash.com/photo-1611892440504-42a792e24d32?w=500&h=300&fit=crop",
            ], // Hotel room image
          },
          unit_amount: Math.round(nightlyRate * 100), // Convert to cents
        },
        quantity: 1,
      });
    }

    // Add add-on services
    if (addOns && addOns.length > 0) {
      addOns.forEach((addon) => {
        lineItems.push({
          price_data: {
            currency: currency,
            product_data: {
              name: addon.name,
              description: addon.description,
              images: [
                addon.imageUrl ||
                  "https://images.unsplash.com/photo-1571896349842-33c89424de2d?w=500&h=300&fit=crop",
              ], // Generic service image
            },
            unit_amount: Math.round(addon.price * 100),
          },
          quantity: addon.quantity || 1,
        });
      });
    }

    // Generate unique booking ID
    const bookingId = `TDG-${Date.now()}-${Math.random()
      .toString(36)
      .substr(2, 9)
      .toUpperCase()}`;

    // Create single-use payment link with payment method saving
    const paymentLink = await stripe.paymentLinks.create({
      line_items: lineItems,
      customer_creation: "always", // Create customer for future bookings
      payment_intent_data: {
        setup_future_usage: "off_session", // Save payment method
        payment_method_options: CARD_BRAND_RESTRICTIONS,
      },
      restrictions: {
        completed_sessions: { limit: 1 }, // Single-use only
      },
      billing_address_collection: "required",
      shipping_address_collection: {
        allowed_countries: ["GB", "IE", "US", "DE", "FR", "ES", "IT", "NL"],
      },
      after_completion: {
        type: "redirect",
        redirect: {
          url: `${
            req.headers.origin || "http://localhost:3000"
          }/success?session_id={CHECKOUT_SESSION_ID}`,
        },
      },
      metadata: {
        booking_id: bookingId,
        guest_name: guestName,
        guest_email: guestEmail,
        check_in_date: checkInDate,
        check_out_date: checkOutDate,
        room_type: roomType,
        total_nights: numberOfNights.toString(),
        integration_type: "payment_link",
        nightly_rate: nightlyRate.toString(),
      },
    });

    console.log("Payment link created:", {
      paymentLinkId: paymentLink.id,
      bookingId: bookingId,
      url: paymentLink.url,
    });

    res.json({
      success: true,
      paymentLink: paymentLink.url,
      bookingId: bookingId,
    });
  } catch (error) {
    console.error("Error creating payment link:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Export the Express app for Vercel
module.exports = app;

// Start the server only in local development
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`TDG Server running on port ${PORT}`);
    console.log("Make sure to set your STRIPE_SECRET_KEY environment variable");
  });
}
