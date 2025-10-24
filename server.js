const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const mysql = require('mysql');
const bcrypt = require('bcrypt'); // 🔐 bcrypt for hashing
const jwt = require("jsonwebtoken");
const fs = require("fs");
const axios = require('axios')
const app = express();
const port = 5000;
const { OAuth2Client } = require('google-auth-library');
const multer = require('multer');
const google_Client_ID = process.env.GClient_ID;
const CLIENT = new OAuth2Client(google_Client_ID)
const nodemailer = require('nodemailer')
const crypto = require('crypto');
require('dotenv').config();
const path = require('path');

const connectedUsers = new Map();

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, './tmp/uploads/');
  },
  filename: function (req, file, cb) {
    // Keep original extension
    const ext = path.extname(file.originalname);
    const name = file.fieldname + '-' + Date.now() + ext;
    cb(null, name);
  }
});

const upload = multer({ storage: storage });

const PRIVATE_KEY = fs.readFileSync("./private_key.pk", "utf8");
const JITSI_APP_ID = process.env.JAPP_ID;
const JITSI_APP_API_KEY = process.env.JAAPI_KEY;
const AICHAT_API_KEY2 = process.env.AICHAT_API_KEY2;

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL,
    pass: process.env.APP_PASS,
  },
});

app.use(cors({
  origin: '*'
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use('/uploads', express.static('/tmp/uploads'));
app.use("/uploads", express.static(path.join(__dirname, "tmp/uploads")));

function formatDate(date) {
  if (!date) return null;
  const d = new Date(date);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${year}-${month}-${day}`;  // ✅ YYYY-MM-DD
}

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

io.on('connection', (socket) => {
  console.log('[Socket] New client connected:', socket.id);

  socket.on('joinConsult', ({ consultID, userType }) => {
    socket.join(consultID);
    console.log(`[Socket] ${userType} joined room ${consultID}`);
    socket.to(consultID).emit('systemMessage', `${userType} joined the consultation`);
  });

  socket.on('sendMessage', ({ consultID, from, text }) => {
    const message = { consultID, from, text, timestamp: new Date() };
    console.log(`[Socket] Message from ${from} in room ${consultID}:`, text);

    // Send to everyone EXCEPT the sender
    socket.to(consultID).emit('receiveMessage', message);
  });

  socket.on("registerUser", (userId) => {
    socket.join(`user_${userId}`); // join personal room
    console.log(`[Socket] User ${userId} registered in room user_${userId}`);
  });

  socket.on("sendNotification", (notification) => {
    // Example structure of `notification`:
    // { UID: 23, title: 'Appointment', type: 'Reminder', details: 'Checkup tomorrow' }

    console.log(`[Socket] Sending notification to user_${notification.UID}`);

    // Emit to that user's personal room
    io.to(`user_${notification.UID}`).emit("newNotification", {
      id: notification.id || Date.now(),
      title_notify: notification.title,
      type_notify: notification.type,
      details: notification.details,
      notify_date: new Date()
    });
  });

  socket.on('disconnect', (reason) => {
    console.log(`[Socket] Client disconnected (${socket.id}), reason:`, reason);
  });
});

// MySQL connection
const db = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD, // leave blank if no password
  database: process.env.DB_NAME,
});

db.connect((err) => {
  if (err) {
    console.error('DB connection error:', err);
  } else {
    console.log('Connected to MySQL database');
  }
});

app.post('/register', async (req, res) => {
  const {
    firstName,
    middleName,
    lastName,
    suffix,
    username,
    email,
    phone,
    houseNum,
    province,
    municipality,
    barangay,
    zipCode,
    password,
  } = req.body;

  try {
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert into user_credentials
    const sql_credentials = `
      INSERT INTO user_credentials 
      (userName, email, password, userRole, isverified, authType)
      VALUES (?, ?, ?, ?, 0, 0)
    `;

    const credential_values = [
      username,
      email,
      hashedPassword,
      'User',
    ];

    db.query(sql_credentials, credential_values, (err, result) => {
      if (err) {
        console.error('Registration error:', err);
        return res.status(500).json({ error: 'Registration failed' });
      }

      const userId = result.insertId;

      // Insert into user_infos
      const sql_informations = `
        INSERT INTO user_infos
        (user_id, firstName, middleName, lastName, suffix, phoneNumber, houseNum, province, municipality, barangay, zipCode)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      const info_values = [
        userId,
        firstName,
        middleName,
        lastName,
        suffix,
        phone,
        houseNum,
        province,
        municipality,
        barangay,
        zipCode,
      ];

      db.query(sql_informations, info_values, (err2) => {
        if (err2) {
          console.error('Registration error:', err2);
          return res.status(500).json({ error: 'Registration failed' });
        }

        // Generate unique verification token
        const token = crypto.randomBytes(32).toString('hex');

        const sql_token = `
          INSERT INTO user_verification (user_id, token)
          VALUES (?, ?)
        `;
        db.query(sql_token, [userId, token], async (err3) => {
          if (err3) {
            console.error('Token insert error:', err3);
            return res.status(500).json({ error: 'Registration failed' });
          }

          // Send verification email
          const verifyLink = `https://unconglutinated-anya-unhacked.ngrok-free.dev/verify?token=${token}`;

          const mailOptions = {
            from: process.env.EMAIL,
            to: email,
            subject: 'Verify your PawCare Email',
            html: `
              <p>Hi ${firstName},</p>
              <p>Thanks for registering! Please verify your account by clicking the button below:</p>
               <a 
                href="${verifyLink}" 
                target="_blank" 
                style="
                  display: inline-block;
                  background-color: #4CAF50;
                  color: white;
                  padding: 12px 24px;
                  text-decoration: none;
                  border-radius: 6px;
                  font-weight: bold;
                  font-family: Arial, sans-serif;
                "
              >
                Verify Email
              </a>
              <p>If you didn’t create an account, just ignore this email.</p>
            `,
          };


          try {
            await transporter.sendMail(mailOptions);
            res.status(200).json({ message: 'Registration successful. Please check your email to verify your account.' });
          } catch (emailErr) {
            console.error('Email sending error:', emailErr);
            res.status(500).json({ error: 'Failed to send verification email' });
          }
        });
      });
    });

  } catch (err) {
    console.error('Hashing error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post("/check-username", (req, res) => {
  const { username } = req.body;

  const sql = "SELECT id FROM user_credentials WHERE username = ?";
  db.query(sql, [username], (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: "Server error" });
    }
    res.json({ exists: results.length > 0 });
  });
});

// Check if email exists
app.post("/check-email", (req, res) => {
  const { email } = req.body;

  const sql = "SELECT id FROM user_credentials WHERE email = ?";
  db.query(sql, [email], (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: "Server error" });
    }
    res.json({ exists: results.length > 0 });
  });
});

