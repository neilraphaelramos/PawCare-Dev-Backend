const nodemailer = require('nodemailer');
const { google } = require('googleapis');
require('dotenv').config();

const CLIENT_ID = process.env.CLIENT_ID_GMAIL;
const CLIENT_SECRET = process.env.SECRET_CLIENT_KEY;
const REDIRECT_URI = process.env.REDIRECT_URI_LINK;
const REFRESH_TOKEN = process.env.REFRESH_TOKEN; // Use OAuth playground to get one

const oAuth2Client = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URI
);

oAuth2Client.setCredentials({ refresh_token: REFRESH_TOKEN });

async function sendEmail({ to, subject, html }) {
  try {
    const accessToken = await oAuth2Client.getAccessToken();

    const transport = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        type: 'OAuth2',
        user: process.env.TEST_EMAIL,
        clientId: CLIENT_ID,
        clientSecret: CLIENT_SECRET,
        refreshToken: REFRESH_TOKEN,
        accessToken: accessToken.token,
      },
    });

    const mailOptions = {
      from: `PawCare <${process.env.TEST_EMAIL}>`,
      to,
      subject,
      html,
    };

    const result = await transport.sendMail(mailOptions);
    return result;
  } catch (err) {
    console.error('Error sending email:', err);
    throw err;
  }
}

module.exports = sendEmail;