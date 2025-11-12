const express = require('express');
const router = express.Router();
const db = require('../db');
const { uploadMedicalRecord } = require('../config/multerConfig');
const formatDate = require('../utils/formatDate');

router.get('/fetch', (req, res) => {
  const sql = `SELECT * FROM pet_medical_records`;

  db.query(sql, (err, results) => {
    if (err) {
      console.error("Error fetching medical records:", err);
      return res.status(500).json({ error: "Database error" });
    }

    const records = results.map((r) => ({
      id: r.id_medical_record,
      ownerName: r.owner_name,
      userName: r.owner_username,
      photo: r.photo_pet,
      name: r.pet_name,
      petType: r.petType,
      species: r.species,
      age: r.pet_age,
      gender: r.pet_gender,
      condition: r.pet_condition,
      lastVisit: formatDate(r.last_visit),
      diagnosis: r.diagnosis,
    }));

    res.json(records);
  });
});

router.get('/fetch_user/:username', (req, res) => {
  const { username } = req.params;
  const sql = `SELECT * FROM pet_medical_records WHERE owner_username = ?`;

  db.query(sql, [username], (err, results) => {
    if (err) {
      console.error("Error fetching medical records:", err);
      return res.status(500).json({ error: "Database error" });
    }

    const records = results.map((r) => ({
      id: r.id_medical_record,
      ownerName: r.owner_name,
      userName: r.owner_username,
      photo: r.photo_pet,
      name: r.pet_name,
      petType: r.petType,
      species: r.species,
      age: r.pet_age,
      gender: r.pet_gender,
      condition: r.pet_condition,
      lastVisit: formatDate(r.last_visit),
      diagnosis: r.diagnosis,
    }));

    res.json(records);
  });
});

router.get('/fetch/visit_history/:medical_id', (req, res) => {
  const { medical_id } = req.params;
  const sql = `SELECT * FROM visit_history WHERE id_pet_medical_records = ?`;

  db.query(sql, [medical_id], (err, results) => {
    if (err) {
      console.error("Error fetching visit history:", err);
      return res.status(500).json({ error: "Database error" });
    }

    const histories = results.map((h) => ({
      history_id: h.id_pet_history,
      medical_id: h.id_pet_medical_records,
      ownerEmail: h.owner_email,
      ownerAddress: h.owner_address,
      ownerPhoneNum: h.owner_phone,
      day: h.day,
      date: formatDate(h.date_visit),
      service: h.service_type,
      complaint: h.main_complaint,
      diagnosis: h.pet_diagnosis,
      status: h.treatment_status,
      completed: formatDate(h.date_completed_on),
      nursingIssues: h.nursing_issues,
      carePlan: h.care_plan,
      localStatus: h.local_status_check,
      additionalComplaint: h.additional_complaint,
      weight: h.weight,
      height: h.height,
      bmi: h.bmi,
      bloodPressure: h.blood_pressure,
      pulse: h.pulse,
      medications: h.medications,
      veterinarianName: h.veterinarian_name,
    }));

    res.json(histories);
  });
});

router.post('/add_pet', (req, res) => {
  const {
    owner_name,
    user_name,
    pet_name,
    petType,
    species,
    pet_age,
    pet_gender,
    pet_condition,
    last_visit,
    diagnosis,
    photo
  } = req.body;

  const sql = `
    INSERT INTO pet_medical_records 
    (owner_name, owner_username, photo_pet, pet_name, petType, species, pet_age, pet_gender, pet_condition, last_visit, diagnosis)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  db.query(sql, [owner_name, user_name, photo, pet_name, petType, species, pet_age, pet_gender, pet_condition, last_visit, diagnosis],
    (err, result) => {
      if (err) {
        console.error("Error adding pet:", err);
        return res.status(500).json({ success: false, error: "Database error" });
      }
      res.json({ success: true, id: result.insertId });
    });
});

router.put('/edit_pet/:id', uploadMedicalRecord, async (req, res) => {
  const { id } = req.params;
  const {
    pet_condition,
    last_visit,
    diagnosis
  } = req.body;

  try {
    const sql = `
      UPDATE pet_medical_records
      SET pet_condition=?, last_visit=?, diagnosis=?
      WHERE id_medical_record=?
    `;

    const values = [
      pet_condition,
      last_visit,
      diagnosis,
      id
    ];

    db.query(sql, values, (err) => {
      if (err) {
        console.error('Error updating pet:', err);
        return res.status(500).json({ success: false, error: 'Database error' });
      }

      res.json({ success: true, message: 'Pet record updated successfully!' });
    });
  } catch (err) {
    console.error('Error editing pet record:', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

router.post('/add_pet_history', (req, res) => {
  const {
    id_pet_medical_records,
    owner_email,
    owner_address,
    owner_phonenumber,
    day,
    date_visit,
    service_type,
    main_complaint,
    pet_diagnosis,
    treatment_status,
    date_completed_on,
    nursing_issues,
    care_plan,
    local_status_check,
    additional_complaint,
    weight,
    height,
    bmi,
    blood_pressure,
    pulse,
    medications,
    veterinarian_name
  } = req.body;

  const sql = `
    INSERT INTO visit_history 
    (id_pet_medical_records, owner_email, owner_address, owner_phone, day, date_visit, service_type, main_complaint, pet_diagnosis, treatment_status, date_completed_on, 
     nursing_issues, care_plan, local_status_check, additional_complaint, weight, height, bmi, blood_pressure, pulse, medications, veterinarian_name) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;
  const values = [
    id_pet_medical_records, owner_email, owner_address, owner_phonenumber, day, date_visit, service_type, main_complaint, pet_diagnosis, treatment_status, date_completed_on,
    nursing_issues, care_plan, local_status_check, additional_complaint, weight, height, bmi, blood_pressure, pulse, medications, veterinarian_name
  ];

  db.query(sql, values, (err, result) => {
    if (err) {
      console.error("Error adding visit history:", err);
      return res.status(500).json({ success: false, error: "Database error" });
    }
    res.json({ success: true, id: result.insertId });
  });
});

