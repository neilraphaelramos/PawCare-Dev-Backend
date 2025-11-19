const express = require('express');
const router = express.Router();
const db = require('../db');
const { uploadConsultation } = require('../config/multerConfig');

router.post('/submit', uploadConsultation, async (req, res) => {
  const { owner_name, user_id, pet_name, pet_type, pet_species, concern_description, consult_type, set_date, set_time } = req.body;
  const channel_consult_ID = "consult" + Date.now();

  try {
    // ✅ File already uploaded to Cloudinary by Multer
    const fileUrl = req.file.path;  // Cloudinary URL
    const fileType = req.file.mimetype;

    const sqlScript = `
      INSERT INTO online_consultation_table
        (channel_consult_ID, userId, Owner_name, pet_name, pet_type, pet_species,
         payment_proof, concern_text, type_consult, fileType, set_date, set_time)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    db.query(sqlScript, [
      channel_consult_ID,
      user_id,
      owner_name,
      pet_name,
      pet_type,
      pet_species,
      fileUrl, // ✅ Cloudinary URL
      concern_description,
      consult_type,
      fileType,
      set_date,
      set_time
    ], (err) => {
      if (err) {
        console.error("Database error:", err);
        return res.status(500).json({ error: "Database error" });
      }

      res.json({
        message: "Success",
        success: true,
        channel_consult_ID,
        fileUrl,
      });
    });
  } catch (err) {
    console.error("Server error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

router.get('/', (req, res) => {
  const fetchOC = `SELECT * FROM online_consultation_table ORDER BY set_date DESC, set_time DESC`;

  try {
    db.query(fetchOC, (err, results) => {
      if (err) {
        console.error("Error fetching data:", err);
        return res.status(500).json({ error: "Database error" });
      }

      const formattedResults = results.map((item) => ({
        id: item.consult_id,
        channelConsult: item.channel_consult_ID,
        petName: item.pet_name,
        petType: item.pet_type,
        petSpecies: item.pet_species,
        concern: item.concern_text,
        consultationType: item.type_consult,
        ownerName: item.owner_name,
        paymentProof: item.payment_proof,
        fileType: item.fileType,
        setDate: item.set_date
          ? new Date(item.set_date).toLocaleDateString('en-CA')
          : null,
        setTime: item.set_time,
        status: item.status,
        reason: item.reason,
      }));

      res.json({ fetchData: formattedResults });
    });
  } catch (err) {
    console.error("Server error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

router.patch('/update-status/:channelConsultID', (req, res) => {
  const { channelConsultID } = req.params;
  const { status, decline_reason } = req.body;

  const updateStatusQuery = `
    UPDATE online_consultation_table
    SET status = ?, reason = ?
    WHERE channel_consult_ID = ?
  `;

  const selectSql = `
    SELECT userId 
    FROM online_consultation_table 
    WHERE channel_consult_ID = ?
  `;

  try {
    // First, get the user_id
    db.query(selectSql, [channelConsultID], (selectErr, rows) => {
      if (selectErr) {
        console.error("Error fetching consultation:", selectErr);
        return res.status(500).json({ success: false, error: selectErr });
      }

      if (rows.length === 0) {
        return res.status(404).json({ success: false, message: "Consultation not found" });
      }

      const userId = rows[0].userId;

      // Then, update the status
      db.query(updateStatusQuery, [status, decline_reason, channelConsultID], (updateErr, result) => {
        if (updateErr) {
          console.error("Error updating status:", updateErr);
          return res.status(500).json({ success: false, error: updateErr });
        }

        res.json({
          success: true,
          user_id: userId, // 🔥 return user_id for notifications
          message: "Status updated successfully"
        });
      });
    });
  } catch (err) {
    console.error("Server error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
});

router.get('/upcoming-online-consult/fetch/:id', (req, res) => {
  const { id } = req.params;
  const fetchConsultationQuery = `
    SELECT * FROM online_consultation_table
    WHERE userId = ?
  `;

  try {
    db.query(fetchConsultationQuery, [id], (err, results) => {
      if (err) {
        console.error("Error fetching consultation:", err);
        return res.status(500).json({ error: "Database error" });
      }
      if (results.length === 0) {
        return res.status(404).json({ error: "Consultation not found" });
      }

      const formattedResults = results.map((item) => ({
        id: item.consult_id,
        channelConsult: item.channel_consult_ID,
        userId: item.userId,
        petName: item.pet_name,
        petType: item.pet_type,
        petSpecies: item.pet_species,
        concern: item.concern_text,
        consultationType: item.type_consult,
        ownerName: item.owner_name,
        paymentProof: item.payment_proof,
        fileType: item.fileType,
        setDate: item.set_date
          ? new Date(item.set_date).toLocaleDateString('en-CA')
          : null,
        setTime: item.set_time,
        status: item.status,
      }));
      res.json({ fetchData: formattedResults });
    });
  } catch (err) {
    console.error("Server error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

router.get('/details/consultation/:date', (req, res) => {
  const { date } = req.params; // date in YYYY-MM-DD
  const sql = 'SELECT * FROM online_consultation_table WHERE set_date = ?';
  db.query(sql, [date], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });

    const formattedResults = results.map((item) => ({
      id: item.consult_id,
      petName: item.pet_name,
      petType: item.pet_type,
      petSpecies: item.pet_species,
      concern: item.concern_text,
      ownerName: item.owner_name,
      setDate: item.set_date
        ? new Date(item.set_date).toLocaleDateString('en-CA')
        : null,
      setTime: item.set_time,
      status: item.status,
      isDone: item.isDone,
    }));

    res.json({ fetchData: formattedResults });
  });
});

router.put('/status-update-consultation/:id', (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  const sql = 'UPDATE online_consultation_table SET isDone = ? WHERE consult_id = ?';
  db.query(sql, [status, id], (err, result) => {
    if (err) {
      console.error("Error updating status:", err);
      return res.status(500).json({ success: false, error: err });
    }
    res.json({ success: true });
  });
});

module.exports = router;
