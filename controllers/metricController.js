const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/fetch/users/:uid/:username', (req, res) => {
  const { uid, username } = req.params;

  const appointQuery = `SELECT COUNT(*) AS totalAppointments FROM appointments_tables WHERE UID = ?`;
  const petQuery = `SELECT COUNT(*) AS totalPets FROM petInfos WHERE owner_username = ?`;
  const notifyQuery = `SELECT COUNT(*) AS totalNotification from notification WHERE UID = ?`
  const visitQuery = `
    SELECT COUNT(*) AS total_visits
    FROM visit_history vh
    INNER JOIN pet_medical_records pmr
      ON vh.id_pet_medical_records = pmr.id_medical_record
    WHERE pmr.owner_username = ?;
  `;
  db.query(appointQuery, [uid], (err1, appointRes) => {
    if (err1) return res.status(500).json({ error: 'Failed to fetch appointments' });

    db.query(petQuery, [username], (err2, petRes) => {
      if (err2) return res.status(500).json({ error: 'Failed to fetch pet records' });

      db.query(notifyQuery, [uid], (err3, notifyRes) => {
        if (err3) return res.status(500).json({ error: 'Failed to fetch notification' });

        db.query(visitQuery, [username], (err4, visitRes) => {
          if (err4) return res.status(500).json({ error: 'Failed to fetch visit records' });

          res.json({
            totalAppointments: appointRes[0].totalAppointments,
            totalPets: petRes[0].totalPets,
            totalNotify: notifyRes[0].totalNotification,
            totalVisit: visitRes[0].total_visits
          });
        });
      });
    });
  });
});

router.get('/fetch/admin', (req, res) => {
  const sql = `
    SELECT COUNT(*) AS total_appointments
    FROM appointments_tables
    WHERE set_date = CURDATE()
  `;

  const sqlTotalPet = `
    SELECT COUNT(*) AS total_pets
    FROM petInfos
  `;

  const sqlLowStock = `
    SELECT COUNT(*) AS low_stock_count
    FROM inventory
    WHERE stock <= 5;
  `;

  db.query(sql, (err, results) => {
    if (err) {
      console.error("Error counting today's appointments:", err);
      return res.status(500).json({ error: "Database error while counting appointments" });
    }

    db.query(sqlTotalPet, (err2, results2) => {
      if (err2) {
        console.error("Error counting pet totals:", err2);
        return res.status(500).json({ error: "Database error while counting pet totals" });
      }

      db.query(sqlLowStock, (err3, results3) => {
        if (err3) {
          console.error("Error counting pet totals:", err3);
          return res.status(500).json({ error: "Database error while counting pet totals" });
        }
        const total = results[0]?.total_appointments || 0;
        const total2 = results2[0]?.total_pets || 0
        const total3 = results3[0]?.low_stock_count || 0;
        res.json({
          total_appointments: total,
          total_pets: total2,
          low_stock_count: total3,
        });
      });
    });
  });

  router.get("/fetch/unreadcount/:uid", (req, res) => {
    const { uid } = req.params;

    const sql = `
    SELECT COUNT(*) AS unreadCount
    FROM Vet_Admin_notification n
    LEFT JOIN Notification_Read_Status r 
      ON n.notify_id = r.notify_id AND r.UID = ?
    WHERE COALESCE(r.isRead, 0) = 0
  `;

    db.query(sql, [uid], (err, rows) => {
      if (err) {
        console.error("❌ Error fetching unread count:", err);
        return res.status(500).json({ error: err });
      }

      const count = rows[0]?.unreadCount || 0;
      res.json({ unreadCount: count });
    });
  });
})

module.exports = router;