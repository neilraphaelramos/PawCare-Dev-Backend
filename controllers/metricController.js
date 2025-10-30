const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/fetch/users/:uid/:username', (req, res) => {
  const { uid, username } = req.params;

  const appointQuery = `SELECT COUNT(*) AS totalAppointments FROM appointments_tables WHERE UID = ?`;
  const petQuery = `SELECT COUNT(*) AS totalPets FROM petInfos WHERE owner_username = ?`;
  const notifyQuery = `SELECT COUNT(*) AS totalNotification from notification WHERE UID = ?`
  db.query(appointQuery, [uid], (err1, appointRes) => {
    if (err1) return res.status(500).json({ error: 'Failed to fetch appointments' });

    db.query(petQuery, [username], (err2, petRes) => {
      if (err2) return res.status(500).json({ error: 'Failed to fetch pet records' });

      db.query(notifyQuery, [uid], (err3, notifyRes) => {
        if (err3) return res.status(500).json({ error: 'Failed to fetch notification' });

        res.json({
          totalAppointments: appointRes[0].totalAppointments,
          totalPets: petRes[0].totalPets,
          totalNotify: notifyRes[0].totalNotification
        });
      })
    });
  });
});

module.exports = router;