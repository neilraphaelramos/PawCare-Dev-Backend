const express = require('express');
const router = express.Router();
const db = require('../db');
const { uploadConsultation } = require('../config/multerConfig');
const { use } = require('react');

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
  const { status } = req.body;
  const updateStatusQuery = `
    UPDATE online_consultation_table
    SET status = ?
    WHERE channel_consult_ID = ?
  `;
  try {
    db.query(updateStatusQuery, [status, channelConsultID], (err, result) => {
      if (err) {
        console.error("Error updating status:", err);
        return res.status(500).json({ error: "Database error" });
      }
      res.json({ message: "Status updated successfully" });
    });
  } catch (err) {
    console.error("Server error:", err);
    res.status(500).json({ error: "Server error" });
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

module.exports = router;
