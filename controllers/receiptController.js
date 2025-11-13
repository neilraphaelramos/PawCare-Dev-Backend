const express = require("express");
const router = express.Router();
const db = require("../db");

router.post("/save_receipt", async (req, res) => {
    const { order_ref, date_order, uid, customer_name, total, items } = req.body;

    const sqlReceipts = `
    INSERT INTO orders_receipts (order_ref, uid, date_order, customer_name, total)
    VALUES (?, ?, ?, ?, ?)
  `;

    const sqlReceiptItems = `
    INSERT INTO orders_receipt_items (receipt_id, product_name, qty, price)
    VALUES (?, ?, ?, ?)
  `;

    try {
        // Step 1: Insert the main receipt
        db.query(sqlReceipts, [order_ref, uid, date_order, customer_name, total], (err, result) => {
            if (err) {
                console.error("❌ Error inserting receipt:", err);
                return res.status(500).json({ success: false, message: "Failed to save receipt" });
            }

            const receiptId = result.insertId;

            // Step 2: Insert all receipt items
            let inserted = 0;
            items.forEach((item) => {
                db.query(sqlReceiptItems, [receiptId, item.name, item.qty, item.price], (err2) => {
                    if (err2) {
                        console.error("❌ Error inserting item:", err2);
                        return res.status(500).json({ success: false, message: "Failed to save items" });
                    }

                    inserted++;
                    if (inserted === items.length) {
                        return res.json({ success: true, message: "Receipt saved", receiptId });
                    }
                });
            });
        });
    } catch (err) {
        console.error("❌ Server error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
});


// ✅ Fetch receipt and its items
router.get("/receipt/:receiptId", (req, res) => {
    const { receiptId } = req.params;

    const sqlReceipt = `SELECT * FROM orders_receipts WHERE order_ref = ?`;
    const sqlItems = `SELECT * FROM orders_receipt_items WHERE receipt_id = ?`;

    db.query(sqlReceipt, [receiptId], (err, receipts) => {
        if (err) {
            console.error("❌ Error fetching receipt:", err);
            return res.status(500).json({ success: false, message: "Server error" });
        }

        if (!receipts.length) {
            return res.status(404).json({ success: false, message: "Receipt not found" });
        }

        const receiptIdDb = receipts[0].id;

        db.query(sqlItems, [receiptIdDb], (err2, items) => {
            if (err2) {
                console.error("❌ Error fetching items:", err2);
                return res.status(500).json({ success: false, message: "Server error" });
            }

            res.json({ success: true, receipt: receipts[0], items });
        });
    });
});

module.exports = router;