app.get('/verify', (req, res) => {
  const { token } = req.query;

  const sql_find = `
    SELECT user_id, created_at 
    FROM user_verification 
    WHERE token = ?
  `;
  db.query(sql_find, [token], (err, results) => {
    if (err || results.length === 0) {
      return res.status(400).send('Invalid or expired verification link.');
    }

    const { user_id, created_at } = results[0];

    // Check if token is older than 24 hours
    const tokenAgeHours = (Date.now() - new Date(created_at)) / (1000 * 60 * 60);
    if (tokenAgeHours > 24) {
      // Delete expired token
      db.query('DELETE FROM user_verification WHERE token = ?', [token]);
      return res.status(400).send('⏰ Verification link expired. Please request a new one.');
    }

    // Token is still valid → verify the user
    db.query('UPDATE user_credentials SET isverified = 1 WHERE id = ?', [user_id], (err2) => {
      if (err2) return res.status(500).send('Verification failed.');

      // Delete token after successful verification
      db.query('DELETE FROM user_verification WHERE token = ?', [token]);
      res.send('✅ Your account has been verified successfully!');
    });
  });
});

app.post("/data", (req, res) => {
  const sql = `
    SELECT 
      uc.*, 
      ui.firstName, ui.middleName, ui.lastName, ui.suffix,
      ui.phoneNumber, ui.houseNum, ui.province, ui.municipality,
      ui.barangay, ui.zipCode, ui.profile_Pic, ui.bio
    FROM user_credentials AS uc
    LEFT JOIN user_infos AS ui
      ON uc.id = ui.user_id
  `;

  db.query(sql, (err, result) => {
    if (err) {
      console.error("Error fetching data:", err);
      return res.status(500).json({ error: "Database error" });
    }

    const formattedUsers = result.map((user) => ({
      id: user.id,
      firstName: user.firstName,
      middleName: user.middleName,
      lastName: user.lastName,
      suffix: user.suffix,
      username: user.userName,
      email: user.email,
      phone: user.phoneNumber,
      role: user.userRole,
      image: user.profile_Pic
        ? `data:image/jpeg;base64,${user.profile_Pic.toString("base64")}`
        : null,
      address: `${user.houseNum || ""}, ${user.barangay || ""}, ${user.municipality || ""}, ${user.province || ""}, ${user.zipCode || ""}`.trim(),
      bio: user.bio || ""
    }));

    res.json(formattedUsers);
  });
});

