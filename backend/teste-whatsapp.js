require('dotenv').config();
const enviarWhatsapp = require('./utils/twilio'); // ajuste o caminho se necessário

(async () => {
  console.log("🚀 Iniciando teste de envio...");

  const telefone = '+556899683070'; // número correto agora
  const mensagem = 'Olá! Esta é uma mensagem de teste do sistema escolar.';

  await enviarWhatsapp(telefone, mensagem);
})();
