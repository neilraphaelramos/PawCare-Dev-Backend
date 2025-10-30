const express = require('express');
const router = express.Router();
const db = require('../db');
const { uploadService } = require('../config/multerConfig');
const cloudinary = require("../config/cloudinaryConfig");

// 🧾 Fetch all services
router.post('/fetch', (req, res) => {
    const fetchDataServicesSQL = `SELECT * FROM services`;

    db.query(fetchDataServicesSQL, (err, results) => {
        if (err) {
            console.error("Error fetching data:", err);
            return res.status(500).json({ error: "Database error" });
        };

        const servicesData = results.map((service) => ({
            id: service.id,
            title: service.title,
            description: service.description,
            image: service.image,
        }));

        res.json(servicesData);
    })
});

// ➕ Add a new service
router.post('/add', uploadService, (req, res) => {
    const { title, description } = req.body;

    if (!title || !description || !req.file) {
        return res.status(400).json({ success: false, message: "Missing required fields" });
    }

    const imageUrl = req.file.path;

    const insertSQL = "INSERT INTO services (title, description, image) VALUES (?, ?, ?)";
    db.query(insertSQL, [title, description, imageUrl], (err, result) => {
        if (err) {
            console.error("Error inserting service:", err);
            return res.status(500).json({ success: false, message: "Database error" });
        }
        res.json({
            success: true,
            message: "Service added successfully",
            id: result.insertId,
            image: imageUrl,
        });
    });
});

// ✏️ Update an existing service
router.put('/update/:id', uploadService, async (req, res) => {
  const { id } = req.params;
  const { title, description } = req.body;
  const newImage = req.file ? req.file.path : null;

  if (!title || !description) {
    return res.status(400).json({ success: false, message: "Title and description are required" });
  }

  try {
    const [rows] = await db.promise().query("SELECT image FROM services WHERE id = ?", [id]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: "Service not found" });
    }

    const oldImage = rows[0].image;

    if (newImage && oldImage) {
      try {
        const segments = oldImage.split("/");
        const filename = segments.pop();
        const folder = segments.slice(-2, -1)[0]; 
        const publicId = `${folder}/${filename.split(".")[0]}`;
        await cloudinary.uploader.destroy(publicId);
        console.log("🗑 Deleted old Cloudinary image:", publicId);
      } catch (err) {
        console.warn("⚠️ Could not delete old Cloudinary image:", err.message);
      }
    }

    const sql = `
      UPDATE services 
      SET title = ?, description = ?, image = ?
      WHERE id = ?
    `;

    const photoToSave = newImage || oldImage;

    await db.promise().query(sql, [title, description, photoToSave, id]);

    res.json({
      success: true,
      message: "Service updated successfully",
      image: photoToSave,
    });
  } catch (err) {
    console.error("❌ Error updating service:", err);
    res.status(500).json({ success: false, error: "Database or Cloudinary error" });
  }
});

// ❌ Delete a service
router.delete('/delete/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const [rows] = await db.promise().query("SELECT image FROM services WHERE id = ?", [id]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: "Service not found" });
    }

    const imageUrl = rows[0].image;

    const [result] = await db.promise().query("DELETE FROM services WHERE id = ?", [id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: "Service not found" });
    }

    if (imageUrl) {
      try {
        const segments = imageUrl.split("/");
        const filename = segments.pop();
        const folder = segments.slice(-2, -1)[0];
        const publicId = `${folder}/${filename.split(".")[0]}`;

        await cloudinary.uploader.destroy(publicId);
        console.log("🗑 Deleted Cloudinary image:", publicId);
      } catch (err) {
        console.warn("⚠️ Could not delete Cloudinary image:", err.message);
      }
    }

    res.json({ success: true, message: "Service and Cloudinary image deleted" });
  } catch (err) {
    console.error("❌ Error deleting service:", err);
    res.status(500).json({ success: false, error: "Database or Cloudinary error" });
  }
});

module.exports = router;
