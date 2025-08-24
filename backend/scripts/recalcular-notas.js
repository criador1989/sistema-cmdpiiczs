// scripts/recalcular-notas.js
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
if (!/^mongodb(\+srv)?:\/\//i.test(uri || '')) {
  console.error('❌ MONGO_URI ausente/inválida. Ajuste backend/.env');
  process.exit(1);
}

// use seus models reais
const Aluno = require('../models/Aluno');
const Notificacao = require('../models/Notificacao');
const calcularNotaTSMD = require('../utils/calculoNota');

(async () => {
  console.log('🔌 Conectando…');
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  console.log('✅ Conectado');

  const alunos = await Aluno.find({}).lean();
  console.log(`👥 Alunos encontrados: ${alunos.length}`);

  let atualizados = 0;
  for (const a of alunos) {
    const notifs = await Notificacao.find({ aluno: a._id }).sort({ data: 1 }).lean();
    const nota = calcularNotaTSMD(a.dataEntrada, new Date(), notifs);
    // update direto para evitar re-hydrate
    await Aluno.updateOne({ _id: a._id }, { $set: { comportamento: +nota.toFixed(2) } });
    atualizados++;
    if (atualizados % 50 === 0) console.log(`… ${atualizados} alunos recalculados`);
  }

  console.log(`🏁 Recalculo concluído. Alunos atualizados: ${atualizados}/${alunos.length}`);
  await mongoose.disconnect();
  process.exit(0);
})().catch(err => {
  console.error('💥 Falha no recalculo:', err);
  process.exit(1);
});
