const express = require('express');
const router = express.Router();
const db = require('../db');
const { uploadInventory } = require('../config/multerConfig');
const cloudinary = require("../config/cloudinaryConfig");

router.get('/fetch', (req, res) => {
    const sql = "SELECT * FROM inventory";
    db.query(sql, (err, results) => {
        if (err) {
            console.error("Error fetching inventory:", err);
            return res.status(500).json({ success: false, error: "Database error" });
        }
        res.json({ success: true, data: results });
    });
});

router.post("/add", uploadInventory, (req, res) => {
    const { item_code, name, item_group, date_purchase, date_expiration, stock, price, unit } = req.body;
    const photo = req.file ? req.file.path : null;

    if (!item_code || !name || !item_group || stock === undefined || price === undefined) {
        return res.status(400).json({ success: false, message: "Missing required fields" });
    }

    const sql = `
    INSERT INTO inventory 
    (item_code, photo, name, item_group, date_purchase, date_expiration, stock, price, unit) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;
    db.query(sql, [item_code, photo, name, item_group, date_purchase, date_expiration, stock, price, unit], (err, result) => {
        if (err) {
            console.error("Error adding inventory:", err);
            return res.status(500).json({ success: false, error: "Database error" });
        }
        res.json({ success: true, id: result.insertId });
    });
});

// Update inventory item
router.put("/update/:id", uploadInventory, async (req, res) => {
    const { id } = req.params;
    const {
        item_code,
        name,
        item_group,
        date_purchase,
        date_expiration,
        stock,
        price,
        unit,
    } = req.body;

    const newPhoto = req.file ? req.file.path : null;

    try {
        // Step 1: Get the old photo URL
        const [rows] = await db.promise().query(
            "SELECT photo FROM inventory WHERE product_ID = ?",
            [id]
        );

        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: "Item not found" });
        }

        const oldPhoto = rows[0].photo;
        let photoToSave = oldPhoto;

        // Step 2: If new photo uploaded, delete the old one on Cloudinary
        if (newPhoto) {
            if (oldPhoto) {
                try {
                    // Extract Cloudinary public ID from URL
                    // Example: https://res.cloudinary.com/demo/image/upload/v123456/inventory_images/photo-123.webp
                    const segments = oldPhoto.split("/");
                    const filename = segments.pop(); // "photo-123.webp"
                    const folder = segments.includes("inventory_images")
                        ? "inventory_images"
                        : ""; // Cloudinary folder name
                    const publicId = `${folder}/${filename.split(".")[0]}`;

                    await cloudinary.uploader.destroy(publicId);
                    console.log("🗑 Deleted old Cloudinary image:", publicId);
                } catch (err) {
                    console.warn("⚠️ Could not delete old Cloudinary image:", err.message);
                }
            }

            // Replace with the new Cloudinary image URL
            photoToSave = newPhoto;
        }

        // Step 3: Update DB
        const sql = `
      UPDATE inventory 
      SET item_code=?, photo=?, name=?, item_group=?, date_purchase=?, date_expiration=?, stock=?, price=?, unit=? 
      WHERE product_ID=?
    `;

        const [result] = await db.promise().query(sql, [
            item_code || null,
            photoToSave || null,
            name || null,
            item_group || null,
            date_purchase || null,
            date_expiration || null,
            stock || 0,
            price || 0,
            unit || null,
            id,
        ]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: "Item not found" });
        }

        res.json({
            success: true,
            message: "Item updated successfully",
            photo: photoToSave,
        });
    } catch (err) {
        console.error("❌ Error updating inventory:", err);
        res.status(500).json({ success: false, error: "Database or Cloudinary error" });
    }
});

// Delete inventory item
router.delete("/delete/:id", async (req, res) => {
    const { id } = req.params;

    try {
        const [rows] = await db.promise().query(
            "SELECT photo FROM inventory WHERE product_ID = ?",
            [id]
        );

        if (rows.length === 0) {
            return res
                .status(404)
                .json({ success: false, message: "Item not found" });
        }

        const photoUrl = rows[0].photo;

        const [result] = await db
            .promise()
            .query("DELETE FROM inventory WHERE product_ID = ?", [id]);

        if (result.affectedRows === 0) {
            return res
                .status(404)
                .json({ success: false, message: "Item not found" });
        }

        if (photoUrl && photoUrl.includes("cloudinary.com")) {
            try {
                const urlParts = photoUrl.split("/");
                const fileName = urlParts.pop(); 
                const folderIndex = urlParts.findIndex((part) =>
                    part.includes("upload")
                );
                const folderPath = urlParts.slice(folderIndex + 1).join("/"); 
                const publicId = `${folderPath}/${fileName.split(".")[0]}`;

                await cloudinary.uploader.destroy(publicId);
                console.log("🗑 Deleted from Cloudinary:", publicId);
            } catch (err) {
                console.warn("⚠️ Could not delete Cloudinary image:", err.message);
            }
        }

        res.json({ success: true, message: "Item and Cloudinary image deleted" });
    } catch (err) {
        console.error("❌ Error deleting inventory:", err);
        res
            .status(500)
            .json({ success: false, error: "Database or Cloudinary error" });
    }
});

module.exports = router;

module.exports = router;