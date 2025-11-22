const express = require('express');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const db = require('../db');
const sendEmail = require('../config/mailerV2');
const { resetPasswordTemplate } = require('../config/emailTemplates');
require('dotenv').config();
const router = express.Router();

router.post('/', async (req, res) => {
    const { email } = req.body;

    if (!email) {
        return res.status(400).json({ error: 'Email is required' });
    }

    try {
        const sql_check = `
            SELECT uc.id AS userId, ui.firstName 
            FROM user_infos ui 
            JOIN user_credentials uc ON ui.user_id = uc.id 
            WHERE uc.email = ?
            `;
        db.query(sql_check, [email], async (err, results) => {
            if (err) {
                console.error('Database error:', err);
                return res.status(500).json({ error: 'Internal server error' });
            }
            if (results.length === 0) {
                return res.status(404).json({ error: 'Email not found' });
            }
            const userId = results[0].userId;
            const resetToken = crypto.randomBytes(32).toString('hex');
            const hashedToken = await bcrypt.hash(resetToken, 10);
            const tokenExpiry = Date.now() + 3600000;
            const sql_update = 'UPDATE user_credentials SET resetToken = ?, resetTokenExpiry = ? WHERE id = ?';
            db.query(sql_update, [hashedToken, tokenExpiry, userId], async (err) => {
                if (err) {
                    console.error('Database error:', err);
                    return res.status(500).json({ error: 'Internal server error' });
                }
                const resetLink = `${process.env.DEFAULT_URL}/reset-password-verify?token=${resetToken}&id=${userId}`;

                const html = resetPasswordTemplate(email, results[0].firstName, resetLink);

                try {
                    sendEmail({
                        to: email,
                        subject: "Reset Your Password",
                        html: html
                    })
                    return res.json({ message: 'Password reset link sent to your email.' });
                } catch (emailErr) {
                    console.error('Email sending error:', emailErr);
                    return res.status(500).json({ error: 'Failed to send reset email' });
                }
            });
        });
    } catch (err) {
        console.error('Server error:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

router.patch('/reset', async (req, res) => {
    const { userId, token, newPassword } = req.body;

    if (!userId || !token || !newPassword) {
        return res.status(400).json({ error: 'All fields are required' });
    }

    try {
        const sql_get = 'SELECT resetToken, resetTokenExpiry FROM user_credentials WHERE id = ?';
        db.query(sql_get, [userId], async (err, results) => {
            if (err) {
                console.error('Database error:', err);
                return res.status(500).json({ error: 'Internal server error' });
            }

            if (results.length === 0) {
                return res.status(400).json({ error: 'Invalid user' });
            }

            const { resetToken: hashedToken, resetTokenExpiry } = results[0];

            if (!hashedToken || !resetTokenExpiry) {
                return res.status(400).json({ error: 'No reset request found for this user.' });
            }

            if (Date.now() > resetTokenExpiry) {
                return res.status(400).json({ error: 'Reset token has expired' });
            }

            const isValidToken = await bcrypt.compare(token, hashedToken);
            if (!isValidToken) {
                return res.status(400).json({ error: 'Invalid token' });
            }

            const newHashedPassword = await bcrypt.hash(newPassword, 10);

            // Ensure columns names match your database
            const sql_update =
                'UPDATE user_credentials SET password = ?, resetToken = NULL, resetTokenExpiry = NULL WHERE id = ?';

            db.query(sql_update, [newHashedPassword, userId], (err, result) => {
                if (err) {
                    console.error('Database error:', err);
                    return res.status(500).json({ error: 'Internal server error' });
                }

                if (result.affectedRows === 0) {
                    return res.status(400).json({ error: 'Failed to reset password.' });
                }

                return res.json({ message: 'Password has been reset successfully.' });
            });
        });
    } catch (err) {
        console.error('Server error:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/reset/validate', async (req, res) => {
    const { token, id } = req.query;

    if (!token || !id) {
        return res.status(400).json({ error: 'Token and User ID are required' });
    }

    try {
        const sql_get = 'SELECT resetToken, resetTokenExpiry FROM user_credentials WHERE id = ?';
        db.query(sql_get, [id], async (err, results) => {
            if (err) {
                console.error('Database error:', err);
                return res.status(500).json({ error: 'Internal server error' });
            }

            if (results.length === 0) {
                return res.status(404).json({ error: 'User not found' });
            }

            const { resetToken, resetTokenExpiry } = results[0];

            if (!resetToken || !resetTokenExpiry) {
                return res.status(400).json({ error: 'No reset request found for this user.' });
            }

            if (Date.now() > resetTokenExpiry) {
                return res.status(400).json({ error: 'Reset token has expired' });
            }

            const isValidToken = await bcrypt.compare(token, resetToken);
            if (!isValidToken) {
                return res.status(400).json({ error: 'Invalid reset token' });
            }

            return res.json({ message: 'Reset token is valid' });
        });
    } catch (err) {
        console.error('Server error:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;