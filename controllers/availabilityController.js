const express = require('express');
const router = express.Router();
const db = require('../db');

/* ---------------------------- */
/*  GET all unavailable dates and times  */
/* ---------------------------- */
router.get("/", (req, res) => {
    console.log("[DEBUG] GET /availability called");

    const sqlFullDays = `SELECT * FROM unavailable_dates`;
    const sqlTimeRanges = `SELECT * FROM unavailable_times`;

    db.query(sqlFullDays, (err, fullDayRows) => {
        if (err) {
            console.error("[ERROR] Fetching full days failed:", err);
            return res.status(500).json({ message: "Database error", error: err });
        }

        console.log("[DEBUG] Full days fetched:", fullDayRows.length);

        db.query(sqlTimeRanges, (err2, timeRows) => {
            if (err2) {
                console.error("[ERROR] Fetching time ranges failed:", err2);
                return res.status(500).json({ message: "Database error", error: err2 });
            }

            console.log("[DEBUG] Time ranges fetched:", timeRows.length);

            const formatDate = (date) => {
                const d = new Date(date);
                const year = d.getFullYear();
                const month = String(d.getMonth() + 1).padStart(2, "0");
                const day = String(d.getDate()).padStart(2, "0");
                return `${year}-${month}-${day}`;
            };

            const fullDays = fullDayRows.map(d => ({
                id: d.id,
                date: formatDate(d.date),
                event: d.event,
                role: d.role_set,   // from table itself
                setBy: d.setBy
            }));

            const times = timeRows.map(t => ({
                id: t.id,
                date: formatDate(t.date),
                time_from: t.time_from,
                time_to: t.time_to,
                event: t.event,
                role: t.role_set,   // from table itself
                setBy: t.setBy
            }));

            console.log("[DEBUG] Sending JSON response with fullDays and times");
            res.json({ fullDays, times });
        });
    });
});


/* ---------------------------- */
/*  GET all unavailable data for a user */
/* ---------------------------- */
router.get("/:user_id", (req, res) => {
    const userId = req.params.user_id;
    console.log(`[DEBUG] GET /availability/${userId} called`);

    const sql1 = `SELECT * FROM unavailable_dates WHERE user_id = ?`;
    const sql2 = `SELECT * FROM unavailable_times WHERE user_id = ?`;

    db.query(sql1, [userId], (err, fullDayRows) => {
        if (err) {
            console.error("[ERROR] Fetching user full days failed:", err);
            return res.status(500).json(err);
        }

        console.log(`[DEBUG] Full days fetched for user ${userId}:`, fullDayRows.length);

        db.query(sql2, [userId], (err2, timeRows) => {
            if (err2) {
                console.error("[ERROR] Fetching user time ranges failed:", err2);
                return res.status(500).json(err2);
            }

            console.log(`[DEBUG] Time ranges fetched for user ${userId}:`, timeRows.length);

            const formatLocalDate = (date) => {
                const d = new Date(date);
                const year = d.getFullYear();
                const month = String(d.getMonth() + 1).padStart(2, '0');
                const day = String(d.getDate()).padStart(2, '0');
                return `${year}-${month}-${day}`;
            };

            const formattedFullDays = fullDayRows.map(d => ({ ...d, date: formatLocalDate(d.date) }));
            const formattedTimes = timeRows.map(t => ({ ...t, date: formatLocalDate(t.date) }));

            console.log("[DEBUG] Sending JSON response for user");
            res.json({ fullDays: formattedFullDays, times: formattedTimes });
        });
    });
});

