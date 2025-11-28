const express = require('express');
const router = express.Router();
const db = require('../db');
const sendNotificationEmail = require('../config/mailerNotification');

const connectedUsers = new Map();

router.post("/api", (req, res) => {
  const { UID, title_notify, type_notify, details } = req.body;
  const notify_date = new Date();

  const query = `
    INSERT INTO notification (UID, title_notify, type_notify, details, notify_date)
    VALUES (?, ?, ?, ?, ?)
  `;

  db.query(query, [UID, title_notify, type_notify, details, notify_date], (err, result) => {
    if (err) return res.status(500).json({ error: err });

    // Emit real-time notification if user is connected
    const socketId = connectedUsers.get(UID);
    if (socketId) {
      io.to(socketId).emit("newNotification", {
        id: result.insertId,
        title_notify,
        type_notify,
        details,
        notify_date
      });
    }

    res.json({ success: true, id: result.insertId });
  });
});

router.get("/api/:uid", (req, res) => {
  const { uid } = req.params;
  db.query("SELECT * FROM notification WHERE UID = ? ORDER BY notify_ID DESC", [uid], (err, rows) => {
    if (err) return res.status(500).json({ error: err });
    res.json(rows);
  });
});

router.get("/vetadminapi", (req, res) => {
  db.query("SELECT * FROM Vet_Admin_notification ORDER BY notify_ID DESC", (err, rows) => {
    if (err) return res.status(500).json({ error: err });
    res.json(rows);
  });
});

router.post("/vetadminapi/post", (req, res) => {
  const { title_notify, type_notify, details, displaySet } = req.body;

  const insertNotify = `
    INSERT INTO Vet_Admin_notification 
    (title_notify, type_notify, details, notify_date, displaySet)
    VALUES (?, ?, ?, NOW(), ?)
  `;

  db.query(insertNotify, [title_notify, type_notify, details, displaySet], (err) => {
    if (err) {
      console.error("Database error:", err);
      return res.status(500).json({ error: "Database error" });
    }

    res.status(200).json({ success: true, message: "Notification saved." });
  });
});

router.get("/vetadminapi/:uid/:role", (req, res) => {
  const { uid, role } = req.params;

  const sql = `
    SELECT 
      n.notify_id,
      n.title_notify,
      n.type_notify,
      n.details,
      n.notify_date,
      n.displaySet,
      COALESCE(r.isRead, 0) AS isRead
    FROM Vet_Admin_notification n
    LEFT JOIN Notification_Read_Status r 
      ON n.notify_id = r.notify_id AND r.UID = ?
    LEFT JOIN Vet_Admin_Notification_Clear c
      ON n.notify_id = c.notify_id AND c.UID = ?
    WHERE c.clear_id IS NULL
      AND n.displaySet IN ('All', ?)
    ORDER BY n.notify_id DESC
  `;

  db.query(sql, [uid, uid, role], (err, rows) => {
    if (err) return res.status(500).json({ error: err });
    res.json(rows);
  });
});

router.post("/vetadminapi/setread", (req, res) => {
  const { notify_id, UID } = req.body;
  const sql = `
    INSERT INTO Notification_Read_Status (notify_id, UID, isRead, read_date)
    VALUES (?, ?, 1, NOW())
    ON DUPLICATE KEY UPDATE isRead = 1, read_date = NOW()
  `;
  db.query(sql, [notify_id, UID], (err) => {
    if (err) return res.status(500).json({ error: err });
    res.json({ success: true });
  });
});

router.post("/vetadminapi/setallread", (req, res) => {
  const { UID } = req.body;
  const sql = `
    INSERT INTO Notification_Read_Status (notify_id, UID, isRead, read_date)
    SELECT n.notify_id, ?, 1, NOW()
    FROM Vet_Admin_notification n
    ON DUPLICATE KEY UPDATE isRead = 1, read_date = NOW()
  `;
  db.query(sql, [UID], (err) => {
    if (err) return res.status(500).json({ error: err });
    res.json({ success: true });
  });
});

router.post("/vetadminapi/clear", (req, res) => {
  const { notify_id, UID } = req.body;

  const sql = `
    INSERT INTO Vet_Admin_Notification_Clear (notify_id, UID)
    VALUES (?, ?)
  `;

  db.query(sql, [notify_id, UID], (err) => {
    if (err) return res.status(500).json({ error: err });
    res.json({ success: true, message: "Notification cleared." });
  });
});

router.delete('/api/remove/:id', (req, res) => {
  const { id } = req.params;

  const sql = `DELETE FROM notification WHERE notify_id = ?`;

  db.query(sql, [id], (err) => {
    if (err) return res.status(500).json({ error: err });
    res.json({ success: true });
  });
});

router.post("/api/send-notification", async (req, res) => {
  const { UID, type, title, message, mess1, mess2 } = req.body;

  if (!UID || !type || !title) {
    return res.status(400).json({ error: "Missing required fields." });
  }

  try {
    // 1️⃣ Get user's first name and email by joining user_credentials and user_infos
    const query = `
      SELECT ui.firstName, uc.email
      FROM user_credentials uc
      LEFT JOIN user_infos ui ON uc.id = ui.user_ID
      WHERE uc.id = ?
    `;

    db.query(query, [UID], async (err, results) => {
      if (err) {
        console.error("Database error:", err);
        return res.status(500).json({ error: "Database error" });
      }

      if (results.length === 0) {
        return res.status(404).json({ error: "User not found" });
      }

      const { firstName, email } = results[0];

      if (!email) {
        return res.status(400).json({ error: "User does not have an email." });
      }

      // 2️⃣ Send the notification email
      try {
        await sendNotificationEmail({
          toEmail: email,
          name: firstName || "User",
          type,
          title,
          message,
          mess1: mess1 || '',
          mess2: mess2 || ''
        });

        res.status(200).json({ success: true, message: "Notification email sent." });
      } catch (emailErr) {
        console.error("Error sending notification email:", emailErr);
        res.status(500).json({ error: "Failed to send notification email." });
      }
    });
  } catch (err) {
    console.error("Unexpected error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;