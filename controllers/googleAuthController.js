const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const db = require("../db");
require("dotenv").config();
const { OAuth2Client } = require('google-auth-library');
const router = express.Router();

const PRIVATE_KEY = null;
const JITSI_APP_ID = process.env.JAPP_ID;
const JITSI_APP_API_KEY = process.env.JAAPI_KEY;
const google_Client_ID = process.env.GClient_ID;
const CLIENT = new OAuth2Client(google_Client_ID);

router.post("/", async (req, res) => {
    const { token } = req.body;

    try {
        const ticket = await CLIENT.verifyIdToken({
            idToken: token,
            audience: google_Client_ID,
        });

        const fetchsql = `
        SELECT uc.*, ui.firstName, ui.middleName, ui.lastName, ui.suffix,
               ui.phoneNumber, ui.houseNum, ui.province, ui.municipality,
               ui.barangay, ui.zipCode, ui.profile_Pic, ui.bio
        FROM user_credentials AS uc
        LEFT JOIN user_infos AS ui
          ON uc.id = ui.user_id
        WHERE uc.email = ? AND uc.authType = 1
      `;

        const sql_informations = `
        INSERT INTO user_infos (user_id, firstName, lastName)
        VALUES (?, ?, ?)
      `;

        const payload = ticket.getPayload();
        let { email, given_name, family_name } = payload;
        let username = email.split("@")[0];

        if (!family_name) {
            family_name = null;
        }

        const sqlCheck = 'SELECT * FROM user_credentials WHERE email = ?';
        db.query(sqlCheck, [email], async (err, results) => {
            if (err) {
                console.error('DB error:', err);
                return res.status(500).json({ error: 'Database error' });
            }

            if (results.length > 0) {
                // ✅ If user already exists, make sure they are marked as verified
                db.query(
                    'UPDATE user_credentials SET isverified = 1 WHERE email = ?',
                    [email],
                    (updateErr) => {
                        if (updateErr) console.error('Error updating verification status:', updateErr);
                    }
                );

                // ✅ Fetch full user info for login
                db.query(fetchsql, [email], (err, results) => {
                    if (err) {
                        console.error('Login error:', err);
                        return res.status(500).json({ error: 'Internal server error' });
                    }

                    if (results.length === 0) {
                        return res.status(401).json({ error: 'User Data Not Found' });
                    }

                    const user = results[0];

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
                        pic: user.profile_Pic ? Buffer.from(user.profile_Pic).toString("base64") : null,
                        bio: user.bio,
                    };

                    // (Jitsi token logic unchanged)
                    let jitsiToken = null;
                    if (user.userRole === "Veterinarian") {
                        try {
                            const payload = {
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
                                    },
                                    features: {
                                        livestreaming: "true",
                                        recording: "true",
                                        transcription: "true",
                                    },
                                },
                                exp: Math.floor(Date.now() / 1000) + 3 * 60 * 60,
                                nbf: Math.floor(Date.now() / 1000) - 10,
                            };

                            jitsiToken = jwt.sign(payload, PRIVATE_KEY, {
                                algorithm: "RS256",
                                header: { kid: JITSI_APP_API_KEY },
                            });
                        } catch (jwtErr) {
                            console.error("[JITSI ERROR] Failed to sign token:", jwtErr);
                        }
                    }

                    return res.status(200).json({
                        message: 'Google login successful',
                        user: userData,
                        jitsiToken,
                    });
                });

            } else {
                // New Google user → insert with verified = 1 ✅
                const sqlInsert = `
            INSERT INTO user_credentials (userName, email, password, isverified, authType)
            VALUES (?, ?, ?, 1, 1)
          `;
                const hashedPassword = await bcrypt.hash('GOOGLE_AUTH', 10);

                db.query(sqlInsert, [username, email, hashedPassword], (insertErr, result) => {
                    if (insertErr) {
                        console.error('Registration error:', insertErr);
                        return res.status(500).json({ error: 'Registration failed' });
                    }

                    db.query(sql_informations, [result.insertId, given_name, family_name], (err) => {
                        if (err) {
                            console.error('Registration error:', err);
                            return res.status(500).json({ error: 'Registration failed' });
                        }

                        db.query(fetchsql, [email], (err, results) => {
                            if (err) {
                                console.error('Login error:', err);
                                return res.status(500).json({ error: 'Internal server error' });
                            }

                            if (results.length === 0) {
                                return res.status(401).json({ error: 'User Data Not Found' });
                            }

                            const user = results[0];

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
                                pic: user.profile_Pic ? Buffer.from(user.profile_Pic).toString("base64") : null,
                                bio: user.bio,
                            };

                            // Jitsi token logic unchanged
                            let jitsiToken = null;
                            if (user.userRole === "Veterinarian") {
                                try {
                                    const payload = {
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
                                            },
                                            features: {
                                                livestreaming: "true",
                                                recording: "true",
                                                transcription: "true",
                                            },
                                        },
                                        exp: Math.floor(Date.now() / 1000) + 3 * 60 * 60,
                                        nbf: Math.floor(Date.now() / 1000) - 10,
                                    };

                                    jitsiToken = jwt.sign(payload, PRIVATE_KEY, {
                                        algorithm: "RS256",
                                        header: { kid: JITSI_APP_API_KEY },
                                    });
                                } catch (jwtErr) {
                                    console.error("[JITSI ERROR] Failed to sign token:", jwtErr);
                                }
                            }

                            return res.status(200).json({
                                message: 'Google registration successful',
                                user: userData,
                                jitsiToken,
                            });
                        });
                    });
                });
            }
        });
    } catch (error) {
        console.error('Google auth error:', error);
        res.status(400).json({ error: 'Invalid Google token' });
    }
});

module.exports = router;
