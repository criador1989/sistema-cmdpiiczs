// backend/scripts/fixar_notificacoes_CMDPII_CZS.js
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

const Aluno = require('../models/Aluno');           // garante schema do aluno
const Notificacao = require('../models/Notificacao'); // vai usar o schema ATUALIZADO (instituicao = ObjectId)
const Instituicao = require('../models/Instituicao');
const calcularNotaTSMD = require('../utils/calculoNota');

function isHex24(s) { return typeof s === 'string' && /^[0-9a-fA-F]{24}$/.test(s); }

(async function main() {
  const MONGO_URI = process.env.MONGO_URI;
  if (!MONGO_URI) { console.error('❌ Defina MONGO_URI no .env'); process.exit(1); }

  console.log('🔌 Conectando...');
  await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 7000 });

  // 1) acha a instituição CMDPII-CZS
  const inst = await Instituicao.findOne({ nome: 'CMDPII-CZS' }).lean();
  if (!inst) { console.error('❌ Instituição CMDPII-CZS não encontrada.'); process.exit(1); }
  const instId = inst._id;
  console.log('✔️ Instituição:', inst.nome, '=>', instId.toString());

  // 2) Corrigir campo instituicao nas notificações (string/null -> ObjectId)
  const raw = mongoose.connection.db.collection('notificacaos'); // coleção física
  const res1 = await raw.updateMany(
    { instituicao: { $type: 'string' } },
    [{ $set: { instituicao: { $toObjectId: '$instituicao' } } }]
  );
  // qualquer null/ausente vira a CMDPII-CZS
  const res2 = await raw.updateMany(
    { $or: [{ instituicao: null }, { instituicao: { $exists: false } }] },
    { $set: { instituicao: instId } }
  );
  console.log('🏷️ instituicao ajustadas:', { stringsConvertidas: res1.modifiedCount, nullOuAusente: res2.modifiedCount });

  // 3) Vincular aluno (string 24hex -> ObjectId), somente desta instituição
  const alunos = await Aluno.find({ instituicao: instId }).select('_id').lean();
  const setAlunoIds = new Set(alunos.map(a => String(a._id)));
  console.log('👩‍🎓 Alunos na instituição:', alunos.length);

  const cursor = raw.find({ instituicao: instId }).project({ aluno: 1 });
  let toObjectId = 0, jaOk = 0, ignorados = 0;

  while (await cursor.hasNext()) {
    const doc = await cursor.next();
    const cur = doc.aluno;

    if (cur && typeof cur === 'object') { jaOk++; continue; }
    if (isHex24(cur)) {
      const hex = String(cur).toLowerCase();
      if (setAlunoIds.has(hex)) {
        await raw.updateOne({ _id: doc._id }, { $set: { aluno: new mongoose.Types.ObjectId(hex) } });
        toObjectId++;
      } else {
        // pode ser aluno de outra inst (não deveria), ou id inexistente
        ignorados++;
      }
    } else if (cur == null) {
      ignorados++;
    } else {
      // outros formatos inesperados
      ignorados++;
    }
  }
  console.log('🔁 aluno vinculados:', { convertidos: toObjectId, jaOk, ignorados });

  // 4) Recalcular comportamento de todos os alunos afetados (opcional, aqui faremos)
  console.log('🧮 Recalculando notas…');
  const NotifModel = mongoose.model('Notificacao'); // já carregado
  let totalRecalc = 0;

  for (const a of alunos) {
    const historico = await NotifModel.find({ aluno: a._id, instituicao: instId })
      .select('data valorNumerico createdAt')
      .sort({ data: 1, createdAt: 1 })
      .lean();

    if (historico.length === 0) continue;

    const alunoDoc = await Aluno.findById(a._id).select('dataEntrada comportamento').lean();
    if (!alunoDoc) continue;

    const novaNota = calcularNotaTSMD(alunoDoc.dataEntrada, new Date(), historico);
    await mongoose.connection.db.collection('alunos').updateOne(
      { _id: a._id },
      { $set: { comportamento: +Number(novaNota).toFixed(2) } }
    );
    totalRecalc++;
  }
  console.log('✅ Recalculo aplicado em alunos:', totalRecalc);

  // 5) Relatório final
  const totComAluno = await raw.countDocuments({ instituicao: instId, aluno: { $type: 'objectId' } });
  const totSemAluno = await raw.countDocuments({
    instituicao: instId,
    $or: [{ aluno: { $exists: false } }, { aluno: null }, { aluno: { $type: 'string' } }]
  });

  console.log('\n📊 Pós-migração (CMDPII-CZS):', { notificacoes_com_aluno_ObjectId: totComAluno, notificacoes_sem_vinculo: totSemAluno });

  await mongoose.disconnect();
  console.log('🏁 Concluído.');
})();
