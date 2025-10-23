// backend/scripts/descobrir_e_migrar_vinculo_notificacoes.js
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

function isHex24(s) { return typeof s === 'string' && /^[0-9a-fA-F]{24}$/.test(s); }

(async function main() {
  const MONGO_URI = process.env.MONGO_URI;
  if (!MONGO_URI) { console.error('❌ Defina MONGO_URI no .env'); process.exit(1); }

  await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 7000 });
  const db = mongoose.connection.db;

  const Instituicoes = db.collection('instituicaos');
  const Notifs       = db.collection('notificacaos');  // confirmado no seu banco
  const Alunos       = db.collection('alunos');

  // 0) pega a Instituição CMDPII-CZS
  const inst = await Instituicoes.findOne({ nome: 'CMDPII-CZS' });
  if (!inst) { console.error('❌ Instituição CMDPII-CZS não encontrada.'); process.exit(1); }
  const instId = inst._id;

  // 1) normaliza instituicao nas notificações (garantia)
  await Notifs.updateMany({ instituicao: { $type: 'string' } }, { $set: { instituicao: instId } });
  await Notifs.updateMany({ $or: [{ instituicao: null }, { instituicao: { $exists: false } }] }, { $set: { instituicao: instId } });

  // 2) carrega mapa de alunos dessa instituição
  const alunos = await Alunos.find({ instituicao: instId }).project({ _id: 1, codigoAcesso: 1, nome: 1 }).toArray();
  const setCodigos = new Set(alunos.map(a => a.codigoAcesso).filter(Boolean));
  const mapCodigoToId = new Map(alunos.filter(a => a.codigoAcesso).map(a => [a.codigoAcesso, a._id]));
  const setIds = new Set(alunos.map(a => String(a._id)));

  console.log('👩‍🎓 Alunos carregados:', alunos.length, '(com codigoAcesso:', setCodigos.size, ')');

  // 3) descobre candidatos de campos string nas notificações
  const sampleSize = 300; // amostra
  const sampleDocs = await Notifs.find({ instituicao: instId }).limit(sampleSize).toArray();

  // levanta chaves string vistas no sample
  const stringKeys = new Set();
  for (const d of sampleDocs) {
    for (const [k, v] of Object.entries(d)) {
      if (k === '_id' || k === 'instituicao' || k === 'createdAt' || k === 'updatedAt' || k === '__v') continue;
      if (typeof v === 'string') stringKeys.add(k);
    }
  }

  // 4) mede interseção de cada chave com (a) codigos de acesso e (b) _id 24hex de alunos
  const score = []; // { key, hitsCodigo, hitsObjectId }
  for (const key of stringKeys) {
    let hitsCodigo = 0, hitsObjectId = 0;
    for (const d of sampleDocs) {
      const val = d[key];
      if (typeof val !== 'string') continue;
      if (setCodigos.has(val)) hitsCodigo++;
      if (isHex24(val) && setIds.has(val.toLowerCase())) hitsObjectId++; // ids em setIds são string 24hex
    }
    if (hitsCodigo || hitsObjectId) score.push({ key, hitsCodigo, hitsObjectId });
  }

  console.log('\n🔎 Chaves candidatas e “acertos” na amostra (quanto maior, melhor):');
  console.table(score.sort((a,b)=> (b.hitsCodigo + b.hitsObjectId) - (a.hitsCodigo + a.hitsObjectId)));

  if (!score.length) {
    console.log('⚠️ Nenhuma chave string das notificações parece bater com codigoAcesso ou _id de alunos na amostra.');
    console.log('   -> Me envie 1 documento de notificacao completo para eu adaptar a heurística (ex.: findOne e copie o JSON).');
    await mongoose.disconnect(); return;
  }

  // 5) escolhe a melhor chave
  const best = score.sort((a,b)=> (b.hitsCodigo + b.hitsObjectId) - (a.hitsCodigo + a.hitsObjectId))[0];
  console.log('\n🏆 Melhor candidata de vínculo:', best);

  // 6) passa em todos os docs dessa instituição e cria/atualiza campo aluno
  const cursor = Notifs.find({ instituicao: instId }).project({ [best.key]: 1, aluno: 1 });
  let fixCodigo = 0, fixHex = 0, skip = 0, alreadyOk = 0;

  while (await cursor.hasNext()) {
    const doc = await cursor.next();
    const id = doc._id;
    const cur = doc[best.key];

    // já tem aluno vinculado?
    if (doc.aluno && typeof doc.aluno === 'object') { alreadyOk++; continue; }

    let novo = null;
    if (typeof cur === 'string') {
      if (setCodigos.has(cur)) {
        novo = mapCodigoToId.get(cur);
        fixCodigo++;
      } else if (isHex24(cur) && setIds.has(cur.toLowerCase())) {
        novo = new mongoose.Types.ObjectId(cur);
        fixHex++;
      }
    }

    if (novo) {
      await Notifs.updateOne({ _id: id }, { $set: { aluno: novo } });
    } else {
      skip++;
    }
  }

  console.log('\n🔁 Resultado da migração para campo "aluno":',
    { vinculadoPorCodigoAcesso: fixCodigo, vinculadoPorObjectIdHex: fixHex, jaPossuiAluno: alreadyOk, semCorrespondencia: skip });

  // 7) checagem final rápida
  const totComAluno = await Notifs.countDocuments({ instituicao: instId, aluno: { $type: 'objectId' } });
  const totSemAluno = await Notifs.countDocuments({ instituicao: instId, $or: [{ aluno: { $exists: false } }, { aluno: null }, { aluno: { $type: 'string' } }] });

  console.log('\n✅ Pós-migração (CMDPII-CZS):', { notificacoes_com_aluno_ObjectId: totComAluno, notificacoes_sem_vinculo: totSemAluno });

  await mongoose.disconnect();
  console.log('\n🏁 Concluído.');
})();
