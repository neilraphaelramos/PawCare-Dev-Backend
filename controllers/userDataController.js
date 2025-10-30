const express = require('express');
const db = require('../db');

const router = express.Router();

router.post('/', (req, res) => {
    const sql = `
    SELECT 
      uc.*, 
      ui.firstName, ui.middleName, ui.lastName, ui.suffix,
      ui.phoneNumber, ui.houseNum, ui.province, ui.municipality,
      ui.barangay, ui.zipCode, ui.profile_Pic, ui.bio
    FROM user_credentials AS uc
    LEFT JOIN user_infos AS ui
      ON uc.id = ui.user_id
  `;

    db.query(sql, (err, result) => {
        if (err) {
            console.error("Error fetching data:", err);
            return res.status(500).json({ error: "Database error" });
        }

        const formattedUsers = result.map((user) => ({
            id: user.id,
            firstName: user.firstName,
            middleName: user.middleName,
            lastName: user.lastName,
            suffix: user.suffix,
            username: user.userName,
            email: user.email,
            phone: user.phoneNumber,
            role: user.userRole,
            image: user.profile_Pic,
            address: `${user.houseNum || ""}, ${user.barangay || ""}, ${user.municipality || ""}, ${user.province || ""}, ${user.zipCode || ""}`.trim(),
            bio: user.bio || ""
        }));

        res.json(formattedUsers);
    });
});

module.exports = router;
