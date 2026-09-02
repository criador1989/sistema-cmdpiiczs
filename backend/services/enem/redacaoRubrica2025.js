'use strict';

const GRADE_VERSAO = 'ENEM-2025-grade-especifica-v8-c1-auditoria-independente';
const PONTOS_POR_NIVEL = Object.freeze([0, 40, 80, 120, 160, 200]);

const FONTES = Object.freeze({
  cartilha: {
    titulo: 'A Redação do Enem 2025 — Cartilha do(a) Participante',
    orgao: 'Inep/MEC',
    ano: 2025,
    tipo: 'oficial_publica'
  },
  grade: {
    titulo: 'Grade Específica de Avaliação — Enem 2025',
    ano: 2025,
    tipo: 'material_operacional_fornecido'
  }
});

const COMPETENCIAS = Object.freeze({
  C1: {
    titulo: 'Modalidade escrita formal da língua portuguesa',
    niveis: [
      'Estrutura sintática inexistente, independentemente da quantidade de desvios.',
      'Estrutura sintática deficitária com muitos desvios.',
      'Estrutura sintática deficitária ou muitos desvios.',
      'Estrutura sintática regular e alguns desvios.',
      'Estrutura sintática boa e poucos desvios.',
      'Estrutura sintática excelente, com no máximo uma falha, e no máximo dois desvios.'
    ]
  },
  C2: {
    titulo: 'Compreensão da proposta, tipo textual e repertório sociocultural',
    niveis: [
      'Fuga total ao tema ou não atendimento ao tipo dissertativo-argumentativo.',
      'Tangenciamento ao tema, aglomerado caótico de palavras ou traços constantes de outros tipos textuais.',
      'Abordagem completa, porém com organização embrionária/incompleta; muitos trechos de cópia limitam a este nível.',
      'Abordagem completa com estrutura reconhecível, mas repertório baseado nos motivadores, não legitimado ou legitimado sem pertinência; certos limites de extensão/estrutura também podem limitar a este nível.',
      'Abordagem completa, três partes não embrionárias e repertório legitimado e pertinente, porém sem uso produtivo.',
      'Abordagem completa, três partes não embrionárias e repertório legitimado, pertinente e usado produtivamente.'
    ],
    alertas: [
      'Repertório de bolso, decorado, genérico ou forçado não deve ser considerado produtivo.',
      'A simples ausência de autor famoso ou dado estatístico não reduz automaticamente a nota.',
      'Repertório sociocultural pode ser mobilizado por paráfrase: não é necessária citação direta ou entre aspas quando a fonte/referência é identificável e sua relação com o argumento está clara.'
    ]
  },
  C3: {
    titulo: 'Projeto de texto e desenvolvimento argumentativo',
    niveis: [
      'Aglomerado caótico de palavras, independentemente da abordagem do tema.',
      'Projeto de texto sem foco temático ou com foco temático distorcido.',
      'Projeto de texto com muitas falhas e desenvolvimento de apenas uma informação, fato ou opinião; contradição grave limita a este nível.',
      'Projeto de texto com algumas falhas e desenvolvimento com algumas lacunas.',
      'Projeto de texto com poucas falhas e desenvolvimento com poucas lacunas.',
      'Projeto de texto estratégico e desenvolvimento de informações, fatos e opiniões em todo o texto, admitindo apenas deslizes pontuais.'
    ]
  },
  C4: {
    titulo: 'Mecanismos linguísticos de coesão',
    niveis: [
      'Ausência de articulação: palavras e/ou períodos desconexos ao longo de todo o texto.',
      'Presença rara de elementos coesivos intra/interparágrafos e/ou excessivas repetições/inadequações.',
      'Presença pontual de elementos coesivos e/ou muitas repetições/inadequações; texto em monobloco não deve ultrapassar este nível.',
      'Presença regular de elementos coesivos e/ou algumas repetições/inadequações.',
      'Presença constante de elementos coesivos e/ou poucas repetições/inadequações.',
      'Presença expressiva de elementos coesivos, com repetições raras ou ausentes e sem inadequação relevante.'
    ]
  },
  C5: {
    titulo: 'Proposta de intervenção',
    niveis: [
      'Ausência de proposta, proposta que desrespeita os direitos humanos ou proposta não relacionada sequer ao assunto.',
      'Tangenciamento do tema, apenas elementos nulos ou somente um elemento válido.',
      'Dois elementos válidos. Estruturas condicionais com dois ou mais elementos válidos e propostas sem ação não devem ultrapassar este nível.',
      'Três elementos válidos.',
      'Quatro elementos válidos.',
      'Cinco elementos válidos: agente, ação, meio/modo, finalidade e detalhamento.'
    ]
  }
});

