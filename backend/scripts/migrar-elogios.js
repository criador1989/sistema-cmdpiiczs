// scripts/migrar-elogios.js
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
if (!/^mongodb(\+srv)?:\/\//i.test(uri || '')) {
  console.error('❌ MONGO_URI ausente/ inválida. Edite backend/.env');
  process.exit(1);
}

const Notificacao = mongoose.model(
  'Notificacao',
  new mongoose.Schema(
    {
      natureza: String,
      tipo: String,
      motivo: String,
      tipoMedida: String,
      tipoElogio: String,
      valorNumerico: Number,
      quantidadeDias: Number,
      artigo: String,
      paragrafo: String,
      inciso: String,
      classificacaoRegulamento: String,
      data: Date,
      aluno: mongoose.Schema.Types.ObjectId,
      instituicao: String
    },
    { collection: 'notificacaos', timestamps: true }
  )
);

const MAPA_ELOGIO = {
  'Elogio Verbal': 'elogioVerbal',
  'Elogio Individual': 'boletimInternoIndividual',
  'Elogio Coletivo': 'boletimInternoColetivo',
  'Média ≥ 8,5': 'mediaAlta'
};

(async () => {
  console.log('🔌 Conectando…');
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  console.log('✅ Conectado');

  // 1) Backfill natureza ausente -> indisciplina
  const r1 = await Notificacao.updateMany(
    { $or: [{ natureza: { $exists: false } }, { natureza: null }] },
    { $set: { natureza: 'indisciplina' } }
  );
  console.log('Backfill natureza -> indisciplina:', r1.modifiedCount);

  // 2) Migrar elogios antigos (baseados no tipoMedida atual)
  const cursor = Notificacao.find({
    tipoMedida: { $in: Object.keys(MAPA_ELOGIO) }
  }).cursor();

  let mig = 0;
  for (let doc = await cursor.next(); doc; doc = await cursor.next()) {
    doc.natureza = 'elogio';
    doc.tipo = 'Elogio';
    doc.tipoMedida = 'Elogio';
    doc.tipoElogio = MAPA_ELOGIO[doc.tipoMedida] || MAPA_ELOGIO[doc.motivo] || null;
    doc.valorNumerico = Math.abs(Number(doc.valorNumerico || 0));
    doc.quantidadeDias = null;
    doc.artigo = doc.paragrafo = doc.inciso = doc.classificacaoRegulamento = null;
    await doc.save();
    mig++;
  }
  console.log('Elogios migrados:', mig);

  await mongoose.disconnect();
  console.log('🏁 Fim');
  process.exit(0);
})().catch(err => {
  console.error('💥 Falha na migração:', err);
  process.exit(1);
});
