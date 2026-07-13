// scripts/restaurar_vinculo_notificacoes.js
const mongoose = require('mongoose');
const Notificacao = require('../models/Notificacao');
require('dotenv').config();

console.log("🚀 Iniciando restauração de vínculos...");

// Mapa de vinculações manual por ID da notificação -> ID do aluno
const mapaVinculos = {
  '68482a4981f3af829db8ba35': 'INSIRA_ID_ALUNO_AQUI',
  '68482a1681f3af829db8ba27': 'INSIRA_ID_ALUNO_AQUI',
  '684b2e28e72fd6c8f37eaba1': 'INSIRA_ID_ALUNO_AQUI',
  '684b3c6d1f92380242cfb33f': 'INSIRA_ID_ALUNO_AQUI',
  '684b3cfa1f92380242cfb348': 'INSIRA_ID_ALUNO_AQUI',
  '684b3eca1f92380242cfb35c': 'INSIRA_ID_ALUNO_AQUI',
  '684b40171f92380242cfb369': 'INSIRA_ID_ALUNO_AQUI',
  '684c76d2e079e295589b5879': 'INSIRA_ID_ALUNO_AQUI',
  '684c7c0de079e295589b5894': 'INSIRA_ID_ALUNO_AQUI',
  '684c99ad9058def2db71e121': 'INSIRA_ID_ALUNO_AQUI',
  '684c9ab69058def2db71e130': 'INSIRA_ID_ALUNO_AQUI',
  '684c9de39058def2db71e14b': 'INSIRA_ID_ALUNO_AQUI',
  '684c9f119058def2db71e16b': 'INSIRA_ID_ALUNO_AQUI',
  '684ca56e9058def2db71e18c': 'INSIRA_ID_ALUNO_AQUI',
  '684ca63a9058def2db71e19f': 'INSIRA_ID_ALUNO_AQUI',
  '68507ca8249575cca9e11f93': 'INSIRA_ID_ALUNO_AQUI',
  '685084ba504c1b25f82c4ca4': 'INSIRA_ID_ALUNO_AQUI',
  '68509081c112826141f1bc31': 'INSIRA_ID_ALUNO_AQUI',
  '68516c15bc97a490e68d7216': 'INSIRA_ID_ALUNO_AQUI',
  '68516f9cbc97a490e68d725a': 'INSIRA_ID_ALUNO_AQUI',
  '68516ff4bc97a490e68d7260': 'INSIRA_ID_ALUNO_AQUI',
  '6851c56dee400fb3f5efca5c': 'INSIRA_ID_ALUNO_AQUI',
  '6851d7f0ee400fb3f5efcb45': 'INSIRA_ID_ALUNO_AQUI',
  '68531d0bee400fb3f5efcd31': 'INSIRA_ID_ALUNO_AQUI',
  '685313db4becf811eb0d9cdc': 'INSIRA_ID_ALUNO_AQUI',
  '685319bc1222c6e762c9f8b4': 'INSIRA_ID_ALUNO_AQUI',
  '68532c4aee400fb3f5efcd45': 'INSIRA_ID_ALUNO_AQUI',
  '685337d2a4c17f153f6a8c37': 'INSIRA_ID_ALUNO_AQUI',
  '6859c3be8356526c45ea27ec': 'INSIRA_ID_ALUNO_AQUI',
  '6859c5728356526c45ea280b': 'INSIRA_ID_ALUNO_AQUI',
  '6859c6b28356526c45ea2811': 'INSIRA_ID_ALUNO_AQUI',
  '6859c9168356526c45ea283f': 'INSIRA_ID_ALUNO_AQUI',
  '6859c9a18356526c45ea2845': 'INSIRA_ID_ALUNO_AQUI',
  '6859caba8356526c45ea2875': 'INSIRA_ID_ALUNO_AQUI'
};

async function restaurarVinculos() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('🟢 Conectado ao MongoDB.');

    let restauradas = 0;
    let ignoradas = 0;

    for (const [notificacaoId, alunoId] of Object.entries(mapaVinculos)) {
      const notificacao = await Notificacao.findById(notificacaoId);

      if (!notificacao) {
        console.warn(`⚠️ Notificação ID ${notificacaoId} não encontrada.`);
        ignoradas++;
        continue;
      }

      notificacao.aluno = alunoId;
      await notificacao.save();
      console.log(`✅ Vinculado ID ${notificacaoId} ao aluno ${alunoId}`);
      restauradas++;
    }

    console.log('\n📊 Resumo:');
    console.log(`🔄 Notificações restauradas: ${restauradas}`);
    console.log(`❌ Notificações não encontradas: ${ignoradas}`);
  } catch (erro) {
    console.error('❌ Erro ao restaurar:', erro);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Desconectado do MongoDB.');
  }
}

restaurarVinculos();
