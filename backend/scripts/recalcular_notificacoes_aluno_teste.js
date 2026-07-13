require('dotenv').config();
const mongoose = require('mongoose');

const Aluno = require('../models/Aluno');
const Notificacao = require('../models/Notificacao');
const { getConfigDisciplinar, getClassificacaoComportamento } = require('../utils/configuracaoDisciplinar');
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

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);

  const nomeBusca = 'teste';

  const alunos = await Aluno.find({
    nome: { $regex: `^${nomeBusca}$`, $options: 'i' }
  })
    .select('_id nome turma instituicao tenantId dataEntrada comportamento')
    .lean();

  if (!alunos.length) {
    console.log(`Nenhum aluno encontrado com nome "${nomeBusca}".`);
    process.exit(0);
  }

  console.log(`Alunos encontrados: ${alunos.length}`);
  alunos.forEach((a, i) => {
    console.log(`${i + 1}. ${a.nome} | turma=${a.turma} | id=${a._id} | inst=${a.instituicao || a.tenantId}`);
  });

  // pega o primeiro "teste"
  const aluno = alunos[0];
  const instituicao = aluno.instituicao || aluno.tenantId;

  const config = await getConfigDisciplinar(instituicao);
  const limiteMaximo = Number(config?.tsmd?.limiteMaximo ?? 10);

  console.log('\nUsando aluno:');
  console.log({
    id: String(aluno._id),
    nome: aluno.nome,
    turma: aluno.turma,
    instituicao: String(instituicao),
    dataEntrada: aluno.dataEntrada
  });

  const notificacoes = await Notificacao.find({
    aluno: aluno._id,
    $or: [
      { instituicao },
      { tenantId: instituicao }
    ]
  })
    .sort({ data: 1, createdAt: 1, _id: 1 });

  if (!notificacoes.length) {
    console.log('Esse aluno não possui notificações.');
    process.exit(0);
  }

  console.log(`\nNotificações encontradas: ${notificacoes.length}\n`);

  // 1) normaliza sinal e salva em memória
  const normalizadas = notificacoes.map((n) => {
    const obj = n.toObject();
    obj.valorNumerico = normalizarValorPorNatureza(obj.natureza, obj.valorNumerico);
    return obj;
  });

  // 2) recalcula snapshots uma a uma
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

    atualDoc.valorNumerico = atual.valorNumerico;
    atualDoc.notaAnterior = notaAnterior;
    atualDoc.notaAtual = notaAtual;
    atualDoc.classificacaoAnterior = classificacaoAnterior;
    atualDoc.classificacaoAtual = classificacaoAtual;

    await atualDoc.save();

    console.log(
      `[${i + 1}/${notificacoes.length}] ${atualDoc.tipoMedida || atualDoc.tipo} | natureza=${atualDoc.natureza} | valor=${atualDoc.valorNumerico} | ${notaAnterior} -> ${notaAtual}`
    );
  }

  // 3) recalcula resumo final do aluno
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

  console.log('\nResumo final do aluno atualizado:');
  console.log({
    comportamento: notaFinal,
    elogios,
    atosIndisciplina,
    notificacoesNegativas
  });

  console.log('\nRecálculo concluído com sucesso.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Erro no recálculo:', err);
  process.exit(1);
});