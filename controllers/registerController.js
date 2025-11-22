const express = require("express");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const db = require("../db");
const sendEmail = require("../config/mailer");
require("dotenv").config();

const router = express.Router();

router.post("/", async (req, res) => {
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
    return res.status(400).json({ error: "Email is required" });
  }

  try {
    // -----------------------------
    // 1️⃣ Hash password early
    // -----------------------------
    const hashedPassword = await bcrypt.hash(password, 10);

    // -----------------------------
    // 2️⃣ Generate email verification token
    // -----------------------------
    const token = crypto.randomBytes(32).toString("hex");
    const verifyLink = `${process.env.DEFAULT_URL}/verify?token=${token}`;

    // -----------------------------
    // 4️⃣ Send email BEFORE database insert
    // -----------------------------
    try {
      await sendEmail({ toEmail: email, firstName, verifyLink });
    } catch (emailErr) {
      console.error("Email sending error:", emailErr);
      return res.status(500).json({ error: "Failed to send verification email. Registration aborted." });
    }

    // -----------------------------
    // 5️⃣ Insert into user_credentials
    // -----------------------------
    const sqlCredentials = `
      INSERT INTO user_credentials 
      (userName, email, password, userRole, isverified, authType)
      VALUES (?, ?, ?, ?, 0, 0)
    `;
    const credentialValues = [username, email, hashedPassword, "User"];

    db.query(sqlCredentials, credentialValues, (err, result) => {
      if (err) {
        console.error("Registration error:", err);
        return res.status(500).json({ error: "Registration failed" });
      }

      const userId = result.insertId;

      // -----------------------------
      // 6️⃣ Insert into user_infos
      // -----------------------------
      const sqlInfo = `
        INSERT INTO user_infos
        (user_id, firstName, middleName, lastName, suffix, phoneNumber, houseNum, province, municipality, barangay, zipCode)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      const infoValues = [
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

      db.query(sqlInfo, infoValues, (err2) => {
        if (err2) {
          console.error("Registration error:", err2);
          return res.status(500).json({ error: "Registration failed" });
        }

        // -----------------------------
        // 7️⃣ Insert verification token
        // -----------------------------
        const sqlToken = `
          INSERT INTO user_verification (user_id, token)
          VALUES (?, ?)
        `;

        db.query(sqlToken, [userId, token], (err3) => {
          if (err3) {
            console.error("Token insert error:", err3);
            return res.status(500).json({ error: "Registration failed" });
          }

          // -----------------------------
          // 🎉 SUCCESS
          // -----------------------------
          res.status(200).json({
            message: "Registration successful. Please check your email to verify your account.",
          });
        });
      });
    });
  } catch (err) {
    console.error("Server error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
