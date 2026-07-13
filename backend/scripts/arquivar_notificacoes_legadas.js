'use strict';

const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const Notificacao = require('../models/Notificacao');
const Instituicao = require('../models/Instituicao');

function toBool(v) {
  return ['1', 'true', 'sim', 'yes', 'y'].includes(String(v || '').trim().toLowerCase());
}

function getArg(name) {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : '';
}

async function resolverInstituicao({ slug, instituicaoId }) {
  if (instituicaoId && mongoose.Types.ObjectId.isValid(instituicaoId)) {
    const inst = await Instituicao.findById(instituicaoId).lean();
    if (inst) return inst;
  }

  if (slug) {
    const inst = await Instituicao.findOne({ slug: String(slug).trim() }).lean();
    if (inst) return inst;
  }

  return null;
}

async function main() {
  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!mongoUri) throw new Error('MONGO_URI/MONGODB_URI não encontrado no .env');

  const slug = getArg('slug');
  const instituicaoId = getArg('instituicao');
  const corte = getArg('corte');
  const somenteAtrasadas = toBool(getArg('somenteAtrasadas'));
  const executar = toBool(getArg('executar'));

  if (!slug && !instituicaoId) {
    throw new Error('Informe --slug=cmdpii ou --instituicao=OBJECT_ID');
  }

  if (!corte) {
    throw new Error('Informe a data de corte em --corte=AAAA-MM-DD');
  }

  const dataCorte = new Date(`${corte}T23:59:59.999Z`);
  if (Number.isNaN(dataCorte.getTime())) {
    throw new Error('Data de corte inválida. Use AAAA-MM-DD');
  }

  await mongoose.connect(mongoUri);

  const instituicao = await resolverInstituicao({ slug, instituicaoId });
  if (!instituicao) throw new Error('Instituição não encontrada');

  const filtro = {
    instituicao: instituicao._id,
    data: { $lte: dataCorte },
    arquivada: { $ne: true },
    entregue: true
  };

  if (somenteAtrasadas) {
    filtro.devolvidoPeloAluno = { $ne: true };
    filtro.prazoDevolucao = { $ne: null, $lt: new Date() };
  }

  const lista = await Notificacao.find(filtro)
    .select('_id numeroSequencial data prazoDevolucao status arquivada entregue devolvidoPeloAluno')
    .sort({ data: 1 })
    .lean();

  console.log('====================================================');
  console.log('ARQUIVAMENTO DE NOTIFICAÇÕES LEGADAS');
  console.log('Instituição:', instituicao.nome || instituicao.slug || String(instituicao._id));
  console.log('Data de corte:', dataCorte.toISOString());
  console.log('Somente atrasadas:', somenteAtrasadas ? 'SIM' : 'NÃO');
  console.log('Quantidade encontrada:', lista.length);
  console.log('Execução real:', executar ? 'SIM' : 'NÃO (simulação)');
  console.log('====================================================');

  for (const n of lista.slice(0, 30)) {
    console.log(
      `- ${n.numeroSequencial || String(n._id)} | data: ${
        n.data ? new Date(n.data).toISOString().slice(0, 10) : 'sem data'
      } | prazo: ${
        n.prazoDevolucao ? new Date(n.prazoDevolucao).toISOString().slice(0, 10) : 'sem prazo'
      } | entregue: ${!!n.entregue} | devolvida: ${!!n.devolvidoPeloAluno} | arquivada: ${!!n.arquivada}`
    );
  }

  if (!executar) {
    console.log('\nSimulação concluída. Nada foi alterado.');
    console.log(
      `Para executar:\nnode scripts/arquivar_notificacoes_legadas.js --slug=${instituicao.slug || slug} --corte=${corte}${somenteAtrasadas ? ' --somenteAtrasadas=true' : ''} --executar=true`
    );
    await mongoose.disconnect();
    return;
  }

  const resultado = await Notificacao.updateMany(
    filtro,
    {
      $set: {
        arquivada: true,
        alertaAtivo: false
      }
    }
  );

  console.log('\nAtualização concluída.');
  console.log('matchedCount:', resultado.matchedCount ?? resultado.n);
  console.log('modifiedCount:', resultado.modifiedCount ?? resultado.nModified);

  await mongoose.disconnect();
}

main()
  .then(() => {
    console.log('\nScript finalizado com sucesso.');
    process.exit(0);
  })
  .catch(async (err) => {
    console.error('\nErro no script:', err.message);
    try {
      await mongoose.disconnect();
    } catch (_) {}
    process.exit(1);
  });