import { GAME_CONFIG, LOCATIONS } from './config.js?v=20260717-v5-47-0-questoes-reais';

const STORAGE_KEYS_TOKEN = ['token', 'authToken', 'alunoToken', 'portalAlunoToken', 'axoriinToken', 'jwt', 'accessToken'];
const STORAGE_KEYS_TENANT = ['tenant', 'tenantSlug', 'instituicao', 'instituicaoSlug', 'axoriinTenant'];
const DAILY_KEY_PREFIX = 'arena_conhecimento_v4_diario_';
const AVATAR_KEY = 'arena_avatar_demo';

function todayKey() {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Rio_Branco', year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(new Date());
  } catch (_) {
    return new Date().toISOString().slice(0, 10);
  }
}

function dailyStorageKey() {
  return `${DAILY_KEY_PREFIX}${todayKey()}`;
}

function readStorage(key) {
  try { return localStorage.getItem(key) || sessionStorage.getItem(key); } catch (_) { return null; }
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
  const url = path.startsWith('/') ? path : `${GAME_CONFIG.apiBase}${path}`;
  const response = await fetch(url, {
    ...options,
    headers: { ...getAuthHeaders(), ...(options.headers || {}) }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.mensagem || data.erro || `Falha na API: ${response.status}`);
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}

export async function carregarContextoJogo() {
  try {
    const [portal, arena] = await Promise.all([
      fetchJson('/api/portal-aluno/contexto', { method: 'GET' }),
      fetchJson('/api/questionarios/arena/progresso', { method: 'GET' })
    ]);

    return normalizarContexto({
      aluno: {
        ...(portal.aluno || {}),
        serie: portal.portal?.serie ? `${portal.portal.serie}º ano` : '',
        etapa: portal.portal?.rotulo || 'Ensino Fundamental II'
      },
      jogador: arena.jogador || arena.progressoDiario?.jogador,
      progressoDiario: arena.progressoDiario,
      ranking: [],
      missoes: criarMissoes()
    }, false);
  } catch (error) {
    if (window.AXORIIN_ARENA?.debug) {
      console.warn('[Arena do Conhecimento] APIs reais indisponíveis. Modo demonstrativo ativado.', error);
    }
    return normalizarContexto(criarContextoDemo(), true);
  }
}

export async function carregarQuestoesArena(localId) {
  return fetchJson(`/api/questionarios/arena/gerar?localId=${encodeURIComponent(localId)}`, { method: 'GET' });
}

export async function responderQuestaoArena({ tentativaId, questaoId, respostaAluno, tempoRespostaSegundos }) {
  return fetchJson(`/api/questionarios/arena/${encodeURIComponent(tentativaId)}/responder`, {
    method: 'POST',
    body: JSON.stringify({ questaoId, respostaAluno, tempoRespostaSegundos })
  });
}

export async function finalizarMissaoArena(tentativaId) {
  return fetchJson(`/api/questionarios/arena/${encodeURIComponent(tentativaId)}/finalizar`, {
    method: 'POST',
    body: JSON.stringify({})
  });
}

export async function salvarAvatar(avatarId) {
  try { localStorage.setItem(AVATAR_KEY, avatarId); } catch (_) {}
  return { ok: true, salvoLocalmente: true };
}

function getDailyDemo() {
  try {
    const raw = localStorage.getItem(dailyStorageKey());
    if (raw) return JSON.parse(raw);
  } catch (_) {}
  return { data: todayKey(), respondidasHoje: 0, limite: GAME_CONFIG.dailyLimit, restantesHoje: GAME_CONFIG.dailyLimit };
}

export function registrarResultadoDemo(total) {
  try {
    const diario = getDailyDemo();
    diario.respondidasHoje = Math.min(diario.limite, Number(diario.respondidasHoje || 0) + Number(total || 0));
    diario.restantesHoje = Math.max(0, diario.limite - diario.respondidasHoje);
    localStorage.setItem(dailyStorageKey(), JSON.stringify(diario));
    return diario;
  } catch (_) {
    return getDailyDemo();
  }
}

function normalizarContexto(data, modoDemo) {
  const diarioDemo = getDailyDemo();
  const avatarSalvo = (() => {
    try { return localStorage.getItem(AVATAR_KEY); } catch (_) { return null; }
  })();

  const jogadorRecebido = data.jogador || {};
  const contexto = {
    modoDemo,
    aluno: data.aluno || { nome: 'Aluno Demonstrativo', turma: '6º A', etapa: 'Ensino Fundamental II', serie: '6º ano' },
    jogador: {
      nivel: jogadorRecebido.nivel || 1,
      xp: jogadorRecebido.xp || 0,
      xpProximoNivel: jogadorRecebido.xpProximoNivel || 1000,
      moedas: jogadorRecebido.moedas || 0,
      avatar: avatarSalvo || jogadorRecebido.avatar || 'cadete-azul',
      conquistas: jogadorRecebido.conquistas || []
    },
    progressoDiario: data.progressoDiario || diarioDemo,
    ranking: Array.isArray(data.ranking) ? data.ranking : [],
    missoes: data.missoes?.length ? data.missoes : criarMissoes()
  };

  contexto.progressoDiario.limite = contexto.progressoDiario.limite || GAME_CONFIG.dailyLimit;
  contexto.progressoDiario.restantesHoje = Math.max(
    0,
    contexto.progressoDiario.limite - Number(contexto.progressoDiario.respondidasHoje || 0)
  );
  return contexto;
}

function criarContextoDemo() {
  return {
    aluno: { nome: 'Aluno Demonstrativo', turma: '6º A', etapa: 'Ensino Fundamental II', serie: '6º ano' },
    jogador: { nivel: 1, xp: 180, xpProximoNivel: 1000, moedas: 120, avatar: 'cadete-azul', conquistas: ['Explorador Curioso'] },
    progressoDiario: getDailyDemo(),
    ranking: [],
    missoes: criarMissoes(true)
  };
}

function criarMissoes(incluirDemo = false) {
  return LOCATIONS.map((local) => ({
    id: `arena-6ano-${local.id}`,
    localId: local.id,
    titulo: `Missão do 6º ano: ${local.nome}`,
    descricao: local.descricao,
    npc: local.npc,
    area: local.area,
    recompensa: { xpBase: 60, moedasBase: 30, medalha: local.medalha },
    perguntas: incluirDemo ? perguntasDemo(local.id) : []
  }));
}

function q(id, enunciado, alternativas, correta, explicacao) {
  return {
    _id: id,
    id,
    enunciado,
    alternativas: alternativas.map((texto, index) => ({ letra: String.fromCharCode(65 + index), texto })),
    correta,
    explicacao,
    modoDemo: true
  };
}

function perguntasDemo(localId) {
  const banco = {
    laboratorio: [
      q('demo-mat-1', 'Qual é o resultado de 248 + 376?', ['514', '624', '634', '714'], 1, '248 + 376 = 624.'),
      q('demo-mat-2', 'Quanto é 3/4 de 20?', ['5', '10', '15', '18'], 2, '20 ÷ 4 = 5; 5 × 3 = 15.'),
      q('demo-mat-3', 'Qual número é divisível por 3?', ['124', '126', '128', '130'], 1, 'A soma dos algarismos de 126 é 9.')
    ],
    biblioteca: [
      q('demo-lp-1', 'O tema de um texto é:', ['Seu assunto principal', 'A primeira palavra', 'O nome do leitor', 'O número de linhas'], 0, 'Tema é o assunto central.'),
      q('demo-lp-2', 'Qual palavra é sinônimo de “rápido”?', ['Lento', 'Veloz', 'Pesado', 'Distante'], 1, 'Veloz tem sentido semelhante a rápido.'),
      q('demo-lp-3', 'Qual sinal encerra uma pergunta direta?', ['Vírgula', 'Dois-pontos', 'Interrogação', 'Ponto e vírgula'], 2, 'Perguntas diretas terminam com ponto de interrogação.')
    ],
    zoologico: [
      q('demo-cie-1', 'Qual destes animais é vertebrado?', ['Minhoca', 'Borboleta', 'Peixe', 'Aranha'], 2, 'O peixe possui coluna vertebral.'),
      q('demo-cie-2', 'A menor unidade estrutural dos seres vivos é:', ['Órgão', 'Célula', 'Tecido', 'Sistema'], 1, 'A célula é a unidade básica da vida.'),
      q('demo-cie-3', 'Em uma cadeia alimentar, plantas são:', ['Consumidores', 'Produtores', 'Predadores', 'Parasitas'], 1, 'Elas produzem matéria orgânica pela fotossíntese.')
    ],
    prefeitura: [
      q('demo-his-1', 'Uma fonte histórica pode ser:', ['Apenas texto escrito', 'Documento, objeto ou relato', 'Somente fotografia', 'Apenas monumento'], 1, 'Diferentes vestígios ajudam a estudar o passado.'),
      q('demo-geo-1', 'Os pontos cardeais são:', ['Norte, Sul, Leste e Oeste', 'Alto, baixo, perto e longe', 'Rio, lago, mar e oceano', 'Campo, cidade, bairro e rua'], 0, 'Norte, Sul, Leste e Oeste orientam a localização.'),
      q('demo-geo-2', 'Uma paisagem é formada por:', ['Apenas elementos naturais', 'Apenas construções', 'Elementos naturais e humanos', 'Somente mapas'], 2, 'Paisagens reúnem elementos naturais e culturais.')
    ],
    museu: [
      q('demo-art-1', 'Cores quentes incluem:', ['Vermelho, laranja e amarelo', 'Azul, verde e violeta', 'Preto, branco e cinza', 'Apenas marrom'], 0, 'Vermelho, laranja e amarelo são cores quentes.'),
      q('demo-his-2', 'Patrimônio cultural é importante porque:', ['Preserva referências e memórias', 'Apaga a história', 'Impede estudos', 'Só serve para decoração'], 0, 'Ele ajuda a preservar identidades e memórias.'),
      q('demo-art-2', 'Na música, ritmo organiza:', ['Sons e silêncios no tempo', 'Somente cores', 'Mapas e escalas', 'Rochas e minerais'], 0, 'Ritmo organiza durações, pausas e acentos.')
    ],
    floresta: [
      q('demo-geo-3', 'O desmatamento pode causar:', ['Perda de habitats', 'Aumento da biodiversidade', 'Formação imediata de rios', 'Redução da erosão sempre'], 0, 'A retirada da vegetação destrói habitats.'),
      q('demo-cie-4', 'A água passa do estado líquido para vapor por:', ['Condensação', 'Evaporação', 'Solidificação', 'Fusão'], 1, 'Evaporação é a passagem do líquido para o gasoso.'),
      q('demo-geo-4', 'Uma atitude sustentável é:', ['Desperdiçar água', 'Separar resíduos recicláveis', 'Queimar lixo', 'Desmatar margens de rios'], 1, 'Separar resíduos favorece a reciclagem.')
    ],
    'escola-militar': [
      q('demo-edf-1', 'Fair play significa:', ['Jogo limpo e respeito', 'Vencer a qualquer custo', 'Ignorar regras', 'Excluir colegas'], 0, 'Fair play envolve ética e respeito.'),
      q('demo-er-1', 'Respeitar a liberdade de consciência é:', ['Reconhecer diferentes convicções', 'Obrigar todos a pensar igual', 'Ridicularizar crenças', 'Impedir perguntas'], 0, 'Toda pessoa tem direito às próprias convicções.'),
      q('demo-edf-2', 'Antes de atividade física, é importante:', ['Observar segurança e orientação', 'Ignorar riscos', 'Esconder dor intensa', 'Dispensar regras'], 0, 'Segurança e orientação previnem acidentes.')
    ],
    praca: [
      q('demo-misto-1', '25% de 80 é:', ['15', '20', '25', '40'], 1, '25% corresponde a um quarto; 80 ÷ 4 = 20.'),
      q('demo-misto-2', 'Uma notícia tem como finalidade principal:', ['Informar fatos', 'Ensinar uma receita', 'Listar compras', 'Criar uma regra esportiva'], 0, 'A notícia informa acontecimentos de interesse público.'),
      q('demo-misto-3', 'Respeitar diferenças ajuda a:', ['Melhorar a convivência', 'Aumentar a discriminação', 'Impedir diálogo', 'Excluir colegas'], 0, 'O respeito favorece a convivência democrática.')
    ]
  };
  return banco[localId] || banco.praca;
}
