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
  const { title_notify, type_notify, details } = req.body;

  const insertNofity = `
    INSERT INTO Vet_Admin_notification 
    (title_notify, type_notify, details, notify_date )
    VALUES (?, ?, ?, NOW())
  `

  db.query(insertNofity, [title_notify, type_notify, details], (err) => {
    if (err) {
      console.error("Database error:", err);
      return res.status(500).json({ error: "Database error" });
    }

    res.status(200).json({ success: true, message: "Notification saved." });
  });
});

router.get("/vetadminapi/:uid", (req, res) => {
  const { uid } = req.params;

  const sql = `
    SELECT 
      n.notify_id,
      n.title_notify,
      n.type_notify,
      n.details,
      n.notify_date,
      COALESCE(r.isRead, 0) AS isRead
    FROM Vet_Admin_notification n
    LEFT JOIN Notification_Read_Status r 
      ON n.notify_id = r.notify_id AND r.UID = ?
    LEFT JOIN Vet_Admin_Notification_Clear c
      ON n.notify_id = c.notify_id AND c.UID = ?
    WHERE c.clear_id IS NULL
    ORDER BY n.notify_id DESC
  `;

  db.query(sql, [uid, uid], (err, rows) => {
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

module.exports = router;