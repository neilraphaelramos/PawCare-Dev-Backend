const express = require("express");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const db = require("../db");
const { uploadProfile } = require("../config/multerConfig");
const sendEmail = require("../config/mailer"); // EmailJS or any mailer function
require("dotenv").config();

const router = express.Router();

// Add new admin/user account with optional profile pic and email verification
router.post("/", uploadProfile, async (req, res) => {
  try {
    const {
      firstName,
      middleName,
      lastName,
      suffix,
      username,
      email,
      phone,
      role,
      password,
    } = req.body;

    // Required fields
    if (!firstName || !username || !email || !password || !role) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Determine role
    let setRole;
    if (role === "User") setRole = "User";
    else if (role === "Admin") setRole = "Admin";
    else setRole = "Veterinarian";

    // Profile picture path (optional)
    let imageUrl = null;
    if (req.file && req.file.path) {
      imageUrl = req.file.path;
    }

    // Insert credentials
    const sql_credentials = `
      INSERT INTO user_credentials (userName, email, password, userRole, isverified, authType)
      VALUES (?, ?, ?, ?, 0, 0)
    `;
    const credentialValues = [username, email, hashedPassword, setRole];

    db.query(sql_credentials, credentialValues, (err, result) => {
      if (err) {
        console.error("DB credentials insert error:", err);
        return res.status(500).json({ error: "Add Account failed (credentials)" });
      }

      const userId = result.insertId;

      // Insert user info
      const sql_informations = `
        INSERT INTO user_infos
        (user_id, firstName, middleName, lastName, suffix, phoneNumber, profile_Pic)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `;
      const infoValues = [
        userId,
        firstName,
        middleName || null,
        lastName || null,
        suffix || null,
        phone || null,
        imageUrl,
      ];

      db.query(sql_informations, infoValues, (err2) => {
        if (err2) {
          console.error("DB infos insert error:", err2);
          return res.status(500).json({ error: "Add Account failed (infos)" });
        }

        // Generate verification token
        const token = crypto.randomBytes(32).toString("hex");
        const sql_token = `INSERT INTO user_verification (user_id, token) VALUES (?, ?)`;

        db.query(sql_token, [userId, token], async (err3) => {
          if (err3) {
            console.error("Token insert error:", err3);
            return res.status(500).json({ error: "Add Account failed (token)" });
          }

          const verifyLink = `${process.env.DEFAULT_URL}/verify?token=${token}`;

          try {
            await sendEmail({
              toEmail: email,
              firstName,
              verifyLink,
            });

            return res.status(200).json({
              message:
                "Account added successfully. Verification email sent to user.",
            });
          } catch (emailErr) {
            console.error("Email sending error:", emailErr);
            return res.status(500).json({
              error: "Account added, but failed to send verification email",
            });
          }
        });
      });
    });
  } catch (err) {
    console.error("Server error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
