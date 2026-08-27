'use strict';

function texto(value) {
  return String(value ?? '').trim();
}

function idTexto(value) {
  if (!value) return '';
  return texto(value?._id || value);
}

function normalizar(value) {
  return texto(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function chaveLinha(linha) {
  const dia = Number(linha?.dia || 0);
  const pagina = Number(linha?.pagina || 0);
  if (pagina > 0) return `dia:${dia}|pagina:${pagina}`;
  return `dia:${dia}|linha:${Number(linha?.numeroLinha || 0)}`;
}

function vinculoConfirmado(linha) {
  if (texto(linha?.situacaoAplicacao).toLowerCase() === 'descartada') return false;
  return Boolean(idTexto(linha?.aluno)) && ['automatico', 'manual'].includes(texto(linha?.vinculoStatus));
}

function recuperarVinculos({ linhasAtuais = [], linhasAnteriores = [], alunos = [] } = {}) {
  const alunosPorId = new Map(alunos.map((aluno) => [idTexto(aluno), aluno]));
  const anterioresPorChave = new Map();
  linhasAnteriores.forEach((linha) => {
    if (!vinculoConfirmado(linha)) return;
    anterioresPorChave.set(chaveLinha(linha), linha);
  });

  const usados = new Set(
    linhasAtuais
      .filter(vinculoConfirmado)
      .map((linha) => idTexto(linha.aluno))
      .filter(Boolean),
  );
  let recuperados = 0;
  let indisponiveis = 0;

  linhasAtuais.forEach((linha) => {
    if (vinculoConfirmado(linha)) return;
    const anterior = anterioresPorChave.get(chaveLinha(linha));
    const alunoId = idTexto(anterior?.aluno);
    if (!alunoId || usados.has(alunoId)) return;
    const aluno = alunosPorId.get(alunoId);
    if (!aluno) {
      indisponiveis += 1;
      return;
    }
    if (linha?.turmaInformada && normalizar(linha.turmaInformada) !== normalizar(aluno.turma)) {
      indisponiveis += 1;
      return;
    }

    linha.aluno = aluno._id;
    linha.vinculoStatus = 'manual';
    linha.candidatos = [];
    linha.nomeInformado = aluno.nome || anterior.nomeInformado || linha.nomeInformado;
    linha.turmaInformada = aluno.turma || anterior.turmaInformada || linha.turmaInformada;
    linha.codigoInformado = aluno.codigoAcesso || anterior.codigoInformado || '';
    const situacaoAnterior = ['ausente', 'descartada'].includes(texto(anterior?.situacaoAplicacao).toLowerCase())
      ? texto(anterior.situacaoAplicacao).toLowerCase()
      : 'presente';
    if (situacaoAnterior === 'ausente') {
      linha.situacaoAplicacao = 'ausente';
      linha.situacaoAplicacaoMotivo = anterior.situacaoAplicacaoMotivo || 'Ausência recuperada da conferência anterior.';
    }
    usados.add(alunoId);
    recuperados += 1;
  });

  return { linhas: linhasAtuais, recuperados, indisponiveis };
}

function respostasConfirmadas(resultado, codigosExcluir = new Set()) {
  const respostas = {};
  (resultado?.respostas || []).forEach((item) => {
    const codigo = texto(item?.codigoQuestao).toUpperCase();
    if (!codigo || codigosExcluir.has(codigo) || !item?.respostaInformada) return;
    respostas[codigo] = item.resposta || 'BRANCO';
  });
  return respostas;
}

function mesclarRespostas(base = {}, novas = {}) {
  const combinadas = { ...(base || {}) };
  Object.entries(novas?.toObject?.() || novas || {}).forEach(([codigoOriginal, resposta]) => {
    const codigo = texto(codigoOriginal).toUpperCase();
    if (codigo) combinadas[codigo] = resposta;
  });
  return combinadas;
}

module.exports = {
  chaveLinha,
  vinculoConfirmado,
  recuperarVinculos,
  respostasConfirmadas,
  mesclarRespostas,
};
