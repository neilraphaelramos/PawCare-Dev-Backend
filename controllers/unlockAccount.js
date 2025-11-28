const express = require('express');
const router = express.Router();
const db = require('../db');

router.post("/", (req, res) => {
    const { userId, token } = req.body;

    // Verify token, then:
    db.query(`UPDATE user_credentials SET lock_until=NULL, login_attempts=0 WHERE id=?`, [userId]);

    return res.json({ success: true });
});

module.exports = router;
