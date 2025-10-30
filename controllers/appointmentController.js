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

router.get('/user/:uid', (req, res) => {
  const { uid } = req.params;
  const sql = 'SELECT * FROM appointments_tables WHERE UID = ? ORDER BY set_date ASC, set_time ASC';
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
  const { status } = req.body; // 'Approved' or 'Declined'
  const sql = 'UPDATE appointments_tables SET status = ? WHERE id_appoint = ?';
  db.query(sql, [status, id], (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Status updated' });
  });
});

router.get('/fully-booked', async (req, res) => {
  try {
    const [rows] = await db.promise().query(`
      SELECT set_date
      FROM appointments
      GROUP BY set_date
      HAVING COUNT(*) >= 10;  -- assuming 10 slots max per day
    `);
    res.json(rows.map(r => r.set_date));
  } catch (err) {
    console.error("Error fetching fully booked dates:", err);
    res.status(500).json([]);
  }
});


module.exports = router;