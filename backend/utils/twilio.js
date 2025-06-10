const twilio = require('twilio');
const dotenv = require('dotenv');

dotenv.config();

const client = twilio(
  process.env.TWILIO_SID,
  process.env.TWILIO_AUTH_TOKEN
);

/**
 * Envia mensagem de WhatsApp para o responsável do aluno
 * @param {String} telefone - número no formato internacional, ex: +556699999999
 * @param {String} mensagem - texto da notificação
 */
async function enviarWhatsapp(telefone, mensagem) {
  try {
    const response = await client.messages.create({
      body: mensagem,
      from: process.env.TWILIO_PHONE, // ex: 'whatsapp:+14155238886'
      to: `whatsapp:${telefone}`
    });

    console.log('✅ Mensagem enviada:', response.sid);
  } catch (err) {
    console.error('❌ Erro ao enviar mensagem:', err.message);
  }
}

module.exports = enviarWhatsapp;
