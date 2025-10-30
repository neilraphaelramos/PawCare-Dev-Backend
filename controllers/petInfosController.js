const express = require('express');
const router = express.Router();
const db = require('../db');
const { uploadMedicalRecord } = require('../config/multerConfig');
const cloudinary = require("../config/cloudinaryConfig");

router.get('/fetch/:username', (req, res) => {
    const { username } = req.params;
    const sql = `SELECT * FROM petInfos WHERE owner_username = ?`;

    db.query(sql, [username], (err, results) => {
        if (err) {
            console.error("Error fetching pet records:", err);
            return res.status(500).json({ error: "Database error" });
        }

        const pets = results.map((p) => ({
            id: p.pinfo,
            ownerName: p.owner_name,
            ownerUsername: p.owner_username,
            photo: p.photo_pet,
            petName: p.pet_name,
            petType: p.petType,
            species: p.species,
            petAge: p.pet_age,
            petGender: p.pet_gender,
        }));

        res.json(pets);
    });
});

router.post('/add_pet_info', uploadMedicalRecord, (req, res) => {
    const { petName, petType, species, petAge, petGender, ownerUsername, ownerName } = req.body;

    // Validate required fields
    if (!petName || !petType || !species || !petAge || !petGender || !ownerUsername || !ownerName || !req.file) {
        return res.status(400).json({ success: false, message: "Missing required fields" });
    }

    const imageUrl = req.file.path;

    const insertSQL = `
        INSERT INTO petInfos
        (owner_name, owner_username, photo_pet, pet_name, petType, species, pet_age, pet_gender)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    db.query(
        insertSQL,
        [ownerName, ownerUsername, imageUrl, petName, petType, species, petAge, petGender],
        (err, result) => {
            if (err) {
                console.error("Error inserting pet:", err);
                return res.status(500).json({ success: false, message: "Database error" });
            }
            res.json({
                success: true,
                message: "Pet added successfully",
                id: result.insertId,
                image: imageUrl,
            });
        }
    );
});

router.put('/edit_pet_info/:id', uploadMedicalRecord, async (req, res) => {
    const { id } = req.params;
    const { petName, petType, species, petAge, petGender } = req.body;
    const newImage = req.file ? req.file.path : null;

    // Validate required fields
    if (!petName || !petType || !species || !petAge || !petGender) {
        return res.status(400).json({ success: false, message: "Missing required fields" });
    }

    try {
        const [rows] = await db.promise().query("SELECT photo_pet FROM petInfos WHERE pinfo = ?", [id]);
        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: "Pet not found" });
        }

        const oldImage = rows[0].photo_pet;

        if (newImage && oldImage) {
            try {
                const urlSegments = oldImage.split("/");
                const filename = urlSegments.pop().split(".")[0];
                const folder = urlSegments.slice(-1)[0];
                const publicId = `${folder}/${filename}`;

                await cloudinary.uploader.destroy(publicId);
                console.log("🗑 Deleted old Cloudinary image:", publicId);
            } catch (err) {
                console.warn("⚠️ Could not delete old Cloudinary image:", err.message);
            }
        }

        const sql = `
            UPDATE petInfos 
            SET photo_pet = ?, pet_name = ?, petType = ?, species = ?, pet_age = ?, pet_gender = ?
            WHERE pinfo = ?
        `;

        const photoToSave = newImage || oldImage;

        await db.promise().query(sql, [photoToSave, petName, petType, species, petAge, petGender, id]);

        res.json({
            success: true,
            message: "Pet updated successfully",
            photo: photoToSave,
        });
    } catch (err) {
        console.error("❌ Error updating pet:", err);
        res.status(500).json({ success: false, error: "Database or Cloudinary error" });
    }
});

router.get('/owners', (req, res) => {
  const sql = `
    SELECT
      photo_pet, 
      owner_name, 
      owner_username, 
      pet_name, 
      petType, 
      species, 
      pet_age, 
      pet_gender
    FROM petInfos
    ORDER BY owner_name ASC
  `;

  db.query(sql, (err, results) => {
    if (err) {
      console.error("Error fetching owners:", err);
      return res.status(500).json({ error: "Database error" });
    }
    res.json(results);
  });
});

module.exports = router;
