const express = require("express");
const bcrypt = require("bcrypt");
const db = require("../db");

const router = express.Router();

router.post("/", async (req, res) => {
    const { firstName, middleName, lastName, suffix, username, email, phone, password, role, image } = req.body;

    try {
        const hashedPassword = await bcrypt.hash(password, 10);

        let setRole;
        if (role === 'User') {
            setRole = "User";
        } else if (role === 'Admin') {
            setRole = "Admin"
        } else {
            setRole = "Veterinarian";
        }

        let imageBuffer = null;
        if (image) {
            const base64Data = image.replace(/^data:.+;base64,/, "");
            imageBuffer = Buffer.from(base64Data, "base64");
        }

        const sql_credentials = `
        INSERT INTO user_credentials (userName, email, password, userRole)
        VALUES (?, ?, ?, ?)
      `;

        const sql_informations = `
        INSERT INTO user_infos 
        (user_id, firstName, middleName, lastName, suffix, phoneNumber, profile_Pic)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `;

        db.query(sql_credentials, [username, email, hashedPassword, setRole], (err, result) => {
            if (err) {
                console.error('DB credentials insert error:', err);
                return res.status(500).json({ error: 'Add Account failed (credentials)' });
            }

            const info_values = [result.insertId, firstName, middleName, lastName, suffix, phone, imageBuffer];

            db.query(sql_informations, info_values, (err2) => {
                if (err2) {
                    console.error('DB infos insert error:', err2);
                    return res.status(500).json({ error: 'Add Account failed (infos)' });
                }

                return res.status(200).json({ message: 'Add Account Successful' });
            });
        });

    } catch (err) {
        console.error('Server error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;