app.post('/add_account', async (req, res) => {
  const { firstName, middleName, lastName, suffix, username, email, phone, password, role, image } = req.body;

  try {
    const hashedPassword = await bcrypt.hash(password, 10);

    let setRole;
    if (role === 'User') {
      setRole = "User";
    } else if (role === 'Admin') {
      setRole = "Admin"
    } else {
      setRole = "Veterinarian";
    }

    let imageBuffer = null;
    if (image) {
      const base64Data = image.replace(/^data:.+;base64,/, "");
      imageBuffer = Buffer.from(base64Data, "base64");
    }

    const sql_credentials = `
      INSERT INTO user_credentials (userName, email, password, userRole)
      VALUES (?, ?, ?, ?)
    `;

    const sql_informations = `
      INSERT INTO user_infos 
      (user_id, firstName, middleName, lastName, suffix, phoneNumber, profile_Pic)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;

    db.query(sql_credentials, [username, email, hashedPassword, setRole], (err, result) => {
      if (err) {
        console.error('DB credentials insert error:', err);
        return res.status(500).json({ error: 'Add Account failed (credentials)' });
      }

      const info_values = [result.insertId, firstName, middleName, lastName, suffix, phone, imageBuffer];

      db.query(sql_informations, info_values, (err2) => {
        if (err2) {
          console.error('DB infos insert error:', err2);
          return res.status(500).json({ error: 'Add Account failed (infos)' });
        }

        return res.status(200).json({ message: 'Add Account Successful' });
      });
    });

  } catch (err) {
    console.error('Server error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/update_account_admin', async (req, res) => {
  const { id, firstName, middleName, lastName, suffix, username, email, phone, password, role, image } = req.body;

  try {
    let hashedPassword = null;
    if (password && password.trim() !== "") {
      hashedPassword = await bcrypt.hash(password, 10);
    }

    let imageBuffer = null;
    if (image) {
      const base64Data = image.replace(/^data:.+;base64,/, "");
      imageBuffer = Buffer.from(base64Data, "base64");
    }

    const updateCredentialSql = `
      UPDATE user_credentials 
      SET userName = ?, email = ?, userRole = ? ${hashedPassword ? ", password = ?" : ""} 
      WHERE id = ?`;

    const credentialParams = hashedPassword
      ? [username, email, role, hashedPassword, id]
      : [username, email, role, id];

    const updateInfoSql = `
      UPDATE user_infos 
      SET firstName = ?, middleName = ?, lastName = ?, suffix = ?, phoneNumber = ? ${imageBuffer ? ", profile_Pic = ?" : ""} 
      WHERE user_ID = ?`;

    const infoParams = imageBuffer
      ? [firstName, middleName, lastName, suffix, phone, imageBuffer, id]
      : [firstName, middleName, lastName, suffix, phone, id];

    db.beginTransaction(err => {
      if (err) {
        console.error("Transaction error:", err);
        return res.status(500).json({ error: "Transaction failed" });
      }

      db.query(updateCredentialSql, credentialParams, (err, result1) => {
        if (err) {
          return db.rollback(() => {
            console.error("Error updating credentials:", err);
            res.status(500).json({ error: "Failed to update credentials" });
          });
        }

        db.query(updateInfoSql, infoParams, (err, result2) => {
          if (err) {
            return db.rollback(() => {
              console.error("Error updating user info:", err);
              res.status(500).json({ error: "Failed to update user info" });
            });
          }

          db.commit(err => {
            if (err) {
              return db.rollback(() => {
                console.error("Commit error:", err);
                res.status(500).json({ error: "Transaction commit failed" });
              });
            }
            res.json({ message: "Account updated successfully!" });
          });
        });
      });
    });

  } catch (err) {
    console.error("Server error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/login", (req, res) => {
  const { email, password } = req.body;

  const sql = `
    SELECT uc.*, ui.firstName, ui.middleName, ui.lastName, ui.suffix,
           ui.phoneNumber, ui.houseNum, ui.province, ui.municipality,
           ui.barangay, ui.zipCode, ui.profile_Pic, ui.bio
    FROM user_credentials AS uc
    LEFT JOIN user_infos AS ui
      ON uc.id = ui.user_id
    WHERE uc.email = ? AND uc.authType = 0
  `;

  db.query(sql, [email], (err, results) => {
    if (err) {
      console.error("[DB ERROR]", err);
      return res.status(500).json({ error: "Internal server error" });
    }
    if (results.length === 0) {
      console.warn("[LOGIN] No user found with email:", email);
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const user = results[0];
    console.log("[LOGIN] User found:", user.email, "Role:", user.userRole);

    bcrypt.compare(password, user.password, (bcryptErr, isMatch) => {
      if (bcryptErr) {
        console.error("[BCRYPT ERROR]", bcryptErr);
        return res.status(500).json({ error: "Internal server error" });
      }
      if (!isMatch) {
        console.warn("[LOGIN] Wrong password for:", email);
        return res.status(401).json({ error: "Invalid email or password" });
      }

      const userData = {
        id: user.id,
        email: user.email,
        username: user.userName,
        role: user.userRole,
        firstName: user.firstName,
        middleName: user.middleName,
        lastName: user.lastName,
        suffix: user.suffix,
        phone: user.phoneNumber,
        houseNum: user.houseNum,
        province: user.province,
        municipality: user.municipality,
        barangay: user.barangay,
        zipCode: user.zipCode,
        pic: user.profile_Pic ? Buffer.from(user.profile_Pic).toString("base64") : null,
        bio: user.bio,
      };

      let jitsiToken = null;
      if (user.userRole === "Veterinarian") {
        console.log("[JITSI] Generating token for vet:", user.email);
        console.log("[JITSI] ENV APP_ID:", JITSI_APP_ID);
        console.log("[JITSI] ENV API_KEY:", JITSI_APP_API_KEY);
        console.log("[JITSI] PRIVATE_KEY exists?", !!PRIVATE_KEY);

        try {
          const payload = {
            aud: "jitsi",
            iss: "chat",
            sub: JITSI_APP_ID,
            room: "*",
            context: {
              user: {
                id: user.id,
                name: `${user.firstName} ${user.lastName}`,
                email: user.email,
                moderator: "true",
              },
              features: {
                livestreaming: "true",
                recording: "true",
                transcription: "true",
              },
            },
            exp: Math.floor(Date.now() / 1000) + 3 * 60 * 60, // 3 hours
            nbf: Math.floor(Date.now() / 1000) - 10,
          };

          console.log("[JITSI] Payload:", JSON.stringify(payload, null, 2));

          jitsiToken = jwt.sign(payload, PRIVATE_KEY, {
            algorithm: "RS256",
            header: { kid: JITSI_APP_API_KEY },
          });

          console.log("[JITSI] Token generated successfully");
        } catch (jwtErr) {
          console.error("[JITSI ERROR] Failed to sign token:", jwtErr);
        }
      }

      res.status(200).json({
        message: "Login successful",
        user: userData,
        jitsiToken,
      });
    });
  });
});

app.post('/delete_account', (req, res) => {
  const { id } = req.body

  try {
    const deleteSql = `DELETE FROM user_credentials WHERE id = ?`;

    db.query(deleteSql, [id], (err, result) => {
      if (err) {
        console.error('Deletion error:', err);
        return res.status(500).json({ error: 'Internal server error' });
      } else {
        res.status(200).json({
          message: 'Deletion Successful!',
        });
      }
    })
  } catch (err) {
    console.error("Server error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/update_profile", async (req, res) => {
  try {
    const {
      id,
      firstName,
      middleName,
      lastName,
      suffix,
      phone,
      houseNumber,
      province,
      municipality,
      barangay,
      zipCode,
      bio,
      currentPassword,
      newPassword,
      password, // confirmation
      image,
    } = req.body;

    if (!id) return res.status(400).json({ error: "User ID is required" });

    // 📌 Fetch user
    const [user] = await new Promise((resolve, reject) => {
      db.query("SELECT * FROM user_credentials WHERE id = ?", [id], (err, results) => {
        if (err) reject(err);
        else resolve(results);
      });
    });

    if (!user) return res.status(404).json({ error: "User not found" });

    // 📌 Prepare updates
    let updatesInfo = [];
    let paramsInfo = [];

    if (firstName !== undefined) { updatesInfo.push("firstName = ?"); paramsInfo.push(firstName); }
    if (middleName !== undefined) { updatesInfo.push("middleName = ?"); paramsInfo.push(middleName); }
    if (lastName !== undefined) { updatesInfo.push("lastName = ?"); paramsInfo.push(lastName); }
    if (suffix !== undefined) { updatesInfo.push("suffix = ?"); paramsInfo.push(suffix); }
    if (phone !== undefined) { updatesInfo.push("phoneNumber = ?"); paramsInfo.push(phone); }
    if (houseNumber !== undefined) { updatesInfo.push("houseNum = ?"); paramsInfo.push(houseNumber); }
    if (province !== undefined) { updatesInfo.push("province = ?"); paramsInfo.push(province); }
    if (municipality !== undefined) { updatesInfo.push("municipality = ?"); paramsInfo.push(municipality); }
    if (barangay !== undefined) { updatesInfo.push("barangay = ?"); paramsInfo.push(barangay); }
    if (zipCode !== undefined) { updatesInfo.push("zipCode = ?"); paramsInfo.push(zipCode); }
    if (bio !== undefined) { updatesInfo.push("bio = ?"); paramsInfo.push(bio); }

    // 📌 Handle image update
    if (image) {
      const base64Data = image.replace(/^data:.+;base64,/, "");
      const imageBuffer = Buffer.from(base64Data, "base64");
      updatesInfo.push("profile_Pic = ?");
      paramsInfo.push(imageBuffer);
    }

    paramsInfo.push(id);

    // 📌 Password update only if provided
    if (currentPassword && newPassword && password) {
      const isMatch = await bcrypt.compare(currentPassword, user.password);
      if (!isMatch) return res.status(400).json({ error: "Current password is incorrect" });
      if (newPassword !== password) return res.status(400).json({ error: "Passwords do not match" });

      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await new Promise((resolve, reject) => {
        db.query("UPDATE user_credentials SET password = ? WHERE id = ?", [hashedPassword, id], (err, results) => {
          if (err) reject(err);
          else resolve(results);
        });
      });
    }

    // 📌 Only run info update if something changed
    if (updatesInfo.length > 0) {
      const sql = `UPDATE user_infos SET ${updatesInfo.join(", ")} WHERE user_ID = ?`;
      await new Promise((resolve, reject) => {
        db.query(sql, paramsInfo, (err, results) => {
          if (err) reject(err);
          else resolve(results);
        });
      });
    }

    // 📌 Fetch updated user
    const [updatedUser] = await new Promise((resolve, reject) => {
      const fetchsql = `
        SELECT uc.*, ui.firstName, ui.middleName, ui.lastName, ui.suffix,
               ui.phoneNumber, ui.houseNum, ui.province, ui.municipality,
               ui.barangay, ui.zipCode, ui.profile_Pic, ui.bio
        FROM user_credentials AS uc
        LEFT JOIN user_infos AS ui ON uc.id = ui.user_id
        WHERE uc.id = ?`;
      db.query(fetchsql, [id], (err, results) => {
        if (err) reject(err);
        else resolve(results);
      });
    });

    const userData = {
      id: updatedUser.id,
      email: updatedUser.email,
      username: updatedUser.userName,
      role: updatedUser.userRole,
      firstName: updatedUser.firstName,
      middleName: updatedUser.middleName,
      lastName: updatedUser.lastName,
      suffix: updatedUser.suffix,
      phone: updatedUser.phoneNumber,
      houseNum: updatedUser.houseNum,
      province: updatedUser.province,
      municipality: updatedUser.municipality,
      barangay: updatedUser.barangay,
      zipCode: updatedUser.zipCode,
      pic: updatedUser.profile_Pic ? Buffer.from(updatedUser.profile_Pic).toString("base64") : null,
      bio: updatedUser.bio,
    };

    res.status(200).json({
      success: true,
      message: "Update successful",
      user: userData,
    });

  } catch (err) {
    console.error("Server error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

app.post('/auth/google', async (req, res) => {
  const { token } = req.body;

  try {
    const ticket = await CLIENT.verifyIdToken({
      idToken: token,
      audience: google_Client_ID,
    });

    const fetchsql = `
      SELECT uc.*, ui.firstName, ui.middleName, ui.lastName, ui.suffix,
             ui.phoneNumber, ui.houseNum, ui.province, ui.municipality,
             ui.barangay, ui.zipCode, ui.profile_Pic, ui.bio
      FROM user_credentials AS uc
      LEFT JOIN user_infos AS ui
        ON uc.id = ui.user_id
      WHERE uc.email = ? AND uc.authType = 1
    `;

    const sql_informations = `
      INSERT INTO user_infos (user_id, firstName, lastName)
      VALUES (?, ?, ?)
    `;

    const payload = ticket.getPayload();
    let { email, given_name, family_name } = payload;
    let username = email.split("@")[0];

    if (!family_name) {
      family_name = null;
    }

    const sqlCheck = 'SELECT * FROM user_credentials WHERE email = ?';
    db.query(sqlCheck, [email], async (err, results) => {
      if (err) {
        console.error('DB error:', err);
        return res.status(500).json({ error: 'Database error' });
      }

      if (results.length > 0) {
        // ✅ If user already exists, make sure they are marked as verified
        db.query(
          'UPDATE user_credentials SET isverified = 1 WHERE email = ?',
          [email],
          (updateErr) => {
            if (updateErr) console.error('Error updating verification status:', updateErr);
          }
        );

        // ✅ Fetch full user info for login
        db.query(fetchsql, [email], (err, results) => {
          if (err) {
            console.error('Login error:', err);
            return res.status(500).json({ error: 'Internal server error' });
          }

          if (results.length === 0) {
            return res.status(401).json({ error: 'User Data Not Found' });
          }

          const user = results[0];

          const userData = {
            id: user.id,
            email: user.email,
            username: user.userName,
            role: user.userRole,
            firstName: user.firstName,
            middleName: user.middleName,
            lastName: user.lastName,
            suffix: user.suffix,
            phone: user.phoneNumber,
            houseNum: user.houseNum,
            province: user.province,
            municipality: user.municipality,
            barangay: user.barangay,
            zipCode: user.zipCode,
            pic: user.profile_Pic ? Buffer.from(user.profile_Pic).toString("base64") : null,
            bio: user.bio,
          };

          // (Jitsi token logic unchanged)
          let jitsiToken = null;
          if (user.userRole === "Veterinarian") {
            try {
              const payload = {
                aud: "jitsi",
                iss: "chat",
                sub: JITSI_APP_ID,
                room: "*",
                context: {
                  user: {
                    id: user.id,
                    name: `${user.firstName} ${user.lastName}`,
                    email: user.email,
                    moderator: "true",
                  },
                  features: {
                    livestreaming: "true",
                    recording: "true",
                    transcription: "true",
                  },
                },
                exp: Math.floor(Date.now() / 1000) + 3 * 60 * 60,
                nbf: Math.floor(Date.now() / 1000) - 10,
              };

              jitsiToken = jwt.sign(payload, PRIVATE_KEY, {
                algorithm: "RS256",
                header: { kid: JITSI_APP_API_KEY },
              });
            } catch (jwtErr) {
              console.error("[JITSI ERROR] Failed to sign token:", jwtErr);
            }
          }

          return res.status(200).json({
            message: 'Google login successful',
            user: userData,
            jitsiToken,
          });
        });

      } else {
        // New Google user → insert with verified = 1 ✅
        const sqlInsert = `
          INSERT INTO user_credentials (userName, email, password, isverified, authType)
          VALUES (?, ?, ?, 1, 1)
        `;
        const hashedPassword = await bcrypt.hash('GOOGLE_AUTH', 10);

        db.query(sqlInsert, [username, email, hashedPassword], (insertErr, result) => {
          if (insertErr) {
            console.error('Registration error:', insertErr);
            return res.status(500).json({ error: 'Registration failed' });
          }

          db.query(sql_informations, [result.insertId, given_name, family_name], (err) => {
            if (err) {
              console.error('Registration error:', err);
              return res.status(500).json({ error: 'Registration failed' });
            }

            db.query(fetchsql, [email], (err, results) => {
              if (err) {
                console.error('Login error:', err);
                return res.status(500).json({ error: 'Internal server error' });
              }

              if (results.length === 0) {
                return res.status(401).json({ error: 'User Data Not Found' });
              }

              const user = results[0];

              const userData = {
                id: user.id,
                email: user.email,
                username: user.userName,
                role: user.userRole,
                firstName: user.firstName,
                middleName: user.middleName,
                lastName: user.lastName,
                suffix: user.suffix,
                phone: user.phoneNumber,
                houseNum: user.houseNum,
                province: user.province,
                municipality: user.municipality,
                barangay: user.barangay,
                zipCode: user.zipCode,
                pic: user.profile_Pic ? Buffer.from(user.profile_Pic).toString("base64") : null,
                bio: user.bio,
              };

              // Jitsi token logic unchanged
              let jitsiToken = null;
              if (user.userRole === "Veterinarian") {
                try {
                  const payload = {
                    aud: "jitsi",
                    iss: "chat",
                    sub: JITSI_APP_ID,
                    room: "*",
                    context: {
                      user: {
                        id: user.id,
                        name: `${user.firstName} ${user.lastName}`,
                        email: user.email,
                        moderator: "true",
                      },
                      features: {
                        livestreaming: "true",
                        recording: "true",
                        transcription: "true",
                      },
                    },
                    exp: Math.floor(Date.now() / 1000) + 3 * 60 * 60,
                    nbf: Math.floor(Date.now() / 1000) - 10,
                  };

                  jitsiToken = jwt.sign(payload, PRIVATE_KEY, {
                    algorithm: "RS256",
                    header: { kid: JITSI_APP_API_KEY },
                  });
                } catch (jwtErr) {
                  console.error("[JITSI ERROR] Failed to sign token:", jwtErr);
                }
              }

              return res.status(200).json({
                message: 'Google registration successful',
                user: userData,
                jitsiToken,
              });
            });
          });
        });
      }
    });
  } catch (error) {
    console.error('Google auth error:', error);
    res.status(400).json({ error: 'Invalid Google token' });
  }
});

app.post('/online_consult', upload.single('file_payment'), (req, res) => {
  const { owner_name, pet_name, pet_type, pet_species, concern_description, consult_type } = req.body;
  const channel_consult_ID = "consult" + Date.now();

  const filePath = `/uploads/${req.file.filename}`;
  const fileType = req.file.mimetype;

  try {
    const sqlScript = `
      INSERT INTO online_consultation_table
        (channel_consult_ID, Owner_name, pet_name, pet_type, pet_species,
         payment_proof, concern_text, type_consult, fileType)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    db.query(sqlScript, [
      channel_consult_ID,
      owner_name,
      pet_name,
      pet_type,
      pet_species,
      filePath,
      concern_description,
      consult_type,
      fileType
    ], (err, result) => {
      if (err) {
        console.error("Error uploading data:", err);
        return res.status(500).json({ error: "Database error" });
      }

      res.json({
        message: "Success",
        success: true,
        channel_consult_ID
      });
    });
  } catch (err) {
    console.error('Server error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/fetch_pet/:username', (req, res) => {
  const { username } = req.params;
  const sql = 'SELECT pet_name, petType, species FROM pet_medical_records WHERE owner_username = ?';

  db.query(sql, [username], (err, results) => {
    if (err) {
      console.error("Error fetching data:", err);
      return res.status(500).json({ error: "Database error" });
    };

    if (results.length === 0) {
      return res.json({ success: true, data: [] });
    }

    return res.json({
      success: true,
      data: results
    });
  })
});

app.get('/online_consult_fetch', (req, res) => {
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
        concern: item.concern_text,
        consultationType: item.type_consult,
        ownerName: item.Owner_name,
        paymentProof: item.payment_proof,
        fileType: item.fileType,
      }));

      res.json({ fetchData: formattedResults });
    });
  } catch (err) {
    console.error("Server error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

app.post('/fetch_services', (req, res) => {
  const fetchDataServicesSQL = `SELECT * FROM services`;

  db.query(fetchDataServicesSQL, (err, results) => {
    if (err) {
      console.error("Error fetching data:", err);
      return res.status(500).json({ error: "Database error" });
    };

    const servicesData = results.map((service) => ({
      id: service.id,
      title: service.title,
      description: service.description,
      image: service.image
        ? `data:image/jpeg;base64,${service.image.toString("base64")}`
        : null,
    }));

    res.json(servicesData);
  })
});

app.post('/add_services', async (req, res) => {
  const { title, description, image } = req.body;

  if (!title || !description || !image) {
    return res.status(400).json({ success: false, message: "Missing required fields" });
  }

  try {
    const base64Data = image.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(base64Data, "base64");

    const insertSQL = "INSERT INTO services (title, description, image) VALUES (?, ?, ?)";
    db.query(insertSQL, [title, description, buffer], (err, result) => {
      if (err) {
        console.error("Error inserting service:", err);
        return res.status(500).json({ success: false, message: "Database error" });
      }
      res.json({ success: true, message: "Service added successfully", id: result.insertId });
    });
  } catch (err) {
    console.error('Server error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.put('/update_services/:id', async (req, res) => {
  const { id } = req.params;
  const { title, description, image } = req.body;

  if (!title || !description) {
    return res.status(400).json({ success: false, message: "Title and description are required" });
  }

  try {
    let updateSQL, values;

    if (image) {
      const base64Data = image.replace(/^data:image\/\w+;base64,/, "");
      const buffer = Buffer.from(base64Data, "base64");

      updateSQL = "UPDATE services SET title = ?, description = ?, image = ? WHERE id = ?";
      values = [title, description, buffer, id];
    } else {
      updateSQL = "UPDATE services SET title = ?, description = ? WHERE id = ?";
      values = [title, description, id];
    }

    db.query(updateSQL, values, (err, result) => {
      if (err) {
        console.error("Error updating service:", err);
        return res.status(500).json({ success: false, message: "Database error" });
      }
      if (result.affectedRows === 0) {
        return res.status(404).json({ success: false, message: "Service not found" });
      }
      res.json({ success: true, message: "Service updated successfully" });
    });
  } catch (err) {
    console.error("Server error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

app.delete('/delete_services/:id', (req, res) => {
  const { id } = req.params;

  try {
    const sql = `DELETE FROM services WHERE id = ?`;

    db.query(sql, [id], (err, result) => {
      if (err) {
        console.error('Deletion error:', err);
        return res.status(500).json({ success: false, error: 'Internal server error' });
      } else {
        return res.status(200).json({
          success: true,
          message: 'Deletion Successful!'
        });
      }
    });
  } catch (err) {
    console.error("Server error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
});

app.get("/fetchFeatures", (req, res) => {
  const sqlFeatures = `SELECT * FROM features`;

  db.query(sqlFeatures, (err, result) => {
    if (err) {
      console.error("Error fetching features:", err);
      return res.status(500).json({ error: "Database error" });
    }

    res.json({
      success: true,
      data: result
    });
  });
});

app.post("/add_features", (req, res) => {
  const { icon, title, description } = req.body;
  const sql = "INSERT INTO features (icon, title, description) VALUES (?, ?, ?)";
  db.query(sql, [icon, title, description], (err, result) => {
    if (err) return res.status(500).json({ success: false, error: err });
    res.json({ success: true, id: result.insertId });
  });
});

app.put("/update_features/:id", (req, res) => {
  const { id } = req.params;
  const { icon, title, description } = req.body;
  const sql = "UPDATE features SET icon=?, title=?, description=? WHERE id=?";
  db.query(sql, [icon, title, description, id], (err, result) => {
    if (err) return res.status(500).json({ success: false, error: err });
    res.json({ success: true });
  });
});

app.delete("/delete_features/:id", (req, res) => {
  const { id } = req.params;
  const sql = "DELETE FROM features WHERE id=?";
  db.query(sql, [id], (err, result) => {
    if (err) return res.status(500).json({ success: false, error: err });
    res.json({ success: true });
  });
});

// Fetch all inventory items
app.get("/fetch_inventory", (req, res) => {
  const sql = "SELECT * FROM inventory";
  db.query(sql, (err, results) => {
    if (err) {
      console.error("Error fetching inventory:", err);
      return res.status(500).json({ success: false, error: "Database error" });
    }
    res.json({ success: true, data: results });
  });
});

// Add new inventory item
app.post("/add_inventory", upload.single('photo'), (req, res) => {
  const { item_code, name, item_group, date_purchase, date_expiration, stock, price, unit } = req.body;
  const photo = req.file ? req.file.filename : null; // now includes extension

  if (!item_code || !name || !item_group || stock === undefined || price === undefined) {
    return res.status(400).json({ success: false, message: "Missing required fields" });
  }

  const sql = `
    INSERT INTO inventory 
    (item_code, photo, name, item_group, date_purchase, date_expiration, stock, price, unit) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;
  db.query(sql, [item_code, photo, name, item_group, date_purchase, date_expiration, stock, price, unit], (err, result) => {
    if (err) {
      console.error("Error adding inventory:", err);
      return res.status(500).json({ success: false, error: "Database error" });
    }
    res.json({ success: true, id: result.insertId });
  });
});

// Update inventory item
app.put("/update_inventory/:id", upload.single("photo"), (req, res) => {
  const { id } = req.params;
  const {
    item_code,
    name,
    item_group,
    date_purchase,
    date_expiration,
    stock,
    price,
    unit,
  } = req.body;

  const newPhoto = req.file ? req.file.filename : null;

  // Step 1: Get the old photo first
  db.query("SELECT photo FROM inventory WHERE product_ID = ?", [id], (err, rows) => {
    if (err) {
      console.error("❌ Error fetching old photo:", err);
      return res.status(500).json({ success: false, error: "Database error" });
    }
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: "Item not found" });
    }

    const oldPhoto = rows[0].photo;

    // Step 2: If new file uploaded, delete the old one
    if (newPhoto && oldPhoto) {
      const oldPath = path.join(__dirname, "tmp/uploads", oldPhoto);
      fs.unlink(oldPath, (err) => {
        if (err) {
          console.warn("⚠️ Could not delete old photo:", oldPath, err.message);
        } else {
          console.log("🗑 Deleted old photo:", oldPath);
        }
      });
    }

    // Step 3: Update DB (use new photo if uploaded, otherwise keep old one)
    const photoToSave = newPhoto || oldPhoto;

    const sql = `
      UPDATE inventory 
      SET item_code=?, photo=?, name=?, item_group=?, date_purchase=?, date_expiration=?, stock=?, price=?, unit=? 
      WHERE product_ID=?
    `;

    db.query(
      sql,
      [
        item_code || null,
        photoToSave || null,
        name || null,
        item_group || null,
        date_purchase || null,
        date_expiration || null,
        stock || 0,
        price || 0,
        unit || null,
        id,
      ],
      (err, result) => {
        if (err) {
          console.error("❌ Error updating inventory:", err);
          return res.status(500).json({ success: false, error: "Database error" });
        }
        if (result.affectedRows === 0) {
          return res.status(404).json({ success: false, message: "Item not found" });
        }
        res.json({ success: true, message: "Item updated", photo: photoToSave });
      }
    );
  });
});

// Delete inventory item
app.delete("/delete_inventory/:id", (req, res) => {
  const { id } = req.params;

  // Step 1: Fetch the photo filename first
  db.query("SELECT photo FROM inventory WHERE product_ID = ?", [id], (err, rows) => {
    if (err) {
      console.error("❌ Error fetching photo for delete:", err);
      return res.status(500).json({ success: false, error: "Database error" });
    }
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: "Item not found" });
    }

    const photo = rows[0].photo;

    // Step 2: Delete DB record
    db.query("DELETE FROM inventory WHERE product_ID = ?", [id], (err, result) => {
      if (err) {
        console.error("❌ Error deleting inventory:", err);
        return res.status(500).json({ success: false, error: "Database error" });
      }

      // Step 3: Remove file if it exists
      if (photo) {
        const filePath = path.join(__dirname, "tmp/uploads", photo);
        fs.unlink(filePath, (err) => {
          if (err) {
            console.warn("⚠️ Could not delete photo:", filePath, err.message);
          } else {
            console.log("🗑 Deleted photo:", filePath);
          }
        });
      }

      res.json({ success: true, message: "Item and photo deleted" });
    });
  });
});

app.post('/appointments', (req, res) => {
  const { set_date, set_time, owner_name, user_id } = req.body;

  const sql = `INSERT INTO appointments_tables (set_date, set_time, owner_name, UID) VALUES (?, ?, ?, ?)`;
  db.query(sql, [set_date, set_time, owner_name, user_id], (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: `${set_date} at ${set_time}` });
  });
});

app.get('/appointments/:date', (req, res) => {
  const { date } = req.params; // date in YYYY-MM-DD
  const sql = 'SELECT set_time FROM appointments_tables WHERE set_date = ?';
  db.query(sql, [date], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    // Return an array of booked time strings
    const bookedTimes = results.map(r => r.set_time);
    res.json(bookedTimes);
  });
});

app.get('/appointments/user/:uid', (req, res) => {
  const { uid } = req.params;
  const sql = 'SELECT * FROM appointments_tables WHERE UID = ? ORDER BY set_date ASC, set_time ASC';
  db.query(sql, [uid], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results);
  });
});

app.get('/appointmentsvets/:date', (req, res) => {
  const { date } = req.params; // expects YYYY-MM-DD
  const sql = 'SELECT * FROM appointments_tables WHERE set_date = ?';
  db.query(sql, [date], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    console.log(date)
    res.json(results); // array of appointments
  });
});

app.put('/appointments/:id/status', (req, res) => {
  const { id } = req.params;
  const { status } = req.body; // 'Approved' or 'Declined'
  const sql = 'UPDATE appointments_tables SET status = ? WHERE id_appoint = ?';
  db.query(sql, [status, id], (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Status updated' });
  });
});

app.get('/fetch/pet_medical_records', (req, res) => {
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

app.get('/fetch_user/pet_medical_records/:username', (req, res) => {
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

app.get('/fetch/visit_history/:medical_id', (req, res) => {
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

app.post('/add_pet/pet_medical_records', upload.single('photo'), (req, res) => {
  const { owner_name, user_name, pet_name, species, pet_age, pet_gender, pet_condition, last_visit, diagnosis } = req.body;
  const photo = req.file ? req.file.filename : null;

  if (!owner_name || !pet_name || !species || !pet_age || !pet_gender || !pet_condition || !last_visit || !diagnosis) {
    return res.status(400).json({ success: false, message: "Missing required fields" });
  }

  const sql = `
    INSERT INTO pet_medical_records 
    (owner_name, owner_username, photo_pet, pet_name, species, pet_age, pet_gender, pet_condition, last_visit, diagnosis)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;
  db.query(sql, [owner_name, user_name, photo, pet_name, species, pet_age, pet_gender, pet_condition, last_visit, diagnosis], (err, result) => {
    if (err) {
      console.error("Error adding pet:", err);
      return res.status(500).json({ success: false, error: "Database error" });
    }
    res.json({ success: true, id: result.insertId });
  });
});

app.put('/edit_pet/pet_medical_records/:id', upload.single('photo'), (req, res) => {
  const { id } = req.params;
  const { owner_name, user_name, pet_name, species, pet_age, pet_gender, pet_condition, last_visit, diagnosis } = req.body;
  const photo = req.file ? req.file.filename : null;

  let sql = `
    UPDATE pet_medical_records 
    SET owner_name=?, owner_username=?, pet_name=?, species=?, pet_age=?, pet_gender=?, pet_condition=?, last_visit=?, diagnosis=?
  `;
  const values = [owner_name, user_name, pet_name, species, pet_age, pet_gender, pet_condition, last_visit, diagnosis];

  if (photo) {
    sql += `, photo_pet=?`;
    values.push(photo);
  }

  sql += ` WHERE id_medical_record=?`;
  values.push(id);

  db.query(sql, values, (err, result) => {
    if (err) {
      console.error("Error updating pet:", err);
      return res.status(500).json({ success: false, error: "Database error" });
    }
    res.json({ success: true, message: "Pet record updated" });
  });
});

app.post('/add_pet_history/pet_medical_records', (req, res) => {
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

app.put('/edit_pet_history/pet_medical_records/:id', (req, res) => {
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

app.get('/fetch/user_medical/:username', (req, res) => {
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

app.get('/fetch/orders', (req, res) => {
  const sql = `
    SELECT 
      o.id_order, 
      o.customer_name, 
      o.customer_address, 
      o.order_date, 
      o.total, 
      o.order_status,
      i.product_name, 
      i.quantity
    FROM orders o
    LEFT JOIN order_items i 
      ON o.id_order = i.order_id
  `;

  db.query(sql, (err, results) => {
    if (err) {
      console.error("Error fetching inventory:", err);
      return res.status(500).json({ success: false, error: "Database error" });
    }
    res.json({ success: true, data: results });
  });
});

app.get('/orders/:userId', (req, res) => {
  const { userId } = req.params;

  const sql = `
    SELECT 
      o.id_order, 
      o.customer_name, 
      o.customer_address, 
      o.order_date, 
      o.total, 
      o.order_status,
      i.product_name, 
      i.quantity
    FROM orders o
    LEFT JOIN order_items i 
      ON o.id_order = i.order_id
    WHERE o.uid = ?
    ORDER BY o.order_date DESC
  `;

  db.query(sql, [userId], (err, results) => {
    if (err) {
      console.error('Error fetching orders:', err);
      return res.status(500).json({ error: 'Server error' });
    }

    // Group rows by id_order
    const ordersMap = {};

    results.forEach(row => {
      if (!ordersMap[row.id_order]) {
        ordersMap[row.id_order] = {
          id_order: row.id_order,
          customer_name: row.customer_name,
          customer_address: row.customer_address,
          order_date: row.order_date,
          total: row.total,
          order_status: row.order_status,
          items: []
        };
      }

      if (row.product_name) {
        ordersMap[row.id_order].items.push({
          product_name: row.product_name,
          quantity: row.quantity
        });
      }
    });

    const groupedOrders = Object.values(ordersMap);
    res.json({ orders: groupedOrders });
  });
});

app.put('/update_status/orders/:id', (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  const sql = `UPDATE orders SET order_status = ? WHERE id_order = ?`;

  db.query(sql, [status, id], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Order Status updated' });
  });
});

app.post('/payment_setorder', async (req, res) => {
  const { amount, methods, name, address, date, items, uid, email, phone } = req.body;
  const status = 'Pending';

  const sqlorders = `
    INSERT INTO orders (uid, customer_name, customer_address, order_date, total, order_status, methodPayments)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `;

  const sqllistorders = `
    INSERT INTO order_items (order_id, product_ID, product_name, quantity)
    VALUES (?, ?, ?, ?)
  `;

  const sqlUpdateStock = `
    UPDATE inventory 
    SET stock = stock - ? 
    WHERE name = ? 
  `;

  const sqlCheckStock = `
    SELECT product_ID, name, stock FROM inventory WHERE name = ?
  `;

  try {
    db.query(sqlorders, [uid, name, address, date, amount, status, methods], (err, orderResult) => {
      if (err) {
        console.error('[DB] Insert Order Error:', err);
        return res.status(500).json({ success: false, message: 'Failed to create order' });
      }

      const orderId = orderResult.insertId;
      let lowStockWarnings = [];

      if (Array.isArray(items) && items.length > 0) {
        items.forEach((item) => {
          // 1️⃣ Insert order items
          db.query(sqllistorders, [orderId, item.product_ID, item.name, item.qty], (err2) => {
            if (err2) console.error('[DB] Insert Order Items Error:', err2);
          });

          // 2️⃣ Subtract from inventory stock
          db.query(sqlUpdateStock, [item.qty, item.name], (err3) => {
            if (err3) {
              console.error('[DB] Update Inventory Stock Error:', err3);
            } else {
              // 3️⃣ Check remaining stock
              db.query(sqlCheckStock, [item.name], (err4, stockResult) => {
                if (!err4 && stockResult.length > 0) {
                  const remaining = stockResult[0].stock;
                  if (remaining === 1) {
                    lowStockWarnings.push(`⚠️ ${item.name} is almost out of stock (only 1 left)!`);
                  } else if (remaining <= 0) {
                    lowStockWarnings.push(`❌ ${item.name} is now out of stock.`);
                  }
                }
              });
            }
          });
        });
      }

      // 🟢 If COD, finish immediately
      if (methods === 'cod') {
        return res.json({
          success: true,
          message: 'Order placed successfully with Cash on Delivery',
          orderId,
          redirectUrl: null,
          warnings: lowStockWarnings // send low stock messages to frontend too
        });
      }

      // 💳 PayMongo flow for GCash / Maya
      (async () => {
        try {
          const headers = {
            accept: 'application/json',
            'content-type': 'application/json',
            authorization: 'Basic ' + Buffer.from(`${process.env.SECRET_KEY_PAYMONGO}:`).toString('base64')
          };

          const amountInCentavos = Math.round(Number(amount) * 100);

          // Create Payment Intent
          const intentRes = await fetch('https://api.paymongo.com/v1/payment_intents', {
            method: 'POST',
            headers,
            body: JSON.stringify({
              data: {
                attributes: {
                  amount: amountInCentavos,
                  currency: 'PHP',
                  payment_method_allowed: ['gcash', 'paymaya'],
                  capture_type: 'automatic',
                  statement_descriptor: `Order #${orderId}`
                }
              }
            })
          });

          const intentData = await intentRes.json();
          if (!intentData.data) {
            console.error('[PAYMONGO INTENT ERROR]', intentData);
            return res.status(400).json({ success: false, message: 'Failed to create payment intent' });
          }

          const intentId = intentData.data.id;

          // Create Payment Method
          const methodRes = await fetch('https://api.paymongo.com/v1/payment_methods', {
            method: 'POST',
            headers,
            body: JSON.stringify({
              data: {
                attributes: {
                  type: methods, // gcash or paymaya
                  billing: { name, email, phone }
                }
              }
            })
          });

          const methodData = await methodRes.json();
          if (!methodData.data) {
            console.error('[PAYMONGO METHOD ERROR]', methodData);
            return res.status(400).json({ success: false, message: 'Failed to create payment method' });
          }

          const methodId = methodData.data.id;

          // Attach method
          const attachRes = await fetch(`https://api.paymongo.com/v1/payment_intents/${intentId}/attach`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              data: {
                attributes: {
                  payment_method: methodId,
                  return_url: `https://unconglutinated-anya-unhacked.ngrok-free.dev/users/pet-products?payment=success`
                }
              }
            })
          });

          const attachData = await attachRes.json();
          if (!attachData.data) {
            console.error('[PAYMONGO ATTACH ERROR]', attachData);
            return res.status(400).json({ success: false, message: 'Failed to attach payment method' });
          }

          const redirectUrl = attachData.data.attributes.next_action.redirect.url;
          res.json({
            success: true,
            message: 'Order created, proceed to payment',
            orderId,
            redirectUrl,
            warnings: lowStockWarnings
          });

        } catch (payErr) {
          console.error('[PAYMONGO ERROR]', payErr);
          res.status(500).json({ success: false, message: 'Payment setup failed' });
        }
      })();
    });
  } catch (err) {
    console.error('[SERVER ERROR]', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

app.get('/fetch/user_order/:id', (req, res) => {
  const { id } = req.params; // ✅ fix: use id, not uid

  const sql = `
    SELECT 
      oi.product_ID,
      i.photo AS product_image,
      i.price AS product_price,
      oi.product_name,
      oi.quantity,
      o.order_date,
      o.order_status
    FROM order_items oi
    JOIN orders o ON o.id_order = oi.order_id
    JOIN inventory i ON i.product_ID = oi.product_ID
    WHERE o.uid = ?
    ORDER BY o.order_date DESC
  `;

  db.query(sql, [id], (err, rows) => {
    if (err) {
      console.error('Error fetching user purchases:', err);
      return res.status(500).json({ error: 'Failed to fetch user purchases' });
    }

    res.json(rows);
  });
});

app.post("/api/notifications", (req, res) => {
  const { UID, title_notify, type_notify, details } = req.body;
  const notify_date = new Date();

  const query = `
    INSERT INTO notification (UID, title_notify, type_notify, details, notify_date)
    VALUES (?, ?, ?, ?, ?)
  `;

  db.query(query, [UID, title_notify, type_notify, details, notify_date], (err, result) => {
    if (err) return res.status(500).json({ error: err });

    // Emit real-time notification if user is connected
    const socketId = connectedUsers.get(UID);
    if (socketId) {
      io.to(socketId).emit("newNotification", {
        id: result.insertId,
        title_notify,
        type_notify,
        details,
        notify_date
      });
    }

    res.json({ success: true, id: result.insertId });
  });
});

app.get("/api/notifications/:uid", (req, res) => {
  const { uid } = req.params;
  db.query("SELECT * FROM notification WHERE UID = ? ORDER BY notify_date DESC", [uid], (err, rows) => {
    if (err) return res.status(500).json({ error: err });
    res.json(rows);
  });
});

app.get("/fetchAnnouncements", (req, res) => {
  const sql = `
    SELECT 
      id,
      title,
      content,
      button_text,
      button_link,
      DATE_FORMAT(date_posted, '%Y-%m-%d') AS date_posted,
      DATE_FORMAT(expiration_date, '%Y-%m-%d') AS expiration_date
    FROM announcements
    ORDER BY date_posted DESC
  `;

  db.query(sql, (err, result) => {
    if (err) {
      console.error("Error fetching announcements:", err);
      return res.status(500).json({ error: "Database error" });
    }
    res.json({ success: true, data: result });
  });
});

app.post("/addAnnouncement", (req, res) => {
  const { title, content, date_posted, expiration_date, button_text, button_link } = req.body;
  const sql = `
    INSERT INTO announcements (title, content, date_posted, expiration_date, button_text, button_link)
    VALUES (?, ?, ?, ?, ?, ?)
  `;

  db.query(sql, [title, content, date_posted, expiration_date, button_text, button_link], (err, result) => {
    if (err) {
      console.error("Error adding announcement:", err);
      return res.status(500).json({ success: false, error: err });
    }
    res.json({ success: true, id: result.insertId });
  });
});

app.put("/updateAnnouncement/:id", (req, res) => {
  const { id } = req.params;
  const { title, content, date_posted, expiration_date, button_text, button_link } = req.body;
  const sql = `
    UPDATE announcements
    SET title=?, content=?, date_posted=?, expiration_date=?, button_text=?, button_link=?
    WHERE id=?
  `;

  db.query(sql, [title, content, date_posted, expiration_date, button_text, button_link, id], (err, result) => {
    if (err) {
      console.error("Error updating announcement:", err);
      return res.status(500).json({ success: false, error: err });
    }
    res.json({ success: true });
  });
});

app.delete("/deleteAnnouncement/:id", (req, res) => {
  const { id } = req.params;
  const sql = "DELETE FROM announcements WHERE id=?";

  db.query(sql, [id], (err, result) => {
    if (err) {
      console.error("Error deleting announcement:", err);
      return res.status(500).json({ success: false, error: err });
    }

    res.json({ success: true });
  });
});

app.post('/add_pet_info', upload.single('photo'), (req, res) => {
  const { name, age, type, species, gender, ownerUsername, ownerName } = req.body
  const photo = req.file ? req.file.filename : null;

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

app.get('/fetch/metric_dashboard/:uid/:username', (req, res) => {
  const { uid, username } = req.params;

  const appointQuery = `SELECT COUNT(*) AS totalAppointments FROM appointments_tables WHERE UID = ?`;
  const petQuery = `SELECT COUNT(*) AS totalPets FROM pet_medical_records WHERE owner_username = ?`;
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

app.post("/api/ask-ai", async (req, res) => {
  const { message } = req.body;

  if (!message) return res.status(400).json({ error: "Message is required." });

  try {
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${AICHAT_API_KEY2}`,
      {
        contents: [
          {
            parts: [
              {
                text: `You are Dr. Paws — a friendly, professional veterinarian. 
                      Respond with empathy, clear explanations, and practical advice. 
                      Keep your tone caring and conversational. 
                      You may mention basic pet medications, but always remind users to consult a licensed vet first. 
                      Question: ${message}`
              }
            ]
          }
        ]
      },
      {
        headers: { "Content-Type": "application/json" }
      }
    );

    const aiReply =
      response.data?.candidates?.[0]?.content?.parts?.[0]?.text ||
      "I'm sorry, I couldn’t process that request.";

    res.json({ reply: aiReply });
  } catch (error) {
    console.error("Error calling Google AI:", error.response?.data || error.message);
    res.status(500).json({ reply: "Sorry, I couldn't process your request." });
  }
});

app.listen(port, async () => {
  console.log(`🚀 Server running on port ${port}`);
});

server.listen(5001, () => {
  console.log(`Socket.IO ready for on port ${5001}`);
})
