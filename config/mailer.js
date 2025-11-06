const nodemailer = require('nodemailer');
require('dotenv').config();

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,           
  secure: false,          
  auth: {
    user: process.env.EMAIL,
    pass: process.env.APP_PASS,
  },
});

module.exports = transporter;
