const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/:username', (req, res) => {
  const { username } = req.params;
  const sql = 'SELECT pet_name, petType, species FROM pet_medical_records WHERE owner_username = ?';

  db.query(sql, [username], (err, results) => {
    if (err) {
      console.error("Error fetching data:", err);
      return res.status(500).json({ error: "Database error" });
    };

    if (results.length === 0) {
      return res.json({ success: true, data: [] });
    }

    return res.json({
      success: true,
      data: results
    });
  })
});

module.exports = router;