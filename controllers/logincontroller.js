const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const db = require("../db");
const sendEmailNotice = require('../config/mailerUnlockAccount');
require("dotenv").config();

const router = express.Router();

const privateKey = Buffer.from(process.env.SECRET_PRIVATE_KEY_BASE64, 'base64')
  .toString('utf8');

const PRIVATE_KEY = privateKey;
const JITSI_APP_ID = process.env.JAPP_ID;
const JITSI_APP_API_KEY = process.env.JAAPI_KEY;

router.post("/", (req, res) => {
    const { email, password } = req.body;

    const sql = `
      SELECT uc.*, ui.firstName, ui.middleName, ui.lastName, ui.suffix,
             ui.phoneNumber, ui.houseNum, ui.province, ui.municipality,
             ui.barangay, ui.zipCode, ui.profile_Pic, ui.bio
      FROM user_credentials AS uc
      LEFT JOIN user_infos AS ui ON uc.id = ui.user_id
      WHERE uc.email = ? AND uc.authType = 0
    `;

    db.query(sql, [email], async (err, results) => {
        if (err) return res.status(500).json({ error: "Internal server error" });

        if (results.length === 0) {
            return res.status(401).json({ error: "Invalid email or password" });
        }

        const user = results[0];
        const now = new Date();

        // 1️⃣ ACCOUNT LOCK CHECK
        if (user.lock_until && new Date(user.lock_until) > now) {
            const remaining = Math.ceil((new Date(user.lock_until) - now) / 60000);
            return res.status(403).json({
                error: `Account is locked. Try again in ${remaining} minute(s).`
            });
        }

        // 2️⃣ EMAIL VERIFICATION CHECK
        if (user.isverified === 0) {
            return res.status(403).json({
                error: "Please check your email to verify your account."
            });
        }

        // 3️⃣ PASSWORD CHECK
        bcrypt.compare(password, user.password, async (bcryptErr, isMatch) => {

            if (!isMatch) {

                const attempts = user.login_attempts + 1;
                let lockTime = null;

                if (attempts >= 3) {
                    // lock 10 minutes
                    lockTime = new Date(Date.now() + 10 * 60000);

                    db.query(
                      `UPDATE user_credentials SET login_attempts = 0, lock_until = ? WHERE id = ?`,
                      [lockTime, user.id]
                    );

                    // SEND UNLOCK EMAIL HERE
                    const unlockLink = `${process.env.DEFAULT_URL}/unlock-account/${user.id}`;

                    await sendEmailNotice({
                        toEmail: user.email,
                        firstName: user.firstName || "User",
                        verifyLink: unlockLink
                    });

                    return res.status(403).json({
                        error: "Too many failed attempts. Account locked for 10 minutes.",
                    });
                }

                // Save attempts
                db.query(
                    `UPDATE user_credentials SET login_attempts = ? WHERE id = ?`,
                    [attempts, user.id]
                );

                return res.status(401).json({
                    error: `Invalid password. Attempts left: ${3 - attempts}`,
                });
            }

            // 4️⃣ SUCCESS LOGIN → RESET ATTEMPTS
            db.query(
                `UPDATE user_credentials SET login_attempts = 0, lock_until = NULL WHERE id = ?`,
                [user.id]
            );

            // Build user object
            const userData = {
                id: user.id,
                email: user.email,
                username: user.userName,
                role: user.userRole,
                firstName: user.firstName,
                middleName: user.middleName,
                lastName: user.lastName,
                suffix: user.suffix,
                phone: user.phoneNumber,
                houseNum: user.houseNum,
                province: user.province,
                municipality: user.municipality,
                barangay: user.barangay,
                zipCode: user.zipCode,
                pic: user.profile_Pic,
                bio: user.bio,
            };

            let jitsiToken = null;

            if (user.userRole === "Veterinarian") {
                try {
                    jitsiToken = jwt.sign(
                        {
                            aud: "jitsi",
                            iss: "chat",
                            sub: JITSI_APP_ID,
                            room: "*",
                            context: {
                                user: {
                                    id: user.id,
                                    name: `${user.firstName} ${user.lastName}`,
                                    email: user.email,
                                    moderator: "true",
                                }
                            },
                            exp: Math.floor(Date.now() / 1000) + 10800,
                            nbf: Math.floor(Date.now() / 1000) - 10,
                        },
                        PRIVATE_KEY,
                        { algorithm: "RS256", header: { kid: JITSI_APP_API_KEY } }
                    );
                } catch (err) {
                    console.error("JWT Error:", err);
                }
            }

            res.status(200).json({
                message: "Login successful",
                user: userData,
                jitsiToken
            });
        });
    });
});

module.exports = router;
