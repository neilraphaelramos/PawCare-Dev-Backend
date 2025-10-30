const express = require('express');
const db = require('../db');

const router = express.Router();

router.get('/', (req, res) => {
    const { token } = req.query;

    const sql_find = `
    SELECT user_id, created_at 
    FROM user_verification 
    WHERE token = ?
  `;
    db.query(sql_find, [token], (err, results) => {
        if (err || results.length === 0) {
            return res.status(400).send('Invalid or expired verification link.');
        }

        const { user_id, created_at } = results[0];

        // Check if token is older than 24 hours
        const tokenAgeHours = (Date.now() - new Date(created_at)) / (1000 * 60 * 60);
        if (tokenAgeHours > 24) {
            // Delete expired token
            db.query('DELETE FROM user_verification WHERE token = ?', [token]);
            return res.status(400).send('⏰ Verification link expired. Please request a new one.');
        }

        // Token is still valid → verify the user
        db.query('UPDATE user_credentials SET isverified = 1 WHERE id = ?', [user_id], (err2) => {
            if (err2) return res.status(500).send('Verification failed.');

            // Delete token after successful verification
            db.query('DELETE FROM user_verification WHERE token = ?', [token]);
            res.send('✅ Your account has been verified successfully!');
        });
    });
});

module.exports = router;
