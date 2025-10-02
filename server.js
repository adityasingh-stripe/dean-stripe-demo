const express = require("express");
const dotenv = require("dotenv");
dotenv.config();
const stripe = require("stripe")(
  process.env.STRIPE_SECRET_KEY || "sk_test_..."
);
const cors = require("cors");
const bodyParser = require("body-parser");
const path = require("path");
const https = require("https");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Serve static files (CSS, JS, images)
app.use("/assets", express.static(path.join(__dirname, "assets")));

// Serve the main HTML file
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// Serve the success page
app.all("/success", (req, res) => {
  // Extract customer data from query parameters (passed from Stripe redirect)
  const customerData = {
    email: req.query.email || req.body.email || "",
    name: req.query.name || req.body.name || "",
    phone: req.query.phone || req.body.phone || "",
    payment_intent_id:
      req.query.payment_intent || req.body.payment_intent || "",
  };

  console.log("Success page accessed with customer data:", customerData);

  // Read the success.html file
  const fs = require("fs");
  let successHtml = fs.readFileSync(
    path.join(__dirname, "success.html"),
    "utf8"
  );

  // Inject customer data into the HTML
  if (customerData.email) {
    // Replace the empty email field with customer email
    successHtml = successHtml.replace(
      'id="txResendEmail"',
      `id="txResendEmail" data-customer-email="${customerData.email}"`
    );
  }

  // Inject JavaScript to populate fields with customer data
  const customerDataScript = `
    <script>
      // Populate customer data from express checkout
      window.customerData = ${JSON.stringify(customerData)};
      
      // Populate fields when page loads
      document.addEventListener('DOMContentLoaded', function() {
        console.log('DEBUG: DOMContentLoaded fired, customerData:', window.customerData);
        
        if (window.customerData) {
          // Populate resend email field
          const resendEmail = document.getElementById('txResendEmail');
          console.log('DEBUG: resendEmail element:', resendEmail);
          if (resendEmail && window.customerData.email) {
            resendEmail.value = window.customerData.email;
            console.log('DEBUG: Set resend email to:', window.customerData.email);
          }
          
          // Populate guest information fields if they exist and have data
          if (window.customerData.name) {
            const nameParts = window.customerData.name.split(' ');
            const firstName = nameParts[0] || '';
            const lastName = nameParts.slice(1).join(' ') || '';
            
            const firstNameField = document.getElementById('txFirstName');
            const lastNameField = document.getElementById('txLastName');
            console.log('DEBUG: firstName element:', firstNameField, 'value to set:', firstName);
            console.log('DEBUG: lastName element:', lastNameField, 'value to set:', lastName);
            
            if (firstNameField) {
              firstNameField.value = firstName;
              console.log('DEBUG: Set firstName to:', firstName);
            }
            if (lastNameField) {
              lastNameField.value = lastName;
              console.log('DEBUG: Set lastName to:', lastName);
            }
          }
          
          if (window.customerData.email) {
            const emailField = document.getElementById('txEmail');
            console.log('DEBUG: email field element:', emailField);
            if (emailField) {
              emailField.value = window.customerData.email;
              console.log('DEBUG: Set email to:', window.customerData.email);
            }
          }
          
          if (window.customerData.phone) {
            const phoneField = document.getElementById('txPhone');
            console.log('DEBUG: phone field element:', phoneField);
            if (phoneField) {
              phoneField.value = window.customerData.phone;
              console.log('DEBUG: Set phone to:', window.customerData.phone);
            }
          }
          
          console.log('Customer data populated on success page:', window.customerData);
        } else {
          console.log('DEBUG: No customerData available');
        }
      });
    </script>
  `;

  // Insert the script before the closing </body> tag
  successHtml = successHtml.replace("</body>", customerDataScript + "</body>");

  res.send(successHtml);
});

// Create payment intent endpoint
app.post("/create-payment-intent", async (req, res) => {
  try {
    const {
      amount,
      currency = "gbp",
      customer_info, // Optional customer information from express checkout
    } = req.body;

    console.log("Creating payment intent with:", {
      amount,
      currency,
      customer_info,
    });

    // Payment intent configuration
    const paymentIntentData = {
      amount: amount * 100, // Convert to cents
      currency: currency,
      automatic_payment_methods: {
        enabled: true,
      },
    };

    // Add customer information if provided (from express checkout)
    if (customer_info) {
      // Add shipping information if available
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

      // Add customer email if available
      if (customer_info.email) {
        paymentIntentData.receipt_email = customer_info.email;
      }

      // Add metadata for tracking
      paymentIntentData.metadata = {
        express_checkout: "true",
        customer_name: customer_info.name || "",
        customer_email: customer_info.email || "",
        customer_phone: customer_info.phone || "",
      };
    }

    // Create a PaymentIntent with the order amount and currency
    const paymentIntent = await stripe.paymentIntents.create(paymentIntentData);

    console.log("Payment intent created:", paymentIntent.id);

    res.send({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    });
  } catch (error) {
    console.error("Error creating payment intent:", error);
    res.status(500).send({
      error: error.message,
    });
  }
});

// New endpoint to update payment intent with customer information
app.post("/update-payment-intent", async (req, res) => {
  try {
    const { payment_intent_id, customer_info } = req.body;

    if (!payment_intent_id) {
      return res.status(400).send({ error: "Payment intent ID is required" });
    }

    console.log("Updating payment intent with customer info:", {
      payment_intent_id,
      customer_info,
    });

    const updateData = {};

    // Add shipping information if available
    if (customer_info?.address) {
      updateData.shipping = {
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

    // Add customer email if available
    if (customer_info?.email) {
      updateData.receipt_email = customer_info.email;
    }

    // Update metadata
    updateData.metadata = {
      express_checkout: "true",
      customer_name: customer_info?.name || "",
      customer_email: customer_info?.email || "",
      customer_phone: customer_info?.phone || "",
      updated_at: new Date().toISOString(),
    };

    // Update the PaymentIntent
    const paymentIntent = await stripe.paymentIntents.update(
      payment_intent_id,
      updateData
    );

    console.log("Payment intent updated:", paymentIntent.id);

    res.send({
      success: true,
      paymentIntentId: paymentIntent.id,
    });
  } catch (error) {
    console.error("Error updating payment intent:", error);
    res.status(500).send({
      error: error.message,
    });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`Visit http://localhost:${PORT} to view the checkout page`);
  console.log("Make sure to set your STRIPE_SECRET_KEY environment variable");
});
