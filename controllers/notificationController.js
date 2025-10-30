const express = require('express');
const router = express.Router();
const db = require('../db');

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
  db.query("SELECT * FROM notification WHERE UID = ? ORDER BY notify_date DESC", [uid], (err, rows) => {
    if (err) return res.status(500).json({ error: err });
    res.json(rows);
  });
});

module.exports = router;