// backend/scripts/peek_uma_notificacao.js
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

(async function main() {
  const MONGO_URI = process.env.MONGO_URI;
  if (!MONGO_URI) { console.error('Defina MONGO_URI no .env'); process.exit(1); }
  await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 7000 });
  const db = mongoose.connection.db;

  const Instituicoes = db.collection('instituicaos');
  const Notifs = db.collection('notificacaos');

  const inst = await Instituicoes.findOne({ nome: 'CMDPII-CZS' });
  if (!inst) { console.error('Instituição não encontrada'); process.exit(1); }

  // pegue 1 doc da CMDPII-CZS
  const doc = await Notifs.findOne({ instituicao: inst._id });
  console.log(JSON.stringify(doc, null, 2));

  await mongoose.disconnect();
})();
