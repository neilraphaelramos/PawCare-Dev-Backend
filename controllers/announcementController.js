const express = require('express');
const router = express.Router();
const db = require('../db');

router.get("/fetch", (req, res) => {
  const sql = `
    SELECT 
      id,
      title,
      content,
      button_text,
      button_link,
      DATE_FORMAT(date_posted, '%Y-%m-%d') AS date_posted,
      DATE_FORMAT(expiration_date, '%Y-%m-%d') AS expiration_date
    FROM announcements
    ORDER BY date_posted DESC
  `;

  db.query(sql, (err, result) => {
    if (err) {
      console.error("Error fetching announcements:", err);
      return res.status(500).json({ error: "Database error" });
    }
    res.json({ success: true, data: result });
  });
});

router.post("/add", (req, res) => {
  const { title, content, date_posted, expiration_date, button_text, button_link } = req.body;
  const sql = `
    INSERT INTO announcements (title, content, date_posted, expiration_date, button_text, button_link)
    VALUES (?, ?, ?, ?, ?, ?)
  `;

  db.query(sql, [title, content, date_posted, expiration_date, button_text, button_link], (err, result) => {
    if (err) {
      console.error("Error adding announcement:", err);
      return res.status(500).json({ success: false, error: err });
    }
    res.json({ success: true, id: result.insertId });
  });
});

router.put("/update/:id", (req, res) => {
  const { id } = req.params;
  const { title, content, date_posted, expiration_date, button_text, button_link } = req.body;
  const sql = `
    UPDATE announcements
    SET title=?, content=?, date_posted=?, expiration_date=?, button_text=?, button_link=?
    WHERE id=?
  `;

  db.query(sql, [title, content, date_posted, expiration_date, button_text, button_link, id], (err, result) => {
    if (err) {
      console.error("Error updating announcement:", err);
      return res.status(500).json({ success: false, error: err });
    }
    res.json({ success: true });
  });
});

router.delete("/delete/:id", (req, res) => {
  const { id } = req.params;
  const sql = "DELETE FROM announcements WHERE id=?";

  db.query(sql, [id], (err, result) => {
    if (err) {
      console.error("Error deleting announcement:", err);
      return res.status(500).json({ success: false, error: err });
    }

    res.json({ success: true });
  });
});

module.exports = router;