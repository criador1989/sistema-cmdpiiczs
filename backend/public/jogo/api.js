import { GAME_CONFIG, LOCATIONS } from './config.js?v=20260718-v5-46-7-joystick-mobile-landscape';

const STORAGE_KEYS_TOKEN = ['token', 'authToken', 'alunoToken', 'portalAlunoToken', 'axoriinToken', 'jwt', 'accessToken'];
const STORAGE_KEYS_TENANT = ['tenant', 'tenantSlug', 'instituicao', 'instituicaoSlug', 'axoriinTenant'];
const DAILY_KEY_PREFIX = 'arena_conhecimento_v3_diario_';
const RESULTADOS_KEY = 'arena_conhecimento_v3_resultados_demo';
const AVATAR_KEY = 'arena_avatar_demo';

function todayKey() {
  return new Date().toISOString().slice(0, 10);
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
  const response = await fetch(`${GAME_CONFIG.apiBase}${path}`, {
    ...options,
    headers: { ...getAuthHeaders(), ...(options.headers || {}) }
  });
  if (!response.ok) throw new Error(`Falha na API ${path}: ${response.status}`);
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
    localId: resultado.localId,
    acertos: resultado.acertos,
    total: resultado.total,
    pontos: resultado.pontos,
    xpGanho: resultado.xpGanho,
    moedasGanhas: resultado.moedasGanhas,
    respostas: resultado.respostas,
    origem: 'arena-conhecimento-v3-cidade-organica',
    versao: GAME_CONFIG.version
  };

  try {
    return await fetchJson(`/missoes/${encodeURIComponent(resultado.missaoId)}/concluir`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  } catch (error) {
    if (window.AXORIIN_ARENA?.debug) console.warn('[Arena do Conhecimento] Resultado salvo apenas localmente.', error);
    salvarResultadoLocal(payload);
    registrarQuestoesDiarias(resultado.total || 0);
    return { ok: true, modoDemo: true, mensagem: 'Resultado demonstrativo salvo localmente.' };
  }
}

export async function salvarAvatar(avatarId) {
  try { localStorage.setItem(AVATAR_KEY, avatarId); } catch (_) {}
  try {
    return await fetchJson('/avatar', { method: 'PATCH', body: JSON.stringify({ avatar: avatarId }) });
  } catch (_) {
    return { ok: true, modoDemo: true };
  }
}

function salvarResultadoLocal(resultado) {
  try {
    const historico = JSON.parse(localStorage.getItem(RESULTADOS_KEY) || '[]');
    historico.unshift({ ...resultado, salvoEm: new Date().toISOString() });
    localStorage.setItem(RESULTADOS_KEY, JSON.stringify(historico.slice(0, 60)));
  } catch (_) {}
}

function getDailyDemo() {
  try {
    const raw = localStorage.getItem(dailyStorageKey());
    if (raw) return JSON.parse(raw);
  } catch (_) {}
  return { data: todayKey(), respondidasHoje: 0, limite: GAME_CONFIG.dailyLimit };
}

function registrarQuestoesDiarias(total) {
  try {
    const diario = getDailyDemo();
    diario.respondidasHoje = Math.min(diario.limite, Number(diario.respondidasHoje || 0) + Number(total || 0));
    localStorage.setItem(dailyStorageKey(), JSON.stringify(diario));
  } catch (_) {}
}

function normalizarContexto(data, modoDemo) {
  const diarioDemo = getDailyDemo();
  const avatarSalvo = (() => {
    try { return localStorage.getItem(AVATAR_KEY); } catch (_) { return null; }
  })();

  const contexto = {
    modoDemo,
    aluno: data.aluno || { nome: 'Aluno Demonstrativo', turma: '6º A', etapa: 'Ensino Fundamental II', serie: '6º ano' },
    jogador: data.jogador || {
      nivel: 1,
      xp: 180,
      xpProximoNivel: 500,
      moedas: 120,
      avatar: avatarSalvo || 'cadete-azul',
      conquistas: ['Explorador Curioso']
    },
    progressoDiario: data.progressoDiario || diarioDemo,
    ranking: data.ranking || rankingDemo(),
    missoes: data.missoes?.length ? data.missoes : missoesDemo()
  };

  if (avatarSalvo) contexto.jogador.avatar = avatarSalvo;
  contexto.progressoDiario.limite = contexto.progressoDiario.limite || GAME_CONFIG.dailyLimit;
  return contexto;
}

