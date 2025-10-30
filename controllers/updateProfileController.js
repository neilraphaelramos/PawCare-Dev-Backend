const express = require("express");
const bcrypt = require("bcrypt");
const db = require("../db");
const { uploadProfile } = require("../config/multerConfig"); // ✅ Import Cloudinary uploader

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

    const [user] = await new Promise((resolve, reject) => {
      db.query("SELECT * FROM user_credentials WHERE id = ?", [id], (err, results) => {
        if (err) reject(err);
        else resolve(results);
      });
    });

    if (!user) return res.status(404).json({ error: "User not found" });

    const updatesInfo = [];
    const paramsInfo = [];

    if (firstName) { updatesInfo.push("firstName = ?"); paramsInfo.push(firstName); }
    if (middleName) { updatesInfo.push("middleName = ?"); paramsInfo.push(middleName); }
    if (lastName) { updatesInfo.push("lastName = ?"); paramsInfo.push(lastName); }
    if (suffix) { updatesInfo.push("suffix = ?"); paramsInfo.push(suffix); }
    if (phone) { updatesInfo.push("phoneNumber = ?"); paramsInfo.push(phone); }
    if (houseNumber) { updatesInfo.push("houseNum = ?"); paramsInfo.push(houseNumber); }
    if (province) { updatesInfo.push("province = ?"); paramsInfo.push(province); }
    if (municipality) { updatesInfo.push("municipality = ?"); paramsInfo.push(municipality); }
    if (barangay) { updatesInfo.push("barangay = ?"); paramsInfo.push(barangay); }
    if (zipCode) { updatesInfo.push("zipCode = ?"); paramsInfo.push(zipCode); }
    if (bio) { updatesInfo.push("bio = ?"); paramsInfo.push(bio); }

    if (req.file && req.file.path) {
      updatesInfo.push("profile_Pic = ?");
      paramsInfo.push(req.file.path);
    }

    paramsInfo.push(id);

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

    if (updatesInfo.length > 0) {
      const sql = `UPDATE user_infos SET ${updatesInfo.join(", ")} WHERE user_ID = ?`;
      await new Promise((resolve, reject) => {
        db.query(sql, paramsInfo, (err, results) => {
          if (err) reject(err);
          else resolve(results);
        });
      });
    }

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
