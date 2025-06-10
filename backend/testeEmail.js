const enviarEmail = require('./services/emailService');

(async () => {
  await enviarEmail(
    'SEU_EMAIL_REAL@outlook.com', // 👈 troque por seu e-mail real
    '🔔 Teste de Envio de E-mail',
    `
      <h2>Este é um teste do sistema escolar</h2>
      <p>Se você recebeu este e-mail, está tudo funcionando corretamente.</p>
    `
  );
})();
