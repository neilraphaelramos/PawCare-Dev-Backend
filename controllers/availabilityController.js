const express = require('express');
const router = express.Router();
const db = require('../db');
const sendNotificationEmail = require('../config/mailerNotification');

const connectedUsers = new Map();

/* ---------------------------- */
/*  GET all unavailable dates and times  */
/* ---------------------------- */
router.get("/", (req, res) => {

    const sqlFullDays = `SELECT * FROM unavailable_dates`;
    const sqlTimeRanges = `SELECT * FROM unavailable_times`;

    db.query(sqlFullDays, (err, fullDayRows) => {
        if (err) {
            console.error("[ERROR] Fetching full days failed:", err);
            return res.status(500).json({ message: "Database error", error: err });
        }

        db.query(sqlTimeRanges, (err2, timeRows) => {
            if (err2) {
                console.error("[ERROR] Fetching time ranges failed:", err2);
                return res.status(500).json({ message: "Database error", error: err2 });
            }

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

            res.json({ fullDays, times });
        });
    });
});

router.get("/user-only", (req, res) => {

    // Full day blocks set by admin
    const sqlFullDays = `
        SELECT id, date, event 
        FROM unavailable_dates
        WHERE role_set = 'Admin'
    `;

    // Partial time blocks set by admin
    const sqlTimes = `
        SELECT id, date, time_from, time_to, event
        FROM unavailable_times
        WHERE role_set = 'Admin'
    `;

    db.query(sqlFullDays, (err, fullDayRows) => {
        if (err) {
            console.error("[ERROR] Fetching admin full days:", err);
            return res.status(500).json({ message: "Database error", error: err });
        }

        db.query(sqlTimes, (err2, timeRows) => {
            if (err2) {
                console.error("[ERROR] Fetching admin time ranges:", err2);
                return res.status(500).json({ message: "Database error", error: err2 });
            }

            // Convert SQL DATE/TIME into proper formats
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
                event: d.event
            }));

            const times = timeRows.map(t => ({
                id: t.id,
                date: formatDate(t.date),
                time_from: t.time_from,
                time_to: t.time_to,
                event: t.event
            }));

            res.json({ fullDays, times });
        });
    });
});

/* ---------------------------- */
/*  GET all unavailable data for a user */
/* ---------------------------- */
router.get("/:user_id", (req, res) => {
    const userId = req.params.user_id;

    const sql1 = `SELECT * FROM unavailable_dates WHERE user_id = ?`;
    const sql2 = `SELECT * FROM unavailable_times WHERE user_id = ?`;

    db.query(sql1, [userId], (err, fullDayRows) => {
        if (err) {
            console.error("[ERROR] Fetching user full days failed:", err);
            return res.status(500).json(err);
        }

        db.query(sql2, [userId], (err2, timeRows) => {
            if (err2) {
                console.error("[ERROR] Fetching user time ranges failed:", err2);
                return res.status(500).json(err2);
            }

            const formatLocalDate = (date) => {
                const d = new Date(date);
                const year = d.getFullYear();
                const month = String(d.getMonth() + 1).padStart(2, '0');
                const day = String(d.getDate()).padStart(2, '0');
                return `${year}-${month}-${day}`;
            };

            const formattedFullDays = fullDayRows.map(d => ({ ...d, date: formatLocalDate(d.date) }));
            const formattedTimes = timeRows.map(t => ({ ...t, date: formatLocalDate(t.date) }));

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

    const sql = `DELETE FROM unavailable_dates WHERE id = ?`;
    db.query(sql, [id], (err) => {
        if (err) {
            console.error("[ERROR] Deleting full day failed:", err);
            return res.status(500).json(err);
        }
        res.json({ message: "Full day deleted" });
    });
});

/* ---------------------------- */
/*  DELETE time range           */
/* ---------------------------- */
router.delete("/delete-time/:id", (req, res) => {
    const id = req.params.id;

    const sql = `DELETE FROM unavailable_times WHERE id = ?`;
    db.query(sql, [id], (err) => {
        if (err) {
            console.error("[ERROR] Deleting time range failed:", err);
            return res.status(500).json(err);
        }
        res.json({ message: "Time range deleted" });
    });
});

router.post('/sent-unavailable-message', async (req, res) => {
    const { date, event, time_from, time_to, name } = req.body;

    try {
        const getAccountSQL = `
            SELECT 
                uc.id, 
                uc.email, 
                uc.userName, 
                ui.firstName, 
                ui.middleName, 
                ui.lastName, 
                ui.suffix
            FROM user_credentials uc
            LEFT JOIN user_infos ui ON uc.id = ui.user_ID
            WHERE uc.isverified = 1 AND uc.userRole = 'User';
        `;

        db.query(getAccountSQL, async (err, users) => {
            if (err) {
                console.error("[ERROR] Fetching users failed:", err);
                return res.status(500).json({ message: "Database error", error: err });
            }

            if (!users || users.length === 0) {
                return res.status(200).json({ message: "No verified users to notify." });
            }

            const notify_date = new Date();

            const notifyPromises = users.map((user) => {
                const details =
                    time_from && time_to
                        ? `Notice: ${name} has marked ${date} from ${time_from} to ${time_to} as unavailable. Reason: ${event}. Please book on another available date. Sorry for the inconvenience.`
                        : `Notice: ${name} has marked ${date} as unavailable. Reason: ${event}. Please book on another available date. Sorry for the inconvenience.`;

                const sql = `
                    INSERT INTO notification (UID, title_notify, type_notify, details, notify_date)
                    VALUES (?, ?, ?, ?, ?)
                `;

                return new Promise((resolve, reject) => {
                    db.query(
                        sql,
                        [user.id, "Unavailable Notice", "Notice", details, notify_date],
                        async (err2, result) => {
                            if (err2) return reject(err2);

                            await sendNotificationEmail({
                                toEmail: user.email,
                                name: user.firstName,
                                type: "Notice",
                                title: "Unavailable Notice",
                                message: details,
                                mess1: "",
                                mess2: `We have marked this date as unavailable due to ${event}`
                            });


                            const socketId = connectedUsers.get(user.id);
                            if (socketId) {
                                io.to(socketId).emit("newNotification", {
                                    id: result.insertId,
                                    title_notify: "Unavailable Notice",
                                    type_notify: "Notice",
                                    details,
                                    notify_date
                                });
                            }

                            resolve();
                        }
                    );
                });
            });

            await Promise.all(notifyPromises);

            res.status(200).json({ message: "Notice notifications sent successfully." });
        });

    } catch (err) {
        console.error("[ERROR] Sending unavailable messages:", err);
        res.status(500).json({ message: "Failed to send notifications", error: err });
    }
});

module.exports = router;
