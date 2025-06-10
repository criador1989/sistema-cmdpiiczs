const twilio = require('twilio');
const dotenv = require('dotenv');
dotenv.config();

const client = twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN);

async function enviarMensagem(celular, mensagem) {
  try {
    const resposta = await client.messages.create({
      body: mensagem,
      from: process.env.TWILIO_PHONE,
      to: celular
    });
    console.log('Mensagem enviada:', resposta.sid);
  } catch (erro) {
    console.error('Erro ao enviar mensagem:', erro.message);
  }
}

module.exports = enviarMensagem;
