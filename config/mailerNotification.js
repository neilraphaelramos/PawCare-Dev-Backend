// mailerNotification.js
const emailjs = require('@emailjs/nodejs');
require('dotenv').config();

const sendNotificationEmail = async ({
  toEmail,
  name,
  type,
  title,
  message,
  mess1,
  mess2
}) => {
  if (!toEmail) {
    throw new Error('Recipient email is empty');
  }

  const templateParams = {
    name: name,
    type: type,
    title: title,
    message: message,
    email: toEmail,
    company_name: 'Rivera Veterinary Clinic and Grooming Services',
    Mess1: mess1,
    Mess2: mess2
  };

  try {
    await emailjs.send(
      process.env.EMAIL_JS_SERVICE_ID_2,
      process.env.EMAIL_JS_NOTIFICATION_TEMPLATE_ID, // ⚠ Your NEW template ID
      templateParams,
      {
        publicKey: process.env.EMAIL_JS_PUBLIC_KEY_2,
        privateKey: process.env.EMAIL_JS_PRIVATE_KEY_2,
      }
    );

  } catch (err) {
    console.error(
      'EmailJS Notification sending error:',
      err.response ? err.response.data : err.message
    );
    throw err;
  }
};

module.exports = sendNotificationEmail;
