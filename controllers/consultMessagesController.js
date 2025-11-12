const express = require("express");
const router = express.Router();
const db = require("../db");

// 🟢 Save a new chat message
router.post("/save", async (req, res) => {
  const { consult_id, sender_type, sender_name, message_text } = req.body;

  if (!consult_id || !sender_type || !message_text) {
    return res.status(400).json({ success: false, error: "Missing fields" });
  }

  try {
    await db.promise().query(
      `INSERT INTO consult_messages (consult_id, sender_type, sender_name, message_text) VALUES (?, ?, ?, ?)`,
      [consult_id, sender_type, sender_name || null, message_text]
    );

    res.json({ success: true });
  } catch (err) {
    console.error("❌ Error saving message:", err);
    res.status(500).json({ success: false, error: "Database error" });
  }
});

// 🟢 Fetch all messages for a consultation
router.get("/:consult_id", async (req, res) => {
  const { consult_id } = req.params;
  try {
    const [rows] = await db
      .promise()
      .query(
        `SELECT sender_type, sender_name, message_text, message_date FROM consult_messages WHERE consult_id = ? ORDER BY message_date ASC`,
        [consult_id]
      );

    res.json({ success: true, messages: rows });
  } catch (err) {
    console.error("❌ Error fetching messages:", err);
    res.status(500).json({ success: false, error: "Database error" });
  }
});

module.exports = router;
