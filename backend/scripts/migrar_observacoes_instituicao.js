/**
 * Migra Observacao.instituicao (String) -> ObjectId (Instituicao)
 * Estratégia:
 * - Para cada Observacao cuja instituicao é string (ou não é ObjectId),
 *   busca o Aluno vinculado e copia aluno.instituicao (ObjectId) para a Observacao.
 *
 * Requisitos:
 * - MONGODB_URI no .env (ou ajuste abaixo).
 *
 * Execução:
 *   node backend/scripts/migrar_observacoes_instituicao.js
 *
 * (Opcional) Batch:
 *   BATCH=500 node backend/scripts/migrar_observacoes_instituicao.js
 */

'use strict';

const mongoose = require('mongoose');
const path = require('path');

// Carrega .env do projeto (ajuste se seu entrypoint for outro)
require('dotenv').config({ path: path.resolve(process.cwd(), '.env') });

const Aluno = require('../models/Aluno');

// IMPORTANTÍSSIMO:
// Use o model Observacao ANTIGO (string) apenas para ler.
// Porém, se você já substituiu o model Observacao.js para ObjectId,
// o Mongoose ainda vai conseguir ler docs antigos (string) normalmente.
// Vamos usar o model atual mesmo:
const Observacao = require('../models/Observacao');

function isObjectIdLike(v) {
  return mongoose.Types.ObjectId.isValid(v) && String(new mongoose.Types.ObjectId(v)) === String(v);
}

async function main() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) {
    console.error('❌ Defina MONGODB_URI (ou MONGO_URI) no seu .env');
    process.exit(1);
  }

  const BATCH = Math.min(Math.max(parseInt(process.env.BATCH || '300', 10), 50), 2000);

  await mongoose.connect(uri, { autoIndex: false });
  console.log('✅ Conectado ao MongoDB');
  console.log('ℹ️ Batch:', BATCH);

  let totalCandidates = 0;
  let totalUpdated = 0;
  let totalNoAluno = 0;
  let totalAlunoSemInst = 0;
  let totalAlreadyOk = 0;

  // Consideramos "candidato" se:
  // - instituicao não existe OU
  // - instituicao é string OU
  // - instituicao existe mas não é ObjectId-like
  const query = {
    $or: [
      { instituicao: { $exists: false } },
      { instituicao: null },
      // strings (ou qualquer coisa que o $type identifique como string)
      { instituicao: { $type: 'string' } },
    ],
  };

  // Cursor para não estourar memória
  const cursor = Observacao.find(query).select('_id aluno instituicao').lean().cursor();

  const ops = [];
  for await (const obs of cursor) {
    totalCandidates += 1;

    // Se por algum motivo já estiver ObjectId-like (caso query pegue por exists=false etc)
    if (obs.instituicao && isObjectIdLike(String(obs.instituicao))) {
      totalAlreadyOk += 1;
      continue;
    }

    // Busca aluno e copia instituicao
    const alunoId = obs.aluno;
    if (!alunoId) {
      totalNoAluno += 1;
      continue;
    }

    const aluno = await Aluno.findById(alunoId).select('instituicao').lean().catch(() => null);
    if (!aluno) {
      totalNoAluno += 1;
      continue;
    }
    if (!aluno.instituicao) {
      totalAlunoSemInst += 1;
      continue;
    }

    ops.push({
      updateOne: {
        filter: { _id: obs._id },
        update: { $set: { instituicao: aluno.instituicao } },
      },
    });

    if (ops.length >= BATCH) {
      const r = await Observacao.bulkWrite(ops, { ordered: false });
      totalUpdated += (r.modifiedCount || 0);
      ops.length = 0;
      process.stdout.write(`\r🔄 Atualizadas: ${totalUpdated} (candidatas: ${totalCandidates})`);
    }
  }

  // flush final
  if (ops.length) {
    const r = await Observacao.bulkWrite(ops, { ordered: false });
    totalUpdated += (r.modifiedCount || 0);
  }

  console.log('\n\n✅ Migração concluída!');
  console.log('— Resumo —');
  console.log('Candidatas encontradas:', totalCandidates);
  console.log('Atualizadas:', totalUpdated);
  console.log('Já ok (pulo):', totalAlreadyOk);
  console.log('Sem aluno válido:', totalNoAluno);
  console.log('Aluno sem instituicao:', totalAlunoSemInst);

  // Sugestão: garantir index
  console.log('\nℹ️ Dica: depois rode sua app em ambiente de manutenção para garantir índices.');
  await mongoose.disconnect();
  console.log('✅ Desconectado.');
}

main().catch((err) => {
  console.error('\n❌ Erro na migração:', err);
  process.exit(1);
});
