const express = require('express');
const router = express.Router();
const db = require('../db');

// ✅ SET TIME IN
router.post('/set-action-in', (req, res) => {
    const { vetName, UID, action_vet } = req.body;

    const sqlTimeIn = `
        INSERT INTO user_logs (UID, vetName, time_In, action_vet)
        VALUES (?, ?, NOW(), ?)
    `;

    db.query(sqlTimeIn, [UID, vetName, action_vet], (err, result) => {
        if (err) {
            console.error("❌ Error inserting time-in:", err);
            return res.status(500).json({ success: false, message: err });
        }
        
        return res.json({ success: true, LogsID: result.insertId });
    });
});

// ✅ FETCH LOGS
router.get('/fetch/logs', (req, res) => {
    const sqlFetchLogs = `SELECT * FROM user_logs`;

    db.query(sqlFetchLogs, (err, fetchLogs) => {
        if (err) {
            console.error("❌ Error fetching logs:", err);
            return res.status(500).json({ success: false, message: err });
        }

        return res.json({
            success: true,
            data: fetchLogs
        });
    });
});

module.exports = router;
