const express = require('express');
const router = express.Router();
const db = require('../db');

router.post('/', (req, res) => {
  const { set_date, set_time, owner_name, user_id } = req.body;

  const sql = `INSERT INTO appointments_tables (set_date, set_time, owner_name, UID) VALUES (?, ?, ?, ?)`;
  db.query(sql, [set_date, set_time, owner_name, user_id], (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: `${set_date} at ${set_time}` });
  });
});

router.get('/user/:uid', (req, res) => {
  const { uid } = req.params;
  const sql = 'SELECT * FROM appointments_tables WHERE UID = ? ORDER BY id_appoint DESC';
  db.query(sql, [uid], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results);
  });
});

router.get('/vets/:date', (req, res) => {
  const { date } = req.params; // expects YYYY-MM-DD
  const sql = 'SELECT * FROM appointments_tables WHERE set_date = ?';
  db.query(sql, [date], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    console.log(date)
    res.json(results); // array of appointments
  });
});

router.put('/:id/status', (req, res) => {
  const { id } = req.params;
  const { status, reason } = req.body;

  const sql = `
    UPDATE appointments_tables 
    SET status = ?, reason = ?
    WHERE id_appoint = ?
  `;

  db.query(sql, [status, reason, id], (err, result) => {
    if (err) {
      console.error("Error updating status:", err);
      return res.status(500).json({ success: false, error: err.message });
    }

    res.json({ success: true, message: 'Status updated successfully' });
  });
});

router.get('/fully-booked', (req, res) => {
  const sql = `
    SELECT DATE_FORMAT(set_date, '%Y-%m-%d') AS set_date
    FROM appointments_tables
    GROUP BY set_date
    HAVING COUNT(*) >= 11
    ORDER BY set_date ASC
  `;

  db.query(sql, (err, results) => {
    if (err) {
      console.error("Error fetching fully booked dates:", err);
      return res.status(500).json([]);
    }

    const dates = results.map(r => r.set_date); // now guaranteed as plain text, no TZ shift
    res.json(dates);
  });
});

router.get('/:date', (req, res) => {
  const { date } = req.params; // date in YYYY-MM-DD
  const sql = 'SELECT set_time FROM appointments_tables WHERE set_date = ?';
  db.query(sql, [date], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    // Return an array of booked time strings
    const bookedTimes = results.map(r => r.set_time);
    res.json(bookedTimes);
  });
});

// backend/routes/appointments.js
router.get('/upcoming-appointment/:date', (req, res) => {
  const { date } = req.params; // Expected format: YYYY-MM-DD

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: "Invalid date format (expected YYYY-MM-DD)" });
  }

  const sql = `
    SELECT * FROM appointments_tables
    WHERE set_date = ?
    ORDER BY set_time ASC
  `;

  db.query(sql, [date], (err, results) => {
    if (err) {
      console.error("🔥 SQL ERROR:", err.sqlMessage);
      return res.status(500).json({ error: err.sqlMessage });
    }

    const formattedResults = results.map(item => ({
      id: item.id_appoint,
      setDate: item.set_date
        ? new Date(item.set_date).toLocaleDateString('en-CA')
        : null,
      setTime: item.set_time,
      ownerName: item.owner_name,
      status: item.status,
      isDone: item.isDone,
    }));

    res.json({ fetchData: formattedResults });
  });
});

router.put('/status-update-appointment/:id', (req, res) => {
  const { id } = req.params;
  const { status } = req.body; 

  const sql = 'UPDATE appointments_tables SET isDone = ? WHERE id_appoint = ?';
  db.query(sql, [status, id], (err, result) => {
    if (err) {
      console.error("Error updating status:", err);
      return res.status(500).json({ success: false, error: err });
    }
    res.json({ success: true });
  });
});

router.get('/future/:date', (req, res) => {
  const { date } = req.params;

  const sql = `
    SELECT * 
    FROM appointments_tables
    WHERE set_date >= ?
    ORDER BY set_date ASC, set_time ASC
  `;

  db.query(sql, [date], (err, results) => {
    if (err) {
      console.error("Error fetching future appointments:", err);
      return res.status(500).json({ success: false, error: err });
    }

    const formattedResults = results.map(item => ({
      id: item.id_appoint,
      setDate: item.set_date
        ? new Date(item.set_date).toLocaleDateString('en-CA')
        : null,
      setTime: item.set_time, 
      ownerName: item.owner_name,
      status: item.status,
      isDone: item.isDone,
    }));

    res.json({ success: true, fetchData: formattedResults });
  });
});

// ✅ Get monthly appointment summary
router.get('/summary-appointment/monthly', (req, res) => {
  const sql = `
    SELECT 
      MONTH(set_date) AS month,
      COUNT(*) AS count
    FROM appointments_tables
    GROUP BY MONTH(set_date)
    ORDER BY MONTH(set_date);
  `;

  db.query(sql, (err, results) => {
    if (err) {
      console.error("Error fetching monthly summary:", err);
      return res.status(500).json({ success: false, error: err });
    }

    // Format the result to fill missing months with zero
    const monthlyData = Array(12).fill(0);
    results.forEach(row => {
      monthlyData[row.month - 1] = row.count;
    });

    res.json({ success: true, data: monthlyData });
  });
});


module.exports = router;

