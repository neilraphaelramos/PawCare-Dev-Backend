const express = require('express');
const db = require('../db');

const router = express.Router();

router.post('/', (req, res) => {
    const { email } = req.body;

    const sql = "SELECT id FROM user_credentials WHERE email = ?";
    db.query(sql, [email], (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: "Server error" });
        }
        res.json({ exists: results.length > 0 });
    });
});

module.exports = router;
