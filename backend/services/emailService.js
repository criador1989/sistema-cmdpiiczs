const nodemailer = require('nodemailer');
require('dotenv').config();

const transporter = nodemailer.createTransport({
  host: 'smtp.office365.com',
  port: 587,
  secure: false, // TLS (STARTTLS)
  auth: {
    user: process.env.EMAIL_ORIGEM,
    pass: process.env.EMAIL_SENHA_APP
  },
  tls: {
    ciphers: 'SSLv3'
  }
});

async function enviarEmail(destinatario, assunto, mensagemHtml) {
  const mailOptions = {
    from: `"Colégio Militar Dom Pedro II" <${process.env.EMAIL_ORIGEM}>`,
    to: destinatario,
    subject: assunto,
    html: mensagemHtml
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`📧 E-mail enviado com sucesso para ${destinatario}`);
  } catch (error) {
    console.error('❌ Erro ao enviar e-mail:', error.message);
  }
}

module.exports = enviarEmail;
