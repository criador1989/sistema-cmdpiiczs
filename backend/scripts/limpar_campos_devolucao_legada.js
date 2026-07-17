'use strict';

/**
 * Limpa do MongoDB os campos da antiga devolução física de notificações.
 *
 * A ciência digital do responsável NÃO é alterada. Permanecem preservados:
 * - responsavelCiencia
 * - tokenResponsavel
 * - mensagemEnviada / mensagemEnviadaEm
 * - histórico, auditoria e documentos
 *
 * Uso recomendado:
 *   Simulação: node scripts/limpar_campos_devolucao_legada.js --slug=cmdpii
 *   Execução:  node scripts/limpar_campos_devolucao_legada.js --slug=cmdpii --executar=true
 *
 * Sem --slug ou --instituicao, a limpeza abrangerá todas as instituições.
 */

const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const Notificacao = require('../models/Notificacao');
const Instituicao = require('../models/Instituicao');

function getArg(name) {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : '';
}

function toBool(v) {
  return ['1', 'true', 'sim', 'yes', 'y'].includes(String(v || '').trim().toLowerCase());
}

const CAMPOS_LEGADOS = [
  'entregue',
  'entregueEm',
  'prazoDevolucao',
  'devolvidoPeloAluno',
  'devolvidaEm',
  'alertaAtivo'
];

const INDEXES_LEGADOS = [
  'idx_notificacao_instituicao_arquivada_devolucao_status_data',
  'idx_notificacao_tenant_arquivada_devolucao_status_data',
  'idx_notificacao_instituicao_status_devolucao_arquivada_createdAt',
  'idx_notificacao_tenant_status_devolucao_arquivada_createdAt'
];

async function resolverInstituicao({ slug, instituicaoId }) {
  if (instituicaoId) {
    if (!mongoose.Types.ObjectId.isValid(instituicaoId)) {
      throw new Error('O valor informado em --instituicao não é um ObjectId válido.');
    }

    const instituicao = await Instituicao.findById(instituicaoId).lean();
    if (!instituicao) throw new Error('Instituição informada não encontrada.');
    return instituicao;
  }

  if (slug) {
    const instituicao = await Instituicao.findOne({ slug: String(slug).trim() }).lean();
    if (!instituicao) throw new Error(`Instituição com slug "${slug}" não encontrada.`);
    return instituicao;
  }

  return null;
}

function filtroInstituicao(instituicao) {
  if (!instituicao?._id) return null;
  const id = instituicao._id;
  const asString = String(id);
  return {
    $or: [
      { instituicao: id },
      { tenantId: id },
      { instituicao: asString },
      { tenantId: asString }
    ]
  };
}

async function main() {
  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!mongoUri) throw new Error('MONGO_URI/MONGODB_URI não encontrado no .env');

  const executar = toBool(getArg('executar'));
  const slug = getArg('slug');
  const instituicaoId = getArg('instituicao');

  await mongoose.connect(mongoUri);

  const instituicao = await resolverInstituicao({ slug, instituicaoId });
  const filtroCampos = {
    $or: CAMPOS_LEGADOS.map((campo) => ({ [campo]: { $exists: true } }))
  };
  const escopo = filtroInstituicao(instituicao);
  const filtro = escopo ? { $and: [escopo, filtroCampos] } : filtroCampos;

  const collection = Notificacao.collection;
  const total = await collection.countDocuments(filtro);

  console.log('====================================================');
  console.log('LIMPEZA DA DEVOLUÇÃO FÍSICA LEGADA');
  console.log(
    'Escopo:',
    instituicao
      ? instituicao.nome || instituicao.slug || String(instituicao._id)
      : 'TODAS AS INSTITUIÇÕES'
  );
  console.log('Documentos com campos antigos:', total);
  console.log('Execução real:', executar ? 'SIM' : 'NÃO (simulação)');
  console.log('A ciência digital dos responsáveis será preservada.');
  console.log('====================================================');

  if (!executar) {
    console.log('\nNada foi alterado. Revise o escopo e o total acima.');
    console.log('Para executar no mesmo escopo:');
    const escopoArg = instituicaoId
      ? ` --instituicao=${instituicaoId}`
      : slug
        ? ` --slug=${slug}`
        : '';
    console.log(`node scripts/limpar_campos_devolucao_legada.js${escopoArg} --executar=true`);
    await mongoose.disconnect();
    return;
  }

  const unset = Object.fromEntries(CAMPOS_LEGADOS.map((campo) => [campo, '']));
  const resultado = await collection.updateMany(filtro, { $unset: unset });

  // Índices são globais à coleção. Só os removemos quando a execução não está
  // limitada a uma instituição, evitando uma alteração global inesperada.
  const removidos = [];
  if (!instituicao) {
    const indexes = await collection.indexes();
    const existentes = new Set(indexes.map((item) => item.name));

    for (const indexName of INDEXES_LEGADOS) {
      if (!existentes.has(indexName)) continue;
      await collection.dropIndex(indexName);
      removidos.push(indexName);
    }
  }

  console.log('\nLimpeza concluída.');
  console.log('matchedCount:', resultado.matchedCount ?? resultado.n);
  console.log('modifiedCount:', resultado.modifiedCount ?? resultado.nModified);
  console.log(
    'Índices removidos:',
    instituicao
      ? 'não removidos nesta execução por instituição'
      : removidos.length
        ? removidos.join(', ')
        : 'nenhum encontrado'
  );

  await mongoose.disconnect();
}

main()
  .then(() => process.exit(0))
  .catch(async (err) => {
    console.error('\nErro:', err.message);
    try {
      await mongoose.disconnect();
    } catch (_) {}
    process.exit(1);
  });
