const express = require("express");
const db = require("../db");

const router = express.Router();

router.post("/", (req, res) => {
    const { id } = req.body

    try {
        const deleteSql = `DELETE FROM user_credentials WHERE id = ?`;

        db.query(deleteSql, [id], (err, result) => {
            if (err) {
                console.error('Deletion error:', err);
                return res.status(500).json({ error: 'Internal server error' });
            } else {
                res.status(200).json({
                    message: 'Deletion Successful!',
                });
            }
        })
    } catch (err) {
        console.error("Server error:", err);
        res.status(500).json({ error: "Server error" });
    }
});

module.exports = router;
