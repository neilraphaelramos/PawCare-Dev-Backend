const fs = require("fs");
const path = require("path");

function verificationEmailTemplate(firstName, verifyLink) {
  const filePath = path.join(__dirname, "html", "verifyEmail.html");
  let template = fs.readFileSync(filePath, "utf8");

  template = template.replace("{{user_name}}", firstName);
  template = template.replace("{{verify_link}}", verifyLink);

  return template;
}

function resetPasswordTemplate(user_email, user_name, verifyLink) {
  const filePath = path.join(__dirname, "html", "resetPassword.html");
  let template = fs.readFileSync(filePath, "utf8");

  template = template.replace("{{user_email}}", user_email);
  template = template.replace("{{verify_link}}", verifyLink);
  template = template.replace("{{user_name}}", user_name);

  return template;
}

module.exports = { verificationEmailTemplate, resetPasswordTemplate };
