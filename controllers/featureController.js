const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/fetch', (req, res) => {
    const sqlFeatures = `SELECT * FROM features`;

    db.query(sqlFeatures, (err, result) => {
        if (err) {
            console.error("Error fetching features:", err);
            return res.status(500).json({ error: "Database error" });
        }

        res.json({
            success: true,
            data: result
        });
    });
});

router.post('/add', async (req, res) => {
    const { icon, title, description } = req.body;
    const sql = "INSERT INTO features (icon, title, description) VALUES (?, ?, ?)";
    db.query(sql, [icon, title, description], (err, result) => {
        if (err) return res.status(500).json({ success: false, error: err });
        res.json({ success: true, id: result.insertId });
    });
});

router.put('/update/:id', async (req, res) => {
    const { id } = req.params;
    const { icon, title, description } = req.body;
    const sql = "UPDATE features SET icon=?, title=?, description=? WHERE id=?";
    db.query(sql, [icon, title, description, id], (err, result) => {
        if (err) return res.status(500).json({ success: false, error: err });
        res.json({ success: true });
    });
});

router.delete('/delete/:id', (req, res) => {
    const { id } = req.params;
    const sql = "DELETE FROM features WHERE id=?";
    db.query(sql, [id], (err, result) => {
        if (err) return res.status(500).json({ success: false, error: err });
        res.json({ success: true });
    });
});


module.exports = router;
