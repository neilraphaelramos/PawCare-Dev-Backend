const express = require("express");
const bcrypt = require("bcrypt");
const db = require("../db");
const { uploadProfile } = require("../config/multerConfig");
const cloudinary = require("../config/cloudinaryConfig");

const router = express.Router();

router.post("/", uploadProfile, async (req, res) => {
  try {
    const {
      id,
      firstName,
      middleName,
      lastName,
      suffix,
      phone,
      houseNumber,
      province,
      municipality,
      barangay,
      zipCode,
      bio,
      currentPassword,
      newPassword,
      password,
    } = req.body;

    if (!id) return res.status(400).json({ error: "User ID is required" });

    // 🔹 Fetch current user credentials
    const [user] = await new Promise((resolve, reject) => {
      db.query("SELECT * FROM user_credentials WHERE id = ?", [id], (err, results) => {
        if (err) reject(err);
        else resolve(results);
      });
    });

    if (!user) return res.status(404).json({ error: "User not found" });

    // 🔹 Fetch user info for old profile pic
    const [userInfo] = await new Promise((resolve, reject) => {
      db.query("SELECT profile_Pic FROM user_infos WHERE user_ID = ?", [id], (err, results) => {
        if (err) reject(err);
        else resolve(results);
      });
    });

    const updatesInfo = [];
    const paramsInfo = [];

    if (firstName !== undefined) { updatesInfo.push("firstName = ?"); paramsInfo.push(firstName || null); }
    if (middleName !== undefined) { updatesInfo.push("middleName = ?"); paramsInfo.push(middleName || null); }
    if (lastName !== undefined) { updatesInfo.push("lastName = ?"); paramsInfo.push(lastName || null); }
    if (suffix !== undefined) { updatesInfo.push("suffix = ?"); paramsInfo.push(suffix || null); }
    if (phone !== undefined) { updatesInfo.push("phoneNumber = ?"); paramsInfo.push(phone || null); }
    if (houseNumber !== undefined) { updatesInfo.push("houseNum = ?"); paramsInfo.push(houseNumber || null); }
    if (province !== undefined) { updatesInfo.push("province = ?"); paramsInfo.push(province || null); }
    if (municipality !== undefined) { updatesInfo.push("municipality = ?"); paramsInfo.push(municipality || null); }
    if (barangay !== undefined) { updatesInfo.push("barangay = ?"); paramsInfo.push(barangay || null); }
    if (zipCode !== undefined) { updatesInfo.push("zipCode = ?"); paramsInfo.push(zipCode || null); }
    if (bio !== undefined) { updatesInfo.push("bio = ?"); paramsInfo.push(bio || null); }

    // 🔹 Handle new profile picture upload
    if (req.file && req.file.path) {
      // 🧹 Delete old Cloudinary image if it exists
      if (userInfo && userInfo.profile_Pic) {
        const oldUrl = userInfo.profile_Pic;
        const publicIdMatch = oldUrl.match(/\/upload\/(?:v\d+\/)?([^\.]+)/);
        const publicId = publicIdMatch ? publicIdMatch[1] : null;

        if (publicId) {
          try {
            console.log(`[DEBUG] Deleting old Cloudinary image: ${publicId}`);
            await cloudinary.uploader.destroy(publicId);
          } catch (err) {
            console.error("[Cloudinary Delete Error]:", err.message);
          }
        }
      }

      updatesInfo.push("profile_Pic = ?");
      paramsInfo.push(req.file.path);
    }

    paramsInfo.push(id);

    // 🔹 Handle password change
    if (currentPassword && newPassword && password) {
      const isMatch = await bcrypt.compare(currentPassword, user.password);
      if (!isMatch) return res.status(400).json({ error: "Current password is incorrect" });
      if (newPassword !== password) return res.status(400).json({ error: "Passwords do not match" });

      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await new Promise((resolve, reject) => {
        db.query("UPDATE user_credentials SET password = ? WHERE id = ?", [hashedPassword, id], (err, results) => {
          if (err) reject(err);
          else resolve(results);
        });
      });
    }

    // 🔹 Update user info
    if (updatesInfo.length > 0) {
      const sql = `UPDATE user_infos SET ${updatesInfo.join(", ")} WHERE user_ID = ?`;
      await new Promise((resolve, reject) => {
        db.query(sql, paramsInfo, (err, results) => {
          if (err) reject(err);
          else resolve(results);
        });
      });
    }

    // 🔹 Fetch updated user data
    const [updatedUser] = await new Promise((resolve, reject) => {
      const fetchsql = `
        SELECT uc.*, ui.firstName, ui.middleName, ui.lastName, ui.suffix,
               ui.phoneNumber, ui.houseNum, ui.province, ui.municipality,
               ui.barangay, ui.zipCode, ui.profile_Pic, ui.bio
        FROM user_credentials AS uc
        LEFT JOIN user_infos AS ui ON uc.id = ui.user_id
        WHERE uc.id = ?`;
      db.query(fetchsql, [id], (err, results) => {
        if (err) reject(err);
        else resolve(results);
      });
    });

    const userData = {
      id: updatedUser.id,
      email: updatedUser.email,
      username: updatedUser.userName,
      role: updatedUser.userRole,
      firstName: updatedUser.firstName,
      middleName: updatedUser.middleName,
      lastName: updatedUser.lastName,
      suffix: updatedUser.suffix,
      phone: updatedUser.phoneNumber,
      houseNum: updatedUser.houseNum,
      province: updatedUser.province,
      municipality: updatedUser.municipality,
      barangay: updatedUser.barangay,
      zipCode: updatedUser.zipCode,
      pic: updatedUser.profile_Pic || null,
      bio: updatedUser.bio,
    };

    res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      user: userData,
    });
  } catch (err) {
    console.error("Server error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
