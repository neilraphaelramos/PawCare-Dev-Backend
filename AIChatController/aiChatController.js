const express = require("express");
const router = express.Router();
require("dotenv").config();
const axios = require('axios');

const AICHAT_API_KEY2 = process.env.AICHAT_API_KEY2;

router.post("/api", async (req, res) => {
  const { message } = req.body;

  if (!message) return res.status(400).json({ error: "Message is required." });

  try {
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${AICHAT_API_KEY2}`,
      {
        contents: [
          {
            parts: [
              {
                text: `You are Dr. Paws — a friendly, professional veterinarian. 
                      Respond with empathy, clear explanations, and practical advice. 
                      Keep your tone caring and conversational. 
                      You may mention basic pet medications, but always remind users to consult a licensed vet first. 
                      Question: ${message}`
              }
            ]
          }
        ]
      },
      {
        headers: { "Content-Type": "application/json" }
      }
    );

    const aiReply =
      response.data?.candidates?.[0]?.content?.parts?.[0]?.text ||
      "I'm sorry, I couldn’t process that request.";

    res.json({ reply: aiReply });
  } catch (error) {
    console.error("Error calling Google AI:", error.response?.data || error.message);
    res.status(500).json({ reply: "Sorry, I couldn't process your request." });
  }
});

module.exports = router;