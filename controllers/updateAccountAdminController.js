const express = require("express");
const bcrypt = require("bcrypt");
const db = require("../db");
const router = express.Router();
const { uploadProfile } = require("../config/multerConfig");

router.post("/", uploadProfile, async (req, res) => {
  let { id, firstName, middleName, lastName, suffix, username, email, phone, password, role } = req.body;

  const idValue = Array.isArray(id) ? id[0] : id;

  try {
    let hashedPassword = null;
    if (password && password.trim() !== "") {
      hashedPassword = await bcrypt.hash(password, 10);
    }

    const imageUrl = req.file ? req.file.path : null;

    const updateCredentialSql = `
      UPDATE user_credentials 
      SET userName = ?, email = ?, userRole = ? ${hashedPassword ? ", password = ?" : ""} 
      WHERE id = ?`;

    const credentialParams = hashedPassword
      ? [username, email, role, hashedPassword, idValue]
      : [username, email, role, idValue];

    const updateInfoSql = `
      UPDATE user_infos 
      SET firstName = ?, middleName = ?, lastName = ?, suffix = ?, phoneNumber = ? 
      ${imageUrl ? ", profile_Pic = ?" : ""} 
      WHERE user_ID = ?`;

    const infoParams = imageUrl
      ? [firstName, middleName, lastName, suffix, phone, imageUrl, idValue]
      : [firstName, middleName, lastName, suffix, phone, idValue];

    db.beginTransaction((err) => {
      if (err) return res.status(500).json({ error: "Transaction failed" });

      db.query(updateCredentialSql, credentialParams, (err) => {
        if (err) {
          return db.rollback(() => {
            console.error(err);
            res.status(500).json({ error: "Failed to update credentials" });
          });
        }

        db.query(updateInfoSql, infoParams, (err) => {
          if (err) {
            return db.rollback(() => {
              console.error(err);
              res.status(500).json({ error: "Failed to update user info" });
            });
          }

          db.commit((err) => {
            if (err) {
              return db.rollback(() => {
                console.error(err);
                res.status(500).json({ error: "Commit failed" });
              });
            }
            res.json({ message: "Account updated successfully!" });
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
