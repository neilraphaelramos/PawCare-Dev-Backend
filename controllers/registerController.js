const express = require("express");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const db = require("../db");
const sendEmail = require("../config/mailer");
require("dotenv").config();

const router = express.Router();

router.post("/", async (req, res) => {
  const {
    firstName, middleName, lastName, suffix,
    username, email, phone,
    houseNum, province, municipality, barangay, zipCode,
    password
  } = req.body;

  if (!email) {
    return res.status(400).json({ error: "Email is required" });
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const token = crypto.randomBytes(32).toString("hex");
  const verifyLink = `${process.env.DEFAULT_URL}/verify?token=${token}`;

  db.getConnection((err, connection) => {
    if (err) return res.status(500).json({ error: "Database connection error" });

    connection.beginTransaction(async (err) => {
      if (err) {
        connection.release();
        return res.status(500).json({ error: "Failed to start transaction" });
      }

      try {
        // 1️⃣ Send Email First
        await sendEmail({ toEmail: email, firstName, verifyLink });

        // 2️⃣ Insert Credentials
        const sqlCredentials = `
          INSERT INTO user_credentials 
          (userName, email, password, userRole, isverified, authType)
          VALUES (?, ?, ?, 'User', 0, 0)
        `;

        const [credResult] = await connection.promise().query(sqlCredentials, [
          username, email, hashedPassword
        ]);

        const userId = credResult.insertId;

        // 3️⃣ Insert User Info
        const sqlInfo = `
          INSERT INTO user_infos
          (user_id, firstName, middleName, lastName, suffix, phoneNumber, houseNum, province, municipality, barangay, zipCode)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        await connection.promise().query(sqlInfo, [
          userId, firstName, middleName, lastName, suffix,
          phone, houseNum, province, municipality, barangay, zipCode
        ]);

        // 4️⃣ Insert Token
        const sqlToken = `
          INSERT INTO user_verification (user_id, token)
          VALUES (?, ?)
        `;

        await connection.promise().query(sqlToken, [userId, token]);

        // 🎉 5️⃣ COMMIT EVERYTHING
        connection.commit(() => {
          connection.release();
          res.status(200).json({
            message: "Registration successful. Please check your email.",
          });
        });

      } catch (error) {
        console.error("Transaction Error:", error);

        // ❌ Roll Back All Inserts
        connection.rollback(() => {
          connection.release();
          if (error.code === "ER_DUP_ENTRY") {
            return res.status(400).json({
              error: "Phone number or email already exists",
              field: error.sqlMessage.includes("phoneNumber") ? "phone" : "email"
            });
          }
          res.status(500).json({ error: "Registration failed" });
        });
      }
    });
  });
});

module.exports = router;
