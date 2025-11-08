const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const db = require("../db");
require("dotenv").config();

const router = express.Router();

const privateKey = Buffer.from(process.env.SECRET_PRIVATE_KEY_BASE64, 'base64').toString('utf8');

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
      LEFT JOIN user_infos AS ui
        ON uc.id = ui.user_id
      WHERE uc.email = ? AND uc.authType = 0
    `;

    db.query(sql, [email], (err, results) => {
        if (err) {
            console.error("[DB ERROR]", err);
            return res.status(500).json({ error: "Internal server error" });
        }
        if (results.length === 0) {
            console.warn("[LOGIN] No user found with email:", email);
            return res.status(401).json({ error: "Invalid email or password" });
        }

        const user = results[0];

        if (user.isverified === 0) {
            console.warn("[LOGIN] User not verified:", email);
            return res.status(403).json({
                error: "Please check your email to verify and login your account",
            });
        }

        bcrypt.compare(password, user.password, (bcryptErr, isMatch) => {
            if (bcryptErr) {
                console.error("[BCRYPT ERROR]", bcryptErr);
                return res.status(500).json({ error: "Internal server error" });
            }
            if (!isMatch) {
                console.warn("[LOGIN] Wrong password for:", email);
                return res.status(401).json({ error: "Invalid email or password" });
            }

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
                console.log("[JITSI] Generating token for vet:", user.email);
                console.log("[JITSI] ENV APP_ID:", JITSI_APP_ID);
                console.log("[JITSI] ENV API_KEY:", JITSI_APP_API_KEY);
                console.log("[JITSI] PRIVATE_KEY exists?", !!PRIVATE_KEY);

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
                        exp: Math.floor(Date.now() / 1000) + 3 * 60 * 60, // 3 hours
                        nbf: Math.floor(Date.now() / 1000) - 10,
                    };

                    console.log("[JITSI] Payload:", JSON.stringify(payload, null, 2));

                    jitsiToken = jwt.sign(payload, PRIVATE_KEY, {
                        algorithm: "RS256",
                        header: { kid: JITSI_APP_API_KEY },
                    });

                    console.log("[JITSI] Token generated successfully");
                } catch (jwtErr) {
                    console.error("[JITSI ERROR] Failed to sign token:", jwtErr);
                }
            }

            res.status(200).json({
                message: "Login successful",
                user: userData,
                jitsiToken,
            });
        });
    });
});

module.exports = router;
