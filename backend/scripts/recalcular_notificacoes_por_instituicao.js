require('dotenv').config();
const mongoose = require('mongoose');

const Instituicao = require('../models/Instituicao');
const Aluno = require('../models/Aluno');
const Notificacao = require('../models/Notificacao');
const {
  getConfigDisciplinar,
  getClassificacaoComportamento
} = require('../utils/configuracaoDisciplinar');
const calcularNotaTSMD = require('../utils/calculoNota');

function normalizeText(v) {
  return String(v || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clampNota(n, limite = 10) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  if (x < 0) return 0;
  if (x > limite) return Number(limite.toFixed(2));
  return Number(x.toFixed(2));
}

function ehElogioNotif(n) {
  const natureza = normalizeText(n?.natureza);
  const tipo = normalizeText(n?.tipo);
  const tipoMedida = normalizeText(n?.tipoMedida);

  return (
    natureza === 'elogio' ||
    tipo === 'elogio' ||
    tipoMedida === 'elogio'
  );
}

function ehIndisciplinaNotif(n) {
  return !ehElogioNotif(n);
}

function normalizarValorPorNatureza(natureza, valor) {
  const bruto = toNumber(valor, 0);
  return normalizeText(natureza) === 'elogio' ? Math.abs(bruto) : -Math.abs(bruto);
}

async function encontrarInstituicao(identificador) {
  if (!identificador) return null;

  const or = [
    { slug: String(identificador).trim().toLowerCase() },
    { nome: new RegExp(`^${String(identificador).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
  ];

  if (mongoose.isValidObjectId(identificador)) {
    or.unshift({ _id: new mongoose.Types.ObjectId(identificador) });
  }

  return Instituicao.findOne({ $or: or }).select('_id nome slug').lean();
}

async function recalcularAluno(aluno, config) {
  const instituicao = aluno.instituicao || aluno.tenantId;
  const limiteMaximo = Number(config?.tsmd?.limiteMaximo ?? 10);

  const notificacoes = await Notificacao.find({
    aluno: aluno._id,
    $or: [
      { instituicao },
      { tenantId: instituicao }
    ]
  }).sort({ data: 1, createdAt: 1, _id: 1 });

  if (!notificacoes.length) {
    await Aluno.updateOne(
      { _id: aluno._id },
      {
        $set: {
          comportamento: clampNota(
            calcularNotaTSMD(aluno.dataEntrada, new Date(), [], config),
            limiteMaximo
          ),
          elogios: 0,
          atosIndisciplina: 0,
          notificacoesNegativas: 0,
          ultimaAtualizacaoComportamento: new Date()
        }
      }
    );
    return { notificacoes: 0, corrigidas: 0 };
  }

  const normalizadas = notificacoes.map((n) => {
    const obj = n.toObject();
    obj.valorNumerico = normalizarValorPorNatureza(obj.natureza, obj.valorNumerico);
    return obj;
  });

  let corrigidas = 0;

  for (let i = 0; i < notificacoes.length; i++) {
    const atualDoc = notificacoes[i];
    const atual = normalizadas[i];

    const anteriores = normalizadas.slice(0, i);
    const ateAtual = normalizadas.slice(0, i + 1);

    const refAtual = atual.createdAt || atual.data || new Date();
    const refAnterior = new Date(new Date(refAtual).getTime() - 1);

    const notaAnterior = clampNota(
      calcularNotaTSMD(aluno.dataEntrada, refAnterior, anteriores, config),
      limiteMaximo
    );

    const notaAtual = clampNota(
      calcularNotaTSMD(aluno.dataEntrada, refAtual, ateAtual, config),
      limiteMaximo
    );

    const classificacaoAnterior = getClassificacaoComportamento(notaAnterior, config);
    const classificacaoAtual = getClassificacaoComportamento(notaAtual, config);
    const valorCorrigido = atual.valorNumerico;

    const mudou =
      Number(atualDoc.valorNumerico) !== Number(valorCorrigido) ||
      Number(atualDoc.notaAnterior) !== Number(notaAnterior) ||
      Number(atualDoc.notaAtual) !== Number(notaAtual) ||
      String(atualDoc.classificacaoAnterior || '') !== String(classificacaoAnterior || '') ||
      String(atualDoc.classificacaoAtual || '') !== String(classificacaoAtual || '');

    if (mudou) {
      atualDoc.valorNumerico = valorCorrigido;
      atualDoc.notaAnterior = notaAnterior;
      atualDoc.notaAtual = notaAtual;
      atualDoc.classificacaoAnterior = classificacaoAnterior;
      atualDoc.classificacaoAtual = classificacaoAtual;
      await atualDoc.save();
      corrigidas++;
    }
  }

  const historicoFinal = await Notificacao.find({
    aluno: aluno._id,
    $or: [
      { instituicao },
      { tenantId: instituicao }
    ],
    ativo: { $ne: false },
    arquivada: { $ne: true }
  })
    .select('data valorNumerico createdAt quantidadeDias tipoMedida natureza tipo status')
    .sort({ data: 1, createdAt: 1, _id: 1 })
    .lean();

  const historicoCalculo = historicoFinal.map((n) => ({
    ...n,
    valorNumerico: normalizarValorPorNatureza(n.natureza, n.valorNumerico)
  }));

  const notaFinal = clampNota(
    calcularNotaTSMD(aluno.dataEntrada, new Date(), historicoCalculo, config),
    limiteMaximo
  );

  let elogios = 0;
  let atosIndisciplina = 0;
  let notificacoesNegativas = 0;

  for (const n of historicoFinal) {
    const isElogio = ehElogioNotif(n);
    const isIndisciplina = ehIndisciplinaNotif(n);
    const status = normalizeText(n?.status);

    if (isElogio) elogios += 1;
    if (isIndisciplina) atosIndisciplina += 1;
    if (isIndisciplina && status !== 'arquivado') notificacoesNegativas += 1;
  }

  await Aluno.updateOne(
    { _id: aluno._id },
    {
      $set: {
        comportamento: notaFinal,
        elogios,
        atosIndisciplina,
        notificacoesNegativas,
        ultimaAtualizacaoComportamento: new Date()
      }
    }
  );

  return {
    notificacoes: notificacoes.length,
    corrigidas
  };
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);

  const identificador = process.argv[2];
  if (!identificador) {
    console.log('Uso: node scripts/recalcular_notificacoes_por_instituicao.js <slug|nome|id>');
    process.exit(1);
  }

  const instituicao = await encontrarInstituicao(identificador);

  if (!instituicao) {
    console.log(`Instituição não encontrada: ${identificador}`);
    process.exit(1);
  }

  console.log('Instituição encontrada:');
  console.log(instituicao);

  const alunos = await Aluno.find({
    $or: [
      { instituicao: instituicao._id },
      { tenantId: instituicao._id }
    ]
  })
    .select('_id nome turma instituicao tenantId dataEntrada')
    .sort({ nome: 1 })
    .lean();

  console.log(`\nAlunos encontrados: ${alunos.length}\n`);

  const config = await getConfigDisciplinar(instituicao._id);

  let totalNotificacoes = 0;
  let totalCorrigidas = 0;
  let totalAlunosProcessados = 0;

  for (const aluno of alunos) {
    totalAlunosProcessados++;
    const resultado = await recalcularAluno(aluno, config);
    totalNotificacoes += resultado.notificacoes;
    totalCorrigidas += resultado.corrigidas;

    console.log(
      `[${totalAlunosProcessados}/${alunos.length}] ${aluno.nome} | turma=${aluno.turma} | notif=${resultado.notificacoes} | corrigidas=${resultado.corrigidas}`
    );
  }

  console.log('\n===== RESUMO =====');
  console.log({
    instituicao: instituicao.nome,
    slug: instituicao.slug,
    alunosProcessados: totalAlunosProcessados,
    notificacoesEncontradas: totalNotificacoes,
    notificacoesCorrigidas: totalCorrigidas
  });

  console.log('\nRecálculo em lote concluído com sucesso.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Erro no recálculo em lote:', err);
  process.exit(1);
});