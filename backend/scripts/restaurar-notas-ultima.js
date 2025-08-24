// scripts/restaurar-notas-ultima.js
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

const uri = process.env.MONGO_URI || process.env.MONGODB_URI || '';
if (!/^mongodb(\+srv)?:\/\//i.test(uri)) {
  console.error('❌ MONGO_URI ausente/inválida. Edite backend/.env');
  process.exit(1);
}

const Aluno = require('../models/Aluno');
const Notificacao = require('../models/Notificacao');

(async () => {
  console.log('🔌 Conectando…');
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  console.log('✅ Conectado');

  const alunos = await Aluno.find({}).select('_id nome comportamento').lean();
  console.log(`👥 Alunos encontrados: ${alunos.length}`);

  let atualizados = 0, semNotif = 0, semNota = 0;

  for (const a of alunos) {
    const last = await Notificacao.findOne({ aluno: a._id })
      .sort({ data: -1, createdAt: -1 })
      .select('notaAtual data createdAt')
      .lean();

    if (!last) {
      semNotif++;
      // OPCIONAL: descomente para fixar default 8.00 quando não houver notificações
      // await Aluno.updateOne({ _id: a._id }, { $set: { comportamento: 8.00 } });
      continue;
    }

    if (typeof last.notaAtual === 'number' && !Number.isNaN(last.notaAtual)) {
      const nova = +Number(last.notaAtual).toFixed(2);
      await Aluno.updateOne({ _id: a._id }, { $set: { comportamento: nova } });
      atualizados++;
    } else {
      semNota++;
    }
  }

  console.log(`✅ Restaurados pela última notificação: ${atualizados}`);
  console.log(`ℹ️  Alunos sem notificação: ${semNotif} (não alterados)`);
  console.log(`ℹ️  Notificações sem 'notaAtual': ${semNota}`);

  await mongoose.disconnect();
  console.log('🏁 Fim');
  process.exit(0);
})().catch(err => {
  console.error('💥 Falha:', err);
  process.exit(1);
});
