const express = require("express");
const router = express.Router();
require("dotenv").config();
const axios = require("axios");

const AICHAT_API_KEY2 = process.env.AICHAT_API_KEY2;

// Helper function for retrying API calls
async function callGoogleAI(message, retries = 6, delay = 1000) {

  // Keywords that indicate the user wants help with the clinic website
  const clinicKeywords = [
    "login", "log in", "sign up", "signup", "account",
    "notification", "my pets", "register pet",
    "appointment", "booking", "vet schedule",
    "pet records", "medical records",
    "products", "orders", "buy", "shop",
    "online consultation", "video call",
    "profile", "edit profile",
    "dashboard"
  ];

  const containsClinicKeyword = clinicKeywords.some(keyword =>
    message.toLowerCase().includes(keyword)
  );

  // ---- SYSTEM INSTRUCTIONS YOU WANT TO ADD ----
  const clinicInstructions = `
You are also responsible for guiding users on how to use the Vet Clinic Website System when they mention features like login, signup, appointments, pets, medical records, notifications, products, orders, online consultation, profile, or dashboard.

Here is the system usage guide:

• **Landing Page / Login / Signup**
  - Click the **Login** button at the top-right.
  - To sign up, choose **Sign Up**, fill in required details.
  - An **email verification** will be sent; users must verify before logging in.
  - If using **Google Signup**, users go directly to the dashboard but still need to complete their information.

• **Notifications**
  - Go to the **Notifications Tab** to see all system alerts.

• **My Pets**
  - Register pets and their details in the **My Pets Tab**.

• **Appointments**
  - Go to the **Appointment Tab** to pick a date and time.
  - **Red dates / empty time slots** = fully booked or restricted by admin due to events.
  - **Gray dates** = past days or non-bookable event dates.
  - Users must wait for a veterinarian to approve or decline.
  - If declined, a **reason** is shown.

• **Pet Medical Records**
  - View medical history in the **Pet Records Tab**.
  - Users can **print visit history**.

• **Pet Products**
  - Visit the **Pet Products Tab** to browse and purchase items.
  - Payments: **QRPH** or **Cash on Delivery**.
  - Order status can be viewed in the **Orders History**.

• **Online Consultation**
  - Go to the **Online Consultation Tab**.
  - Select your pet (must be registered in the My Pets Tab).
  - Enter your consultation description.
  - Choose the consultation type: **Regular** or **Urgent**.
  - Each consultation type shows a corresponding price.
  - Complete the payment using **QRPH**. After successful payment, a receipt will appear.
  - Submit your online consultation request.
  - Wait for your request to be reviewed. It will be marked as **Approved** or **Declined**.
  - If Declined, the system will display the reason.

  • **If Approved**
    - Wait for the scheduled **date and time** of your consultation.
    - When the time arrives, go to your **Dashboard**.
    - In the Dashboard, find the **Upcoming Online Consultation** section.
    - Click **Join Chat Session** from that section.
    - You can send real-time text messages to the veterinarian.
    - You may also start a **live video call** with the veterinarian during the session.

• **Profile**
  - In **Profile Tab**, users can edit profile details and profile picture.

• **Dashboard**
  - Shows:
    - Total pets
    - Total appointments
    - Notifications
    - Total clinic visits
    - Upcoming online consultations & their statuses
    - Product purchases
    - AI Chat on the right side

Always provide system-use instructions ONLY when the user message contains any related keyword.
  `;

  // Build the final prompt dynamically
  const finalPrompt = `
You are Dr. Paws, a friendly veterinarian AI with clear, empathetic explanations.

${containsClinicKeyword
      ? clinicInstructions
      : ""
    }

Now answer the user's question:
${message}
`;

  for (let i = 0; i < retries; i++) {
    try {
      const response = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${AICHAT_API_KEY2}`,
        {
          contents: [
            {
              parts: [
                {
                  text: finalPrompt
                }
              ]
            }
          ]
        },
        { headers: { "Content-Type": "application/json" } }
      );

      const aiReply =
        response.data?.candidates?.[0]?.content?.parts?.[0]?.text ||
        "I'm sorry, I couldn’t process that request.";

      return aiReply;

    } catch (err) {
      const status = err.response?.status;
      if (status === 503 && i < retries - 1) {
        console.warn(`Model overloaded. Retrying in ${delay}ms...`);
        await new Promise(res => setTimeout(res, delay));
        delay *= 2;
      } else {
        throw err;
      }
    }
  }
}

router.post("/api", async (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: "Message is required." });

  try {
    const aiReply = await callGoogleAI(message);
    res.json({ reply: aiReply });
  } catch (error) {
    console.error("Error calling Google AI:", error.response?.data || error.message);
    res.status(500).json({ reply: "Sorry, I couldn't process your request." });
  }
});

module.exports = router;