function criarContextoDemo() {
  return {
    aluno: { nome: 'Aluno Demonstrativo', turma: '6º A', etapa: 'Ensino Fundamental II', serie: '6º ano' },
    jogador: { nivel: 1, xp: 180, xpProximoNivel: 500, moedas: 120, avatar: 'cadete-azul', conquistas: ['Explorador Curioso'] },
    progressoDiario: getDailyDemo(),
    ranking: rankingDemo(),
    missoes: missoesDemo()
  };
}

function rankingDemo() {
  return [
    { posicao: 1, nome: 'Maria Eduarda', turma: '6º A', xp: 640 },
    { posicao: 2, nome: 'Arthur Souza', turma: '6º A', xp: 590 },
    { posicao: 3, nome: 'Gabriel Lima', turma: '6º A', xp: 520 },
    { posicao: 4, nome: 'Aluno Demonstrativo', turma: '6º A', xp: 480 },
    { posicao: 5, nome: 'Laura Mendes', turma: '6º A', xp: 430 }
  ];
}

function missoesDemo() {
  return LOCATIONS.map((local) => ({
    id: `demo-6ano-${local.id}`,
    localId: local.id,
    titulo: `Missão do 6º ano: ${local.nome}`,
    descricao: local.descricao,
    npc: local.npc,
    area: local.area,
    recompensa: { xpBase: 60, moedasBase: 30, medalha: local.medalha },
    perguntas: perguntasPorLocal(local.id)
  }));
}

