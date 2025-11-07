const emailjs = require('@emailjs/nodejs');
require('dotenv').config();

const sendEmail = async ({ toEmail, firstName, verifyLink }) => {
  if (!toEmail) {
    throw new Error('Recipient email is empty');
  }

  const templateParams = {
    user_name: firstName,
    user_email: toEmail,   
    verify_link: verifyLink,
    website_link: process.env.DEFAULT_URL,
    company_name: 'PawCare',
    support_email: process.env.SUPPORT_EMAIL || 'support@pawcare.com',
  };

  try {
    await emailjs.send(
      process.env.EMAIL_JS_SERVICE_ID,
      process.env.EMAIL_JS_TEMPLATE_ID_RESET,
      templateParams,
      {
        publicKey: process.env.EMAIL_JS_PUBLIC_KEY,
        privateKey: process.env.EMAIL_JS_PRIVATE_KEY,
      }
    );

  } catch (err) {
    console.error(
      'EmailJS sending error:',
      err.response ? err.response.data : err.message
    );
    throw err;
  }
};

module.exports = sendEmail;
