const express = require('express');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const db = require('../db');
const sendEmail = require('../config/mailer'); // EmailJS
require('dotenv').config();

const router = express.Router();

router.post('/', async (req, res) => {
  const {
    firstName,
    middleName,
    lastName,
    suffix,
    username,
    email,
    phone,
    houseNum,
    province,
    municipality,
    barangay,
    zipCode,
    password,
  } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);

    const sql_credentials = `
      INSERT INTO user_credentials 
      (userName, email, password, userRole, isverified, authType)
      VALUES (?, ?, ?, ?, 0, 0)
    `;
    const credential_values = [username, email, hashedPassword, 'User'];

    db.query(sql_credentials, credential_values, (err, result) => {
      if (err) {
        console.error('Registration error:', err);
        return res.status(500).json({ error: 'Registration failed' });
      }

      const userId = result.insertId;

      const sql_informations = `
        INSERT INTO user_infos
        (user_id, firstName, middleName, lastName, suffix, phoneNumber, houseNum, province, municipality, barangay, zipCode)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      const info_values = [
        userId,
        firstName,
        middleName,
        lastName,
        suffix,
        phone,
        houseNum,
        province,
        municipality,
        barangay,
        zipCode,
      ];

      db.query(sql_informations, info_values, (err2) => {
        if (err2) {
          console.error('Registration error:', err2);
          return res.status(500).json({ error: 'Registration failed' });
        }

        const token = crypto.randomBytes(32).toString('hex');
        const sql_token = `
          INSERT INTO user_verification (user_id, token)
          VALUES (?, ?)
        `;

        db.query(sql_token, [userId, token], async (err3) => {
          if (err3) {
            console.error('Token insert error:', err3);
            return res.status(500).json({ error: 'Registration failed' });
          }

          const verifyLink = `${process.env.DEFAULT_URL}/verify?token=${token}`;

          try {
            await sendEmail({ toEmail: email, firstName, verifyLink });
            res.status(200).json({
              message:
                'Registration successful. Please check your email to verify your account.',
            });
          } catch (emailErr) {
            console.error('Email sending error:', emailErr);
            res.status(500).json({ error: 'Failed to send verification email' });
          }
        });
      });
    });
  } catch (err) {
    console.error('Hashing error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