const SITUACOES_ESPECIAIS = Object.freeze([
  { codigo: 'assinatura_identificacao', grupo: 'anulacao', descricao: 'Assinatura, nome, rubrica ou outra forma de identificação indevida no corpo do texto.' },
  { codigo: 'desenho_emoji', grupo: 'anulacao', descricao: 'Desenho, emoticon/emoji ou marca gráfica sem função textual evidente.' },
  { codigo: 'numero_isolado', grupo: 'anulacao', descricao: 'Número isolado no corpo do texto sem função evidente.' },
  { codigo: 'sinal_grafico_isolado', grupo: 'anulacao', descricao: 'Sinal gráfico isolado sem função esperada.' },
  { codigo: 'anulacao_proposital', grupo: 'anulacao', descricao: 'Risco, rasura, sobrescrita ou recusa explícita que configure tentativa proposital de anulação.' },
  { codigo: 'texto_ilegivel', grupo: 'anulacao', descricao: 'Texto ilegível a ponto de impossibilitar a leitura.' },
  { codigo: 'lingua_estrangeira', grupo: 'anulacao', descricao: 'Texto predominantemente ou integralmente em língua estrangeira, conforme regra oficial.' },
  { codigo: 'copia_prova', grupo: 'copia', descricao: 'Predomínio de cópia da proposta/caderno, sem quantidade suficiente de linhas autorais.' },
  { codigo: 'fuga_total', grupo: 'fuga_tema', descricao: 'Texto que não trata do tema nem do assunto proposto.' },
  { codigo: 'nao_atendimento_tipo', grupo: 'tipo_textual', descricao: 'Texto integral ou predominantemente em outro tipo textual que não o dissertativo-argumentativo.' },
  { codigo: 'parte_desconectada', grupo: 'parte_desconectada', descricao: 'Trecho deliberadamente desconectado do projeto de texto, como bilhete, impropério, ofensa, zombaria, oração, mensagem política ou reflexão sobre a prova.' },
  { codigo: 'texto_insuficiente', grupo: 'anulacao', descricao: 'Texto com quantidade oficial insuficiente de linhas. Em texto digitado, esta situação não deve ser inferida apenas por contagem de palavras.' }
]);

const CODIGOS_FRAGILIDADE = Object.freeze([
  'c1_estrutura_sintatica',
  'c1_desvios_formais',
  'c2_recorte_tematico',
  'c2_tipo_textual',
  'c2_repertorio_produtivo',
  'c2_copia_motivadores',
  'c3_tese',
  'c3_projeto_texto',
  'c3_desenvolvimento_argumentativo',
  'c3_lacunas_progressao',
  'c4_coesao_intra',
  'c4_coesao_inter',
  'c4_repeticoes',
  'c5_acao',
  'c5_agente',
  'c5_meio',
  'c5_finalidade',
  'c5_detalhamento',
  'geral_revisao'
]);

function nivelParaPontos(nivel) {
  const n = Number(nivel);
  return Number.isInteger(n) && n >= 0 && n <= 5 ? PONTOS_POR_NIVEL[n] : 0;
}

function pontosParaNivel(pontos) {
  const indice = PONTOS_POR_NIVEL.indexOf(Number(pontos));
  return indice >= 0 ? indice : 0;
}

function textoRubricaParaPrompt() {
  const partes = [];
  for (const [codigo, competencia] of Object.entries(COMPETENCIAS)) {
    partes.push(`${codigo} — ${competencia.titulo}`);
    competencia.niveis.forEach((criterio, nivel) => {
      partes.push(`Nível ${nivel} (${nivelParaPontos(nivel)} pontos): ${criterio}`);
    });
    (competencia.alertas || []).forEach((alerta) => partes.push(`Alerta: ${alerta}`));
    partes.push('');
  }
  return partes.join('\n');
}

module.exports = {
  GRADE_VERSAO,
  PONTOS_POR_NIVEL,
  FONTES,
  COMPETENCIAS,
  SITUACOES_ESPECIAIS,
  CODIGOS_FRAGILIDADE,
  nivelParaPontos,
  pontosParaNivel,
  textoRubricaParaPrompt
};