router.put('/edit_pet_history/:id', (req, res) => {
  const { id } = req.params;
  const {
    owner_email,
    owner_address,
    owner_phonenumber,
    day,
    date_visit,
    service_type,
    main_complaint,
    pet_diagnosis,
    treatment_status,
    date_completed_on,
    nursing_issues,
    care_plan,
    local_status_check,
    additional_complaint,
    weight,
    height,
    bmi,
    blood_pressure,
    pulse,
    medications,
    veterinarian_name
  } = req.body;

  const sql = `
    UPDATE visit_history SET
    owner_email=?, owner_address=?, owner_phone=?, day=?, date_visit=?, service_type=?, main_complaint=?, pet_diagnosis=?, treatment_status=?, date_completed_on=?, 
    nursing_issues=?, care_plan=?, local_status_check=?, additional_complaint=?, weight=?, height=?, bmi=?, 
    blood_pressure=?, pulse=?, medications=?, veterinarian_name=?
    WHERE id_pet_history=?
  `;

  const values = [
    owner_email, owner_address, owner_phonenumber, day, date_visit, service_type, main_complaint, pet_diagnosis, treatment_status, date_completed_on,
    nursing_issues, care_plan, local_status_check, additional_complaint, weight, height, bmi,
    blood_pressure, pulse, medications, veterinarian_name, id
  ];

  db.query(sql, values, (err, result) => {
    if (err) {
      console.error("Error updating visit history:", err);
      return res.status(500).json({ success: false, error: "Database error" });
    }
    res.json({ success: true, message: "Visit history updated" });
  });
});

router.get('/fetch/user_medical/:username', (req, res) => {
  const { username } = req.params;

  const sql = `
    SELECT 
      uc.email,
      ui.phoneNumber,
      ui.houseNum,
      ui.province,
      ui.municipality,
      ui.barangay
    FROM user_credentials AS uc
    LEFT JOIN user_infos AS ui
      ON uc.id = ui.user_id
    WHERE uc.userName = ?
  `;

  db.query(sql, [username], (err, results) => {
    if (err) {
      console.error("Error fetching user:", err);
      return res.status(500).json({ success: false, error: "Database error" });
    }

    if (results.length === 0) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    const user = results[0];

    const dataformat = {
      email: user.email,
      phoneNumber: user.phoneNumber,
      address: [
        user.houseNum,
        user.barangay,
        user.municipality,
        user.province
      ]
        .filter(Boolean)
        .join(' ')
    };

    res.json({ success: true, data: dataformat });
  });
});

router.post('/add_pet_info', (req, res) => {
  const { photo, name, age, type, species, gender, ownerUsername, ownerName } = req.body

  const sql = `
    INSERT INTO pet_medical_records
    (owner_name, owner_username, photo_pet, pet_name, petType, species, pet_age, pet_gender)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `;

  db.query(sql, [ownerName, ownerUsername, photo, name, type, species, age, gender], (err, result) => {
    if (err) {
      console.error("Error adding pet info:", err);
      return res.status(500).json({ success: false, error: "Database error" });
    }
    res.json({ success: true, id: result.insertId });
  });
});

router.delete('/delete/:id', (req, res) => {
  const { id } = req.params;

  const sql = "DELETE FROM pet_medical_records  WHERE id_medical_record = ?"

  db.query(sql, [id], (err, result) => {
    if (err) {
      console.error("❌ Error deleting pet record:", err);
      return res.status(500).json({ message: "Failed to delete pet record." });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Pet record not found." });
    }

    console.log(`✅ Pet record with ID ${id} deleted successfully.`);
    res.status(200).json({ message: "Pet record deleted successfully." });
  });
});

router.get('/fetch/services', (req, res) => {
  const sql = `SELECT title FROM services`;

  db.query(sql, (err, results) => {
    if (err) {
      console.error("Error fetching services:", err);
      return res.status(500).json({ error: "Failed to fetch services" });
    }
    res.json(results);
  });
});

router.get("/summary-service-demand/services", (req, res) => {
  const sql = `SELECT service_type, COUNT(*) AS demand_count
               FROM visit_history
               WHERE
                MONTH(date_visit) = MONTH(CURRENT_DATE())
                AND YEAR(date_visit) = YEAR(CURRENT_DATE())
               GROUP BY service_type
               `;

  db.query(sql, (err, results) => {
    if (err) {
      console.error("Error fetching service demand summary:", err);
      return res.status(500).json({ error: "Database error" });
    }
    res.json({results});
  });
});


module.exports = router;