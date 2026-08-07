'use strict';

const REGRAS_PADRAO = Object.freeze({
  mediaGlobalMinima: 8.5,
  mediaDisciplinaMinima: 8.0,
  notaRecuperacaoCorte: 7.0,
  notaAbaixoCorteImpede: true,
  notaDisciplinarMinima: 7.0,
});

function numeroOuNulo(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;

  const texto = String(value)
    .trim()
    .replace(/\s/g, '')
    .replace(/\.(?=\d{3}(?:\D|$))/g, '')
    .replace(',', '.');

  if (!texto) return null;
  const numero = Number(texto);
  return Number.isFinite(numero) ? numero : null;
}

function arredondar(value, casas = 2) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const fator = 10 ** casas;
  return Math.round((n + Number.EPSILON) * fator) / fator;
}

function booleanoRecuperacao(value) {
  if (value === true) return true;
  if (value === false || value === null || value === undefined || value === '') return false;
  const texto = String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
  return ['sim', 's', 'true', '1', 'x', 'recuperacao', 'recuperou', 'rp'].includes(texto);
}

function normalizarChaveComponente(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[º°ª]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function normalizarRegras(regras = {}) {
  return {
    mediaGlobalMinima: numeroOuNulo(regras.mediaGlobalMinima) ?? REGRAS_PADRAO.mediaGlobalMinima,
    mediaDisciplinaMinima: numeroOuNulo(regras.mediaDisciplinaMinima) ?? REGRAS_PADRAO.mediaDisciplinaMinima,
    notaRecuperacaoCorte: numeroOuNulo(regras.notaRecuperacaoCorte) ?? REGRAS_PADRAO.notaRecuperacaoCorte,
    notaAbaixoCorteImpede: regras.notaAbaixoCorteImpede !== false,
    notaDisciplinarMinima: numeroOuNulo(regras.notaDisciplinarMinima) ?? REGRAS_PADRAO.notaDisciplinarMinima,
  };
}

// Mantido com o mesmo nome para compatibilidade com os documentos já gravados.
// A classificação é exclusivamente acadêmica: a nota disciplinar não soma,
// não gera média e não é usada como desempate.
function calcularPontuacao(mediaGlobal) {
  return arredondar(numeroOuNulo(mediaGlobal));
}

function avaliarAlunoAlamar({
  disciplinas = [],
  alunoVinculado = false,
  notaDisciplinar = null,
  regras = {},
  componentesExcluidos = [],
} = {}) {
  const cfg = normalizarRegras(regras);
  const excluidos = new Set((componentesExcluidos || []).map(normalizarChaveComponente).filter(Boolean));
  const motivosAcademicos = [];
  const motivos = [];
  const avisos = [];
  const disciplinasCalculadas = [];
  const notasAbaixoCorte = [];

  for (const disciplinaOriginal of disciplinas) {
    const nome = String(disciplinaOriginal?.nome || 'Disciplina sem nome').trim();
    const chave = normalizarChaveComponente(nome);
    const considerarNoCalculo = !excluidos.has(chave);
    const notas = Array.isArray(disciplinaOriginal?.notas) ? disciplinaOriginal.notas : [];
    const notasValidas = notas
      .map(item => ({
        bimestre: Number(item?.bimestre),
        valor: numeroOuNulo(item?.valor),
        recuperacaoExplicita: booleanoRecuperacao(item?.recuperacaoExplicita),
      }))
      .filter(item => Number.isInteger(item.bimestre) && item.bimestre >= 1 && item.bimestre <= 4);

    const valores = notasValidas.map(item => item.valor).filter(value => value !== null);
    const mediaInformada = numeroOuNulo(disciplinaOriginal?.mediaSemestral);
    const mediaSemestral = mediaInformada !== null
      ? arredondar(mediaInformada)
      : (valores.length >= 2 ? arredondar(valores.reduce((acc, value) => acc + value, 0) / valores.length) : null);

    const recuperacaoExplicita = booleanoRecuperacao(disciplinaOriginal?.recuperacao) || notasValidas.some(n => n.recuperacaoExplicita);
    const abaixoCorte = notasValidas.filter(n => n.valor !== null && n.valor < cfg.notaRecuperacaoCorte);
    const recuperacaoPorNota = cfg.notaAbaixoCorteImpede && abaixoCorte.length > 0;
    const recuperacao = recuperacaoExplicita || recuperacaoPorNota;
    const recuperacaoDesconhecida = disciplinaOriginal?.recuperacaoDesconhecida === true;
    const dadosIncompletos = mediaSemestral === null || (valores.length < 2 && mediaInformada === null) || recuperacaoDesconhecida;
    const motivosDisciplina = [];

    if (dadosIncompletos) motivosDisciplina.push('NOTAS_INCOMPLETAS');
    if (recuperacaoDesconhecida) motivosDisciplina.push('RECUPERACAO_NAO_INFORMADA');
    if (mediaSemestral !== null && mediaSemestral < cfg.mediaDisciplinaMinima) motivosDisciplina.push('MEDIA_SEMESTRAL_INFERIOR_A_8');
    if (recuperacao) motivosDisciplina.push('RECUPERACAO_IDENTIFICADA');

    if (considerarNoCalculo) {
      abaixoCorte.forEach(item => {
        notasAbaixoCorte.push({ disciplina: nome, bimestre: item.bimestre, nota: item.valor });
      });
    }

    disciplinasCalculadas.push({
      nome,
      chave,
      considerarNoCalculo,
      notas: notasValidas,
      mediaSemestral,
      recuperacao,
      recuperacaoDesconhecida,
      dadosIncompletos,
      motivos: motivosDisciplina,
    });
  }

  const consideradas = disciplinasCalculadas.filter(d => d.considerarNoCalculo);
  const medias = consideradas.map(d => d.mediaSemestral).filter(value => value !== null);
  const dadosCompletos = consideradas.length > 0 && consideradas.every(d => !d.dadosIncompletos);
  const mediaGlobal = medias.length === consideradas.length && medias.length > 0
    ? arredondar(medias.reduce((acc, value) => acc + value, 0) / medias.length)
    : null;

  const ordenadas = consideradas
    .filter(d => d.mediaSemestral !== null)
    .sort((a, b) => a.mediaSemestral - b.mediaSemestral || a.nome.localeCompare(b.nome, 'pt-BR'));
  const menorMediaSemestral = ordenadas[0]?.mediaSemestral ?? null;
  const disciplinaMenorMedia = ordenadas[0]?.nome || '';
  const teveRecuperacao = consideradas.some(d => d.recuperacao);

  const criterioMediaGlobal = mediaGlobal !== null && mediaGlobal >= cfg.mediaGlobalMinima;
  const criterioTodasDisciplinas = dadosCompletos && consideradas.every(
    d => d.mediaSemestral !== null && d.mediaSemestral >= cfg.mediaDisciplinaMinima
  );
  const criterioSemRecuperacao = dadosCompletos && !teveRecuperacao;

  let elegibilidadeAcademica = 'PENDENTE';
  if (!consideradas.length) {
    motivosAcademicos.push('NENHUM_COMPONENTE_SELECIONADO');
  } else if (!dadosCompletos) {
    motivosAcademicos.push('DADOS_ACADEMICOS_INCOMPLETOS');
  } else {
    if (!criterioMediaGlobal) motivosAcademicos.push('MEDIA_GLOBAL_INFERIOR_A_8_5');
    if (!criterioTodasDisciplinas) motivosAcademicos.push('DISCIPLINA_COM_MEDIA_SEMESTRAL_INFERIOR_A_8');
    if (!criterioSemRecuperacao) motivosAcademicos.push('RECUPERACAO_NO_SEMESTRE');
    elegibilidadeAcademica = motivosAcademicos.length === 0 ? 'APTO' : 'NAO_APTO';
  }
  motivos.push(...motivosAcademicos);

  const notaDisc = numeroOuNulo(notaDisciplinar);
  const notaDisciplinarDisponivel = notaDisc !== null;
  const criterioNotaDisciplinar = notaDisciplinarDisponivel && notaDisc >= cfg.notaDisciplinarMinima;
  let status = elegibilidadeAcademica;

  if (!alunoVinculado) {
    status = 'PENDENTE';
    motivos.push('ALUNO_NAO_LOCALIZADO_NO_AXORIIN');
  } else if (!notaDisciplinarDisponivel) {
    status = 'PENDENTE';
    motivos.push('NOTA_DISCIPLINAR_INDISPONIVEL');
  } else if (!criterioNotaDisciplinar) {
    motivos.push('NOTA_DISCIPLINAR_INFERIOR_A_7');
    if (elegibilidadeAcademica === 'APTO') status = 'NAO_APTO';
  }

  avisos.push('A nota disciplinar é somente um requisito de habilitação: deve ser igual ou superior a 7,0 e não entra no cálculo ou na classificação.');
  avisos.push('A posição dos alunos aptos é definida exclusivamente pela média global dos componentes selecionados.');
  if (excluidos.size) avisos.push('Componentes desmarcados na configuração da apuração são ignorados na média global, nas médias mínimas e na verificação de recuperação.');

  return {
    disciplinas: disciplinasCalculadas,
    componentesConsiderados: consideradas.map(d => d.nome),
    componentesExcluidos: disciplinasCalculadas.filter(d => !d.considerarNoCalculo).map(d => d.nome),
    mediaGlobal,
    menorMediaSemestral,
    disciplinaMenorMedia,
    teveRecuperacao,
    notasAbaixoCorte,
    notaDisciplinar: notaDisc,
    pontuacaoClassificacao: calcularPontuacao(mediaGlobal),
    elegibilidadeAcademica,
    status,
    criterios: {
      mediaGlobal: criterioMediaGlobal,
      todasDisciplinas: criterioTodasDisciplinas,
      semRecuperacao: criterioSemRecuperacao,
      dadosCompletos,
      alunoVinculado: Boolean(alunoVinculado),
      notaDisciplinarDisponivel,
      notaDisciplinarMinima: criterioNotaDisciplinar,
    },
    motivos: [...new Set(motivos)],
    avisos: [...new Set(avisos)],
    regras: cfg,
  };
}

module.exports = {
  REGRAS_PADRAO,
  numeroOuNulo,
  arredondar,
  booleanoRecuperacao,
  normalizarChaveComponente,
  normalizarRegras,
  calcularPontuacao,
  avaliarAlunoAlamar,
};
