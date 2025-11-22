const express = require('express');
const router = express.Router();
const db = require('../db');
const { uploadInventory } = require('../config/multerConfig');
const cloudinary = require("../config/cloudinaryConfig");
const checkLowStock = require('../utils/inventoryAlert');

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
  const { item_code, name, item_group, date_purchase, date_expiration, amount, stock, price, unit } = req.body;
  const photo = req.file ? req.file.path : null;

  if (!item_code || !name || !item_group || stock === undefined || price === undefined) {
    return res.status(400).json({ success: false, message: "Missing required fields" });
  }

  const sql = `
    INSERT INTO inventory 
    (item_code, photo, name, item_group, date_purchase, date_expiration, amount, stock, price, unit) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;
  db.query(sql, [item_code, photo, name, item_group, date_purchase, date_expiration, amount, stock, price, unit], (err, result) => {
    if (err) {
      console.error("Error adding inventory:", err);
      return res.status(500).json({ success: false, error: "Database error" });
    }

    const productId = result.insertId;

    const logSql = `INSERT INTO inventory_stock_in_out (product_ID, stockIn, stockOut)
                        VALUES (?, ?, 0)`

    db.query(logSql, [productId, stock], (logErr) => {
      if (logErr) console.error("Error logging initial stock:", logErr);
    })

    res.json({ success: true, id: result.insertId, stockAdded: stock });
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
    amount,
    stock,
    price,
    unit,
  } = req.body;

  const newPhoto = req.file ? req.file.path : null;

  try {
    // Step 1: Get the old photo & stock
    const [rows] = await db.promise().query(
      "SELECT photo, stock FROM inventory WHERE product_ID = ?",
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: "Item not found" });
    }

    const oldPhoto = rows[0].photo;
    const oldStock = Number(rows[0].stock);
    const newStock = Number(stock); // ensure numeric
    const diff = newStock - oldStock;

    let photoToSave = oldPhoto;

    // Step 2: Handle Cloudinary image replacement
    if (newPhoto) {
      if (oldPhoto) {
        try {
          const segments = oldPhoto.split("/");
          const filename = segments.pop(); // e.g. "photo-123.webp"
          const folder = segments.includes("inventory_images")
            ? "inventory_images"
            : "";
          const publicId = `${folder}/${filename.split(".")[0]}`;

          await cloudinary.uploader.destroy(publicId);
          console.log("🗑 Deleted old Cloudinary image:", publicId);
        } catch (err) {
          console.warn("⚠️ Could not delete old Cloudinary image:", err.message);
        }
      }
      photoToSave = newPhoto;
    }

    // Step 3: Update the inventory item
    const sql = `
      UPDATE inventory 
      SET item_code=?, photo=?, name=?, item_group=?, date_purchase=?, date_expiration=?, amount=?, stock=?, price=?, unit=? 
      WHERE product_ID=?
    `;

    const [result] = await db.promise().query(sql, [
      item_code || null,
      photoToSave || null,
      name || null,
      item_group || null,
      date_purchase || null,
      date_expiration || null,
      amount || 0,
      newStock || 0,
      Number(price) || 0,
      unit || null,
      id,
    ]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: "Item not found" });
    }

    // Step 4: Log stock movement
    if (diff !== 0) {
      const stockIn = diff > 0 ? diff : 0;
      const stockOut = diff < 0 ? Math.abs(diff) : 0;

      const logSql = `
        INSERT INTO inventory_stock_in_out (product_ID, stockIn, stockOut)
        VALUES (?, ?, ?)
      `;
      await db.promise().query(logSql, [id, stockIn, stockOut]);
      console.log(`📦 Stock movement logged → Product ${id}: stockIn=${stockIn}, stockOut=${stockOut}`);
    }

    // Step 5: Check low stock (and wait for completion)
    await checkLowStock(); // 👈 must be awaited

    res.json({
      success: true,
      message: "Item updated successfully",
      photo: photoToSave,
      stock: newStock,
      stockIn: diff > 0 ? diff : 0,
      stockOut: diff < 0 ? Math.abs(diff) : 0,
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