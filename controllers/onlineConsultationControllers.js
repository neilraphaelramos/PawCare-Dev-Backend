const express = require('express');
const router = express.Router();
const db = require('../db');
const { uploadConsultation } = require('../config/multerConfig');

router.post('/submit', uploadConsultation, async (req, res) => {
  const { owner_name, pet_name, pet_type, pet_species, concern_description, consult_type, set_date, set_time } = req.body;
  const channel_consult_ID = "consult" + Date.now();

  try {
    // ✅ File already uploaded to Cloudinary by Multer
    const fileUrl = req.file.path;  // Cloudinary URL
    const fileType = req.file.mimetype;

    const sqlScript = `
      INSERT INTO online_consultation_table
        (channel_consult_ID, Owner_name, pet_name, pet_type, pet_species,
         payment_proof, concern_text, type_consult, fileType, set_date, set_time)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    db.query(sqlScript, [
      channel_consult_ID,
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

// 📥 Route: Fetch all consultations
router.get('/', (req, res) => {
  const fetchOC = `SELECT * FROM online_consultation_table`;

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


module.exports = router;
