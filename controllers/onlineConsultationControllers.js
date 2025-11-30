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

router.get('/fully-booked', (req, res) => {
  const sql = `
    SELECT DATE_FORMAT(set_date, '%Y-%m-%d') AS set_date
    FROM online_consultation_table
    GROUP BY set_date
    HAVING COUNT(*) >= 11
    ORDER BY set_date ASC
  `;

  db.query(sql, (err, results) => {
    if (err) {
      console.error("Error fetching fully booked dates:", err);
      return res.status(500).json([]);
    }

    const dates = results.map(r => r.set_date);
    res.json(dates);
  });
});

router.get('/:date', (req, res) => {
  const { date } = req.params; // date in YYYY-MM-DD
  const sql = 'SELECT set_time FROM online_consultation_table WHERE set_date = ?';
  db.query(sql, [date], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    // Return an array of booked time strings
    const bookedTimes = results.map(r => r.set_time);
    res.json(bookedTimes);
  });
});

//-------------------------------PAYMONGO LOGIC--------------------------------//

router.post("/create_payment_intent", async (req, res) => {
  const { amount, name, email, phone } = req.body;

  try {
    const headers = {
      accept: "application/json",
      "content-type": "application/json",
      authorization:
        "Basic " +
        Buffer.from(`${process.env.SECRET_KEY_PAYMONGO}:`).toString("base64"),
    };

    const amountInCentavos = amount * 100;

    console.log("🟡 Creating PayMongo Payment Intent...");
    const intentRes = await fetch("https://api.paymongo.com/v1/payment_intents", {
      method: "POST",
      headers,
      body: JSON.stringify({
        data: {
          attributes: {
            amount: amountInCentavos,
            currency: "PHP",
            payment_method_allowed: ["qrph"],
            capture_type: "automatic",
            statement_descriptor: "Online Consultaion Payment",
          },
        },
      }),
    });

    const intentData = await intentRes.json();
    if (!intentData.data) {
      console.error("❌ PayMongo intent error:", intentData);
      return res.status(400).json({
        success: false,
        message: "Failed to create payment intent.",
        error: intentData,
      });
    }

    const intentId = intentData.data.id;
    console.log(`✅ Payment Intent created: ${intentId}`);

    // Step 2: Create QRPh payment method
    console.log("🟡 Creating QRPH Payment Method...");
    const methodRes = await fetch("https://api.paymongo.com/v1/payment_methods", {
      method: "POST",
      headers,
      body: JSON.stringify({
        data: {
          attributes: {
            type: "qrph",
            billing: { name, email, phone },
          },
        },
      }),
    });

    const methodData = await methodRes.json();
    if (!methodData.data) {
      console.error("❌ PayMongo method error:", methodData);
      return res.status(400).json({
        success: false,
        message: "Failed to create payment method.",
        error: methodData,
      });
    }

    const methodId = methodData.data.id;
    console.log(`✅ Payment Method created: ${methodId}`);

    // Step 3: Attach payment method to intent
    console.log("🟡 Attaching payment method to intent...");
    const attachRes = await fetch(
      `https://api.paymongo.com/v1/payment_intents/${intentId}/attach`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          data: {
            attributes: {
              payment_method: methodId,
              return_url: `${process.env.DEFAULT_URL}/users/pet-products?payment=success`,
            },
          },
        }),
      }
    );

    const attachData = await attachRes.json();
    const nextAction = attachData.data?.attributes?.next_action;

    // ✅ Extract base64 QR image directly
    const qrBase64 = nextAction?.code?.image_url || null;

    if (qrBase64) {
      console.log("🟢 QRPH Payment QR Created Successfully!");
      console.log("📦 Base64 Image Data:", qrBase64.substring(0, 50) + "...");
    } else {
      console.warn("⚠️ No QR base64 returned from PayMongo. Full response:");
      console.dir(attachData, { depth: null });
    }

    res.json({
      success: true,
      message: "Scan this QR to complete payment",
      payment_intent_id: intentId,
      qrImageBase64: qrBase64,
    });
  } catch (err) {
    console.error("[Create Payment Error]", err);
    res.status(500).json({
      success: false,
      message: "Server error creating payment",
    });
  }
});

router.get("/check_payment_status/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const headers = {
      accept: "application/json",
      authorization:
        "Basic " +
        Buffer.from(`${process.env.SECRET_KEY_PAYMONGO}:`).toString("base64"),
    };

    const response = await fetch(`https://api.paymongo.com/v1/payment_intents/${id}`, {
      method: "GET",
      headers,
    });

    const data = await response.json();

    const status = data.data?.attributes?.status || "unknown";
    console.log(`🔍 Payment Status for ${id}: ${status}`);

    res.json({ success: true, status });
  } catch (err) {
    console.error("[Check Payment Status Error]", err);
    res.status(500).json({ success: false, message: "Error checking payment status" });
  }
});

router.post("/cancel_payment_intent", async (req, res) => {
  const { payment_intent_id } = req.body;

  if (!payment_intent_id) {
    return res.status(400).json({ success: false, message: "Missing payment intent ID." });
  }

  try {
    const headers = {
      accept: "application/json",
      "content-type": "application/json",
      authorization:
        "Basic " + Buffer.from(`${process.env.SECRET_KEY_PAYMONGO}:`).toString("base64"),
    };

    const cancelRes = await fetch(
      `https://api.paymongo.com/v1/payment_intents/${payment_intent_id}/cancel`,
      {
        method: "POST",
        headers,
      }
    );

    const data = await cancelRes.json();

    if (!data.data) {
      console.error("❌ Cancel failed:", data);
      return res.status(400).json({ success: false, message: "Failed to cancel payment." });
    }

    console.log(`🛑 Payment intent ${payment_intent_id} canceled successfully.`);
    res.json({ success: true, message: "Payment canceled successfully." });
  } catch (err) {
    console.error("[Cancel Payment Error]", err);
    res.status(500).json({ success: false, message: "Server error canceling payment." });
  }
});

module.exports = router;
