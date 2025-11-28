const emailjs = require('@emailjs/nodejs');
require('dotenv').config();

const sendEmailNotice = async ({ toEmail, firstName, verifyLink }) => {
  if (!toEmail) {
    throw new Error('Recipient email is empty');
  }

  const templateParams = {
    name: firstName,
    email: toEmail,   
    unlock_link: verifyLink,
  };

  try {
    await emailjs.send(
      process.env.EMAIL_JS_SERVICE_ID_2,
      process.env.EMAIL_JS_TEMPLATE_ID_VERIFICATION,
      templateParams,
      {
        publicKey: process.env.EMAIL_JS_PUBLIC_KEY_2,
        privateKey: process.env.EMAIL_JS_PRIVATE_KEY_2,
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

module.exports = sendEmailNotice;
