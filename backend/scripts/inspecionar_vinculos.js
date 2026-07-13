// backend/scripts/inspecionar_vinculos.js
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

function col(db, primary, fallback) {
  const names = db.listCollections().toArray ? null : null;
  return db.collection(primary);
}

(async function main() {
  const MONGO_URI = process.env.MONGO_URI;
  if (!MONGO_URI) { console.error('❌ Defina MONGO_URI no .env'); process.exit(1); }

  await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 7000 });
  const db = mongoose.connection.db;

  const Instituicoes = db.collection('instituicaos');
  const inst = await Instituicoes.findOne({ nome: 'CMDPII-CZS' });
  if (!inst) { console.error('Instituição CMDPII-CZS não encontrada.'); process.exit(1); }
  const instId = inst._id;

  // coleções com as 2 possíveis pluralizações
  const Notifs = db.collection('notificacaos');   // Mongoose padrão
  const NotifsAlt = db.collection('notificacoes'); // alternativa
  const Observs = db.collection('observacaos');
  const Alunos = db.collection('alunos');

  async function existsColl(c) {
    try { await c.estimatedDocumentCount(); return true; } catch { return false; }
  }

  const useNotifs = (await existsColl(NotifsAlt)) ? NotifsAlt : Notifs;

  // 1) Tipos do campo instituicao nas notificações
  const tiposInst = await useNotifs.aggregate([
    { $group: { _id: { t: { $type: "$instituicao" } }, qtd: { $sum: 1 } } },
    { $sort: { qtd: -1 } }
  ]).toArray();

  // 2) Ver se há campo aluno e seu tipo
  const tiposAluno = await useNotifs.aggregate([
    { $group: { _id: { t: { $type: "$aluno" } }, qtd: { $sum: 1 } } },
    { $sort: { qtd: -1 } }
  ]).toArray();

  // 3) Outros campos candidatos
  const candidatos = ['alunoId','aluno_id','alunoCodigo','codigoAcesso','estudante','estudanteId','estudanteCodigo'];
  const candResumo = {};
  for (const f of candidatos) {
    const cur = await useNotifs.aggregate([
      { $match: { [f]: { $exists: true } } },
      { $group: { _id: { t: { $type: `$${f}` } }, qtd: { $sum: 1 } } },
      { $sort: { qtd: -1 } }
    ]).toArray().catch(() => []);
    candResumo[f] = cur;
  }

  // 4) Amostras de notificações da instituição alvo (pra visualizar chaves)
  const sample = await useNotifs.find({ instituicao: instId }).limit(5).toArray();

  // 5) Checar quantas notificações “linkam” com um aluno existente por _id
  const linkPorId = await useNotifs.aggregate([
    { $match: { instituicao: instId, aluno: { $type: 'objectId' } } },
    { $lookup: { from: 'alunos', localField: 'aluno', foreignField: '_id', as: 'al' } },
    { $project: { ok: { $gt: [{ $size: "$al" }, 0] } } },
    { $group: { _id: "$ok", qtd: { $sum: 1 } } },
    { $sort: { _id: -1 } }
  ]).toArray();

  // 6) Alunos por instituicao
  const totAlunos = await Alunos.countDocuments({ instituicao: instId });
  const totNotifs = await useNotifs.countDocuments({ instituicao: instId });
  const totObserv = await Observs.countDocuments({ instituicao: instId });

  console.log('\n=== TIPOS instituicao (notificações) ===');
  console.table(tiposInst.map(x => ({ tipo: x._id.t, qtd: x.qtd })));

  console.log('\n=== TIPOS aluno (notificações) ===');
  console.table(tiposAluno.map(x => ({ tipo: x._id.t, qtd: x.qtd })));

  console.log('\n=== Campos candidatos presentes (notificações) ===');
  for (const k of Object.keys(candResumo)) {
    console.log(k, candResumo[k].length ? candResumo[k] : '—');
  }

  console.log('\n=== Amostra (5) de notificações ===');
  for (const doc of sample) {
    const { _id, aluno, instituicao, tipo, data, valorNumerico, ...rest } = doc;
    console.log({ _id, aluno, instituicao, tipo, data, valorNumerico, outrasChaves: Object.keys(rest) });
  }

  console.log('\n=== Linkagem por _id (notificações) ===');
  console.table(linkPorId.map(x => ({ existeAluno: x._id, qtd: x.qtd })));

  console.log('\n=== Totais por instituição CMDPII-CZS ===');
  console.table({ alunos: totAlunos, notificacoes: totNotifs, observacoes: totObserv });

  await mongoose.disconnect();
  console.log('\n🏁 Inspeção concluída.');
})();
