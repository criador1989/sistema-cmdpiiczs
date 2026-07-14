import { GAME_CONFIG } from './config.js';

const STORAGE_KEYS_TOKEN = [
  'token',
  'authToken',
  'alunoToken',
  'portalAlunoToken',
  'axoriinToken',
  'jwt',
  'accessToken'
];

const STORAGE_KEYS_TENANT = [
  'tenant',
  'tenantSlug',
  'instituicao',
  'instituicaoSlug',
  'axoriinTenant'
];

function readStorage(key) {
  try {
    return localStorage.getItem(key) || sessionStorage.getItem(key);
  } catch (_) {
    return null;
  }
}

function findFirst(keys) {
  for (const key of keys) {
    const value = readStorage(key);
    if (value) return value;
  }
  return null;
}

export function getAuthHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  const token = findFirst(STORAGE_KEYS_TOKEN);
  const tenant = findFirst(STORAGE_KEYS_TENANT);

  if (token) headers.Authorization = token.startsWith('Bearer ') ? token : `Bearer ${token}`;
  if (tenant) headers['X-Tenant'] = tenant;

  return headers;
}

async function fetchJson(path, options = {}) {
  const response = await fetch(`${GAME_CONFIG.apiBase}${path}`, {
    ...options,
    headers: {
      ...getAuthHeaders(),
      ...(options.headers || {})
    }
  });

  if (!response.ok) {
    throw new Error(`Falha na API ${path}: ${response.status}`);
  }

  return response.json();
}

export async function carregarContextoJogo() {
  try {
    const data = await fetchJson('/contexto', { method: 'GET' });
    return normalizarContexto(data, false);
  } catch (error) {
    if (window.AXORIIN_ARENA?.debug) {
      console.warn('[Arena do Conhecimento] API indisponível. Usando modo demonstrativo.', error);
    }
    return normalizarContexto(criarContextoDemo(), true);
  }
}

export async function enviarResultadoMissao(resultado) {
  const payload = {
    missaoId: resultado.missaoId,
    acertos: resultado.acertos,
    total: resultado.total,
    pontos: resultado.pontos,
    xpGanho: resultado.xpGanho,
    respostas: resultado.respostas,
    origem: 'arena-conhecimento-mvp',
    versao: '0.1.0-mvp'
  };

  try {
    return await fetchJson(`/missoes/${encodeURIComponent(resultado.missaoId)}/concluir`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  } catch (error) {
    if (window.AXORIIN_ARENA?.debug) {
      console.warn('[Arena do Conhecimento] Resultado salvo apenas localmente.', error);
    }

    salvarResultadoLocal(payload);

    return {
      ok: true,
      modoDemo: true,
      mensagem: 'Resultado demonstrativo salvo localmente.'
    };
  }
}

export async function salvarAvatar(avatar) {
  try {
    return await fetchJson('/avatar', {
      method: 'PATCH',
      body: JSON.stringify({ avatar })
    });
  } catch (_) {
    try { localStorage.setItem('arena_avatar_demo', JSON.stringify(avatar)); } catch (_) {}
    return { ok: true, modoDemo: true };
  }
}

function salvarResultadoLocal(resultado) {
  try {
    const key = 'arena_conhecimento_resultados_demo';
    const historico = JSON.parse(localStorage.getItem(key) || '[]');
    historico.unshift({ ...resultado, salvoEm: new Date().toISOString() });
    localStorage.setItem(key, JSON.stringify(historico.slice(0, 20)));
  } catch (_) {}
}

function normalizarContexto(data, modoDemo) {
  const contexto = {
    modoDemo,
    aluno: data.aluno || {
      nome: 'Aluno Demonstrativo',
      turma: '7º A',
      etapa: 'Ensino Fundamental II',
      serie: '7º ano'
    },
    jogador: data.jogador || {
      nivel: 1,
      xp: 0,
      xpProximoNivel: 100,
      moedas: 0,
      avatar: 'cadete-azul',
      conquistas: []
    },
    ranking: data.ranking || rankingDemo(),
    missoes: data.missoes?.length ? data.missoes : [missaoDemo()]
  };

  return contexto;
}

function criarContextoDemo() {
  return {
    aluno: {
      nome: 'Aluno Demonstrativo',
      turma: '7º A',
      etapa: 'Ensino Fundamental II',
      serie: '7º ano'
    },
    jogador: {
      nivel: 1,
      xp: 20,
      xpProximoNivel: 100,
      moedas: 10,
      avatar: 'cadete-azul',
      conquistas: ['Primeiro Acesso']
    },
    ranking: rankingDemo(),
    missoes: [missaoDemo()]
  };
}

function rankingDemo() {
  return [
    { posicao: 1, nome: 'Cadete Alfa', turma: '7º A', xp: 950 },
    { posicao: 2, nome: 'Cadete Bravo', turma: '7º A', xp: 870 },
    { posicao: 3, nome: 'Cadete Delta', turma: '7º A', xp: 820 },
    { posicao: 4, nome: 'Aluno Demonstrativo', turma: '7º A', xp: 730 },
    { posicao: 5, nome: 'Cadete Sigma', turma: '7º A', xp: 690 }
  ];
}

function missaoDemo() {
  return {
    id: 'demo-convivencia-escolar',
    titulo: 'Missão da Convivência Escolar',
    descricao: 'Ajude o professor a fortalecer respeito, disciplina e participação no ambiente escolar.',
    npc: 'Professor Guardião',
    area: 'Pátio do Conhecimento',
    recompensa: {
      xpBase: 100,
      moedasBase: 25,
      medalha: 'Guardião do Conhecimento'
    },
    perguntas: [
      {
        id: 'q1',
        enunciado: 'Qual atitude fortalece a convivência escolar?',
        alternativas: [
          'Respeitar colegas e professores',
          'Ignorar as normas',
          'Faltar sem justificativa',
          'Desrespeitar os combinados'
        ],
        correta: 0
      },
      {
        id: 'q2',
        enunciado: 'O que significa estudar com disciplina?',
        alternativas: [
          'Estudar apenas na véspera',
          'Manter rotina, atenção e responsabilidade',
          'Copiar sem compreender',
          'Não participar das aulas'
        ],
        correta: 1
      },
      {
        id: 'q3',
        enunciado: 'Qual ferramenta pode ajudar a escola e a família a acompanharem o estudante?',
        alternativas: [
          'Falta de comunicação',
          'Registros desorganizados',
          'Plataforma de acompanhamento escolar',
          'Ausência de informações'
        ],
        correta: 2
      },
      {
        id: 'q4',
        enunciado: 'Em um quiz educacional, o principal objetivo é:',
        alternativas: [
          'Apenas competir',
          'Aprender, revisar e desenvolver conhecimento',
          'Decorar sem entender',
          'Evitar estudar'
        ],
        correta: 1
      },
      {
        id: 'q5',
        enunciado: 'Uma boa postura no ambiente escolar envolve:',
        alternativas: [
          'Responsabilidade, respeito e participação',
          'Indiferença e atraso',
          'Desorganização',
          'Falta de compromisso'
        ],
        correta: 0
      }
    ]
  };
}