/* ---------------------------- */
/*  ADD FULL DAY UNAVAILABILITY */
/* ---------------------------- */
router.post("/add-full-day", (req, res) => {
    const { user_id, date, event, role, setBy } = req.body;

    // Check if admin already set full day
    const adminFullDaySql = `SELECT * FROM unavailable_dates WHERE user_id = ? AND date = ? AND role_set = 'Admin'`;
    db.query(adminFullDaySql, [user_id, date], (err, adminRows) => {
        if (err) return res.status(500).json({ message: "Database error", error: err });
        if (adminRows.length > 0) {
            return res.status(403).json({ message: "Cannot overwrite admin full-day availability." });
        }

        // Also check if there are any time ranges (admin or vet)
        const timeCheckSql = `SELECT * FROM unavailable_times WHERE user_id = ? AND date = ?`;
        db.query(timeCheckSql, [user_id, date], (err2, timeRows) => {
            if (err2) return res.status(500).json({ message: "Database error", error: err2 });
            if (timeRows.length > 0) {
                return res.status(400).json({ message: "Cannot mark full day unavailable: time ranges exist for this date." });
            }

            const sql = `INSERT INTO unavailable_dates (user_id, date, event, role_set, setBy) VALUES (?, ?, ?, ?, ?)`;
            db.query(sql, [user_id, date, event, role, setBy], (err3, result) => {
                if (err3) return res.status(500).json({ message: "Database error", error: err3 });
                res.json({ message: "Full day saved successfully", id: result.insertId });
            });
        });
    });
});

/* ---------------------------- */
/*  ADD TIME RANGE UNAVAILABILITY */
/* ---------------------------- */
router.post("/add-time", (req, res) => {
    const { user_id, date, time_from, time_to, event, role, setBy } = req.body;

    // Check if admin already set full day
    const adminFullDaySql = `SELECT * FROM unavailable_dates WHERE user_id = ? AND date = ? AND role_set = 'Admin'`;
    db.query(adminFullDaySql, [user_id, date], (err, adminRows) => {
        if (err) return res.status(500).json({ message: "Database error", error: err });
        if (adminRows.length > 0) {
            return res.status(403).json({ message: "Cannot add time range on admin full-day availability." });
        }

        // Check for overlapping time ranges (including admin)
        const checkOverlapSql = `
            SELECT * FROM unavailable_times 
            WHERE user_id = ? AND date = ? 
            AND NOT (time_to <= ? OR time_from >= ?)
        `;
        db.query(checkOverlapSql, [user_id, date, time_from, time_to], (err2, results) => {
            if (err2) return res.status(500).json({ message: "Database error", error: err2 });
            if (results.length > 0) return res.status(400).json({ message: "This time range overlaps with existing entry." });

            const insertSql = `
                INSERT INTO unavailable_times (user_id, date, time_from, time_to, event, role_set, setBy)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `;
            db.query(insertSql, [user_id, date, time_from, time_to, event, role, setBy], (err3, result) => {
                if (err3) return res.status(500).json({ message: "Database error", error: err3 });
                res.json({ message: "Time range saved successfully", id: result.insertId });
            });
        });
    });
});

/* ---------------------------- */
/*  DELETE full day             */
/* ---------------------------- */
router.delete("/delete-full-day/:id", (req, res) => {
    const id = req.params.id;
    console.log("[DEBUG] DELETE /delete-full-day called with ID:", id);

    const sql = `DELETE FROM unavailable_dates WHERE id = ?`;
    db.query(sql, [id], (err) => {
        if (err) {
            console.error("[ERROR] Deleting full day failed:", err);
            return res.status(500).json(err);
        }
        console.log("[DEBUG] Full day deleted successfully");
        res.json({ message: "Full day deleted" });
    });
});

/* ---------------------------- */
/*  DELETE time range           */
/* ---------------------------- */
router.delete("/delete-time/:id", (req, res) => {
    const id = req.params.id;
    console.log("[DEBUG] DELETE /delete-time called with ID:", id);

    const sql = `DELETE FROM unavailable_times WHERE id = ?`;
    db.query(sql, [id], (err) => {
        if (err) {
            console.error("[ERROR] Deleting time range failed:", err);
            return res.status(500).json(err);
        }
        console.log("[DEBUG] Time range deleted successfully");
        res.json({ message: "Time range deleted" });
    });
});

module.exports = router;
