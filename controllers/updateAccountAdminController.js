const express = require("express");
const bcrypt = require("bcrypt");
const db = require("../db"); // Make sure this is your MySQL connection
const { uploadProfile } = require("../config/multerConfig"); // Multer middleware
const cloudinary = require("../config/cloudinaryConfig");

const router = express.Router();

// Admin updates a user account
router.post("/", uploadProfile, async (req, res) => {
  try {
    let { id, firstName, middleName, lastName, suffix, username, email, phone, password, role } = req.body;

    if (!id) return res.status(400).json({ error: "User ID is required" });
    const idValue = Array.isArray(id) ? id[0] : id;

    // 🔹 Hash password if provided
    let hashedPassword = null;
    if (password && password.trim() !== "") {
      hashedPassword = await bcrypt.hash(password, 10);
    }

    // 🔹 Handle profile picture
    let imageUrl = null;
    if (req.file && req.file.path) {
      imageUrl = req.file.path;

      // Optional: delete old Cloudinary image
      const [userInfo] = await new Promise((resolve, reject) => {
        db.query("SELECT profile_Pic FROM user_infos WHERE user_ID = ?", [idValue], (err, results) => {
          if (err) reject(err);
          else resolve(results);
        });
      });

      if (userInfo && userInfo.profile_Pic) {
        const oldUrl = userInfo.profile_Pic;
        const publicIdMatch = oldUrl.match(/\/upload\/(?:v\d+\/)?([^\.]+)/);
        const publicId = publicIdMatch ? publicIdMatch[1] : null;
        if (publicId) {
          try {
            await cloudinary.uploader.destroy(publicId);
          } catch (err) {
            console.error("Cloudinary delete error:", err.message);
          }
        }
      }
    }

    // 🔹 Update credentials
    const updateCredentialSql = `
      UPDATE user_credentials
      SET userName = ?, email = ?, userRole = ? ${hashedPassword ? ", password = ?" : ""}
      WHERE id = ?`;
    const credentialParams = hashedPassword
      ? [username, email, role, hashedPassword, idValue]
      : [username, email, role, idValue];

    await new Promise((resolve, reject) => {
      db.query(updateCredentialSql, credentialParams, (err, results) => {
        if (err) reject(err);
        else resolve(results);
      });
    });

    // 🔹 Update user info
    const updateInfoSql = `
      UPDATE user_infos
      SET firstName = ?, middleName = ?, lastName = ?, suffix = ?, phoneNumber = ? ${imageUrl ? ", profile_Pic = ?" : ""}
      WHERE user_ID = ?`;
    const infoParams = imageUrl
      ? [firstName, middleName, lastName, suffix, phone, imageUrl, idValue]
      : [firstName, middleName, lastName, suffix, phone, idValue];

    await new Promise((resolve, reject) => {
      db.query(updateInfoSql, infoParams, (err, results) => {
        if (err) reject(err);
        else resolve(results);
      });
    });

    res.json({ message: "Account updated successfully!" });
  } catch (err) {
    console.error("Server error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