function perguntasPorLocal(localId) {
  const banco = {
    laboratorio: [
      pergunta('lab1', 'Qual é o resultado de 248 + 376?', ['514', '624', '634', '714'], 1, 'Somando unidades, dezenas e centenas, obtemos 624.'),
      pergunta('lab2', 'Quanto é 3/4 de 20?', ['5', '10', '15', '18'], 2, 'Divida 20 em 4 partes iguais: cada parte vale 5. Três partes valem 15.'),
      pergunta('lab3', 'Um retângulo mede 8 cm de comprimento e 5 cm de largura. Qual é o perímetro?', ['13 cm', '26 cm', '40 cm', '80 cm'], 1, 'Perímetro é a soma dos quatro lados: 8 + 5 + 8 + 5 = 26 cm.'),
      pergunta('lab4', '2,5 litros correspondem a quantos mililitros?', ['25 mL', '250 mL', '2.500 mL', '25.000 mL'], 2, 'Cada litro tem 1.000 mL. Portanto, 2,5 L = 2.500 mL.'),
      pergunta('lab5', 'Qual número é divisível por 3?', ['124', '126', '128', '130'], 1, 'A soma dos algarismos de 126 é 1 + 2 + 6 = 9, que é divisível por 3.')
    ],
    biblioteca: [
      pergunta('bib1', 'Em um texto, o tema é:', ['O assunto principal tratado', 'A quantidade de parágrafos', 'A primeira palavra', 'O nome do leitor'], 0, 'O tema indica o assunto central desenvolvido pelo texto.'),
      pergunta('bib2', 'Qual palavra tem sentido semelhante a “rápido”?', ['Lento', 'Veloz', 'Pesado', 'Distante'], 1, '“Veloz” é sinônimo de “rápido”.'),
      pergunta('bib3', 'Em uma notícia, o título serve principalmente para:', ['Apresentar o assunto e chamar a atenção', 'Esconder o tema', 'Substituir todo o texto', 'Informar apenas a data'], 0, 'O título antecipa o tema e convida o leitor a conhecer a notícia.'),
      pergunta('bib4', 'Qual sinal encerra uma pergunta direta?', ['Vírgula', 'Ponto e vírgula', 'Ponto de interrogação', 'Dois-pontos'], 2, 'Perguntas diretas terminam com ponto de interrogação.'),
      pergunta('bib5', 'Para compreender uma palavra desconhecida no texto, uma boa estratégia é:', ['Observar o contexto da frase', 'Ignorar todo o parágrafo', 'Escolher qualquer significado', 'Ler apenas o título'], 0, 'As palavras próximas ajudam a descobrir o sentido pelo contexto.')
    ],
    zoologico: [
      pergunta('zoo1', 'Qual destes animais é vertebrado?', ['Minhoca', 'Borboleta', 'Peixe', 'Aranha'], 2, 'O peixe possui coluna vertebral, portanto é vertebrado.'),
      pergunta('zoo2', 'Em uma cadeia alimentar, as plantas são chamadas de:', ['Consumidores', 'Produtores', 'Decompositores', 'Predadores'], 1, 'As plantas produzem seu próprio alimento por fotossíntese.'),
      pergunta('zoo3', 'Qual característica é comum aos mamíferos?', ['Possuem penas', 'Amamentam os filhotes', 'Respiram somente na água', 'Não possuem coluna vertebral'], 1, 'Mamíferos produzem leite para alimentar os filhotes.'),
      pergunta('zoo4', 'O habitat de um animal é:', ['O lugar onde ele vive e encontra recursos', 'Apenas o alimento que ele come', 'O nome científico da espécie', 'Somente o local onde dorme'], 0, 'Habitat é o ambiente em que o ser vivo encontra condições para viver.'),
      pergunta('zoo5', 'Uma atitude que ajuda a proteger os animais silvestres é:', ['Preservar seus habitats', 'Comprar animais retirados da natureza', 'Jogar lixo nos rios', 'Destruir áreas de reprodução'], 0, 'A preservação dos habitats mantém alimento, abrigo e condições de reprodução.')
    ],
    prefeitura: [
      pergunta('cid1', 'Qual atitude demonstra cuidado com um espaço público?', ['Danificar bancos', 'Descartar lixo corretamente', 'Pichar paredes', 'Desperdiçar água'], 1, 'Cuidar do espaço coletivo é responsabilidade de todos.'),
      pergunta('cid2', 'Direitos e deveres ajudam a:', ['Organizar a convivência em sociedade', 'Eliminar responsabilidades', 'Impedir o diálogo', 'Favorecer apenas uma pessoa'], 0, 'Eles definem garantias e responsabilidades para uma convivência justa.'),
      pergunta('cid3', 'Em uma decisão coletiva, uma atitude democrática é:', ['Ouvir opiniões e respeitar a escolha do grupo', 'Impor uma ideia pela força', 'Excluir quem pensa diferente', 'Espalhar informações falsas'], 0, 'Participação democrática envolve escuta, respeito e decisão coletiva.'),
      pergunta('cid4', 'Quando surge um conflito na escola, o caminho mais adequado é:', ['Dialogar e buscar mediação', 'Responder com agressividade', 'Divulgar boatos', 'Aumentar a discussão'], 0, 'O diálogo e a mediação ajudam a encontrar soluções respeitosas.'),
      pergunta('cid5', 'Uma comunidade é formada por:', ['Pessoas que compartilham espaços e relações', 'Apenas prédios', 'Somente autoridades', 'Objetos sem uso coletivo'], 0, 'Comunidade envolve pessoas, relações, espaços e interesses comuns.')
    ],
    museu: [
      pergunta('mus1', 'Uma fonte histórica pode ser:', ['Uma carta antiga', 'Somente um livro atual', 'Apenas uma fotografia digital', 'Nenhum objeto'], 0, 'Cartas, objetos, imagens e relatos podem ajudar a estudar o passado.'),
      pergunta('mus2', 'Patrimônio cultural imaterial é um exemplo de:', ['Festa tradicional', 'Prédio histórico', 'Moeda antiga', 'Ponte de pedra'], 0, 'Saberes, festas, músicas e tradições podem ser patrimônios imateriais.'),
      pergunta('mus3', 'Organizar fatos em ordem cronológica significa:', ['Colocá-los na sequência em que aconteceram', 'Misturá-los sem data', 'Separá-los por tamanho', 'Escolher apenas o mais recente'], 0, 'A ordem cronológica acompanha a sequência do tempo.'),
      pergunta('mus4', 'O estudo da História ajuda a compreender:', ['Mudanças e permanências nas sociedades', 'Somente acontecimentos futuros', 'Apenas números', 'Somente fenômenos naturais'], 0, 'A História analisa ações humanas ao longo do tempo.'),
      pergunta('mus5', 'Preservar um documento histórico é importante porque ele:', ['Ajuda a manter a memória de uma sociedade', 'Ocupa espaço sem utilidade', 'Impede novas pesquisas', 'Serve apenas como decoração'], 0, 'Documentos guardam informações que ajudam a compreender outras épocas.')
    ],
    floresta: [
      pergunta('flo1', 'Os pontos cardeais são:', ['Norte, Sul, Leste e Oeste', 'Alto, baixo, perto e longe', 'Direita, esquerda, frente e fundo', 'Rio, serra, vale e planície'], 0, 'Norte, Sul, Leste e Oeste são referências principais de orientação.'),
      pergunta('flo2', 'Uma paisagem é formada por:', ['Elementos naturais e culturais percebidos no espaço', 'Somente árvores', 'Apenas prédios', 'Somente o clima'], 0, 'Paisagens podem reunir natureza e construções humanas.'),
      pergunta('flo3', 'Qual ação contribui para o uso sustentável da água?', ['Fechar a torneira ao escovar os dentes', 'Lavar calçadas com mangueira aberta', 'Jogar óleo na pia', 'Ignorar vazamentos'], 0, 'Evitar desperdício ajuda a conservar a água disponível.'),
      pergunta('flo4', 'Em um mapa, a legenda serve para:', ['Explicar símbolos e cores', 'Mostrar apenas o título', 'Indicar o preço do mapa', 'Substituir a escala'], 0, 'A legenda apresenta o significado dos símbolos usados na representação.'),
      pergunta('flo5', 'Desmatamento é:', ['Retirada da vegetação de uma área', 'Plantio de árvores', 'Proteção de nascentes', 'Reciclagem de materiais'], 0, 'Desmatamento é a remoção da cobertura vegetal.')
    ],
    praca: [
      pergunta('pra1', 'Uma turma tem 30 alunos. Se 18 estão presentes, quantos faltaram?', ['8', '10', '12', '14'], 2, '30 - 18 = 12 alunos ausentes.'),
      pergunta('pra2', 'Qual palavra completa corretamente: “Os estudantes _____ o desafio ontem.”', ['resolveu', 'resolveram', 'resolverá', 'resolvendo'], 1, 'O sujeito está no plural, por isso o verbo também fica no plural: resolveram.'),
      pergunta('pra3', 'Se o relógio marca 14h30, faltam quantos minutos para 15h?', ['15', '20', '30', '45'], 2, 'De 14h30 até 15h há 30 minutos.'),
      pergunta('pra4', 'Trabalho em equipe exige principalmente:', ['Cooperação e respeito', 'Isolamento', 'Competição desleal', 'Falta de diálogo'], 0, 'Cooperação e respeito permitem que o grupo alcance objetivos comuns.'),
      pergunta('pra5', 'Qual fração representa metade?', ['1/3', '1/4', '1/2', '2/3'], 2, 'Metade corresponde a uma de duas partes iguais: 1/2.')
    ],
    'escola-militar': [
      pergunta('esc1', 'Organizar uma rotina de estudos ajuda a:', ['Cumprir tarefas com responsabilidade', 'Evitar qualquer planejamento', 'Estudar apenas na véspera', 'Ignorar prazos'], 0, 'Uma rotina favorece planejamento, continuidade e responsabilidade.'),
      pergunta('esc2', 'Honestidade durante uma atividade significa:', ['Realizar o próprio trabalho e pedir ajuda quando necessário', 'Copiar respostas escondido', 'Alterar o resultado', 'Culpar outra pessoa'], 0, 'Ser honesto é agir com verdade e assumir responsabilidades.'),
      pergunta('esc3', 'Ao receber uma orientação, o estudante deve:', ['Ouvir, refletir e buscar melhorar', 'Interromper com agressividade', 'Ignorar todas as explicações', 'Abandonar a tarefa'], 0, 'Escuta e reflexão ajudam no desenvolvimento e na aprendizagem.'),
      pergunta('esc4', 'Pontualidade demonstra:', ['Respeito aos horários e compromissos', 'Falta de organização', 'Desinteresse', 'Ausência de responsabilidade'], 0, 'Cumprir horários é uma forma de respeitar o coletivo.'),
      pergunta('esc5', 'Uma atitude de liderança positiva é:', ['Incentivar e ajudar o grupo', 'Humilhar quem erra', 'Decidir tudo sozinho', 'Esconder informações'], 0, 'Liderança positiva orienta, apoia e valoriza a participação do grupo.')
    ]
  };

  return banco[localId] || banco.praca;
}

function pergunta(id, enunciado, alternativas, correta, explicacao) {
  return { id, enunciado, alternativas, correta, explicacao };
}
