export const GAME_CONFIG = {
  title: 'Colégio Virtual Axoriin',
  subtitle: 'Arena do Conhecimento',
  version: '0.5.46.3_local_contextual',
  portalUrl: window.AXORIIN_ARENA?.portalUrl || './painel-aluno.html',
  apiBase: window.AXORIIN_ARENA?.apiBase || '/api/aluno/jogo',
  dailyLimit: Number(window.AXORIIN_ARENA?.dailyLimit || 10),
  colors: {
    navy: 0x071529,
    navy2: 0x0b1f3a,
    panel: 0x10233f,
    panel2: 0x0d2746,
    blue: 0x1f6fb5,
    blueLight: 0x64b5ff,
    gold: 0xd6a84f,
    goldLight: 0xf3d58a,
    white: 0xffffff,
    muted: 0xa9bdd4,
    green: 0x48c78e,
    greenDark: 0x2e8f68,
    red: 0xff6b6b,
    stone: 0xcbbf9a,
    grass: 0x3f9b62,
    water: 0x1d83b7,
    purple: 0x7c5cff,
    cyan: 0x42c7d9,
    orange: 0xf09a45
  },
  viewport: { width: 1280, height: 720 },
  world: { width: 3600, height: 2600 },
  camera: { zoom: 0.94, lerpX: 0.085, lerpY: 0.085, deadzoneWidth: 210, deadzoneHeight: 145 },
  playerStart: { x: 1930, y: 1280 }
};

export const AVATARS = [
  { id: 'cadete-azul', nome: 'Cadete Azul', pele: 0xf3c7a5, cabelo: 0x6b3f22, uniforme: 0x1f6fb5, detalhe: 0xf3d58a },
  { id: 'exploradora', nome: 'Exploradora', pele: 0xf0bf9b, cabelo: 0x5a2f1f, uniforme: 0x1f355f, detalhe: 0xf3d58a }
];

export const LOCATIONS = [
  {
    id: 'zoologico', nome: 'Zoológico', icon: '🦁', area: 'Ciências, Fauna e Meio Ambiente',
    x: 900, y: 500, entryX: 900, entryY: 560, radius: 124, color: 0x48c78e, npc: 'Biólogo Theo',
    descricao: 'Animais, habitats, cadeias alimentares e preservação.',
    medalha: 'Explorador da Natureza', district: 'Parque Leste'
  },
  {
    id: 'prefeitura', nome: 'Prefeitura', icon: '🏛', area: 'História, Geografia e Cidadania',
    x: 1815, y: 500, entryX: 1815, entryY: 558, radius: 122, color: 0xd6a84f, npc: 'Guia Caio',
    descricao: 'História local, orientação, direitos, deveres e participação social.',
    medalha: 'Cidadão Guardião', district: 'Centro Cívico'
  },
  {
    id: 'museu', nome: 'Museu', icon: '🏺', area: 'História, Arte e Patrimônio',
    x: 3060, y: 520, entryX: 3060, entryY: 572, radius: 122, color: 0xb18cff, npc: 'Curadora Maya',
    descricao: 'Tempo histórico, arte, memória, patrimônio e culturas.',
    medalha: 'Guardião da Memória', district: 'Centro Histórico'
  },
  {
    id: 'biblioteca', nome: 'Biblioteca', icon: '📚', area: 'Linguagens',
    x: 1150, y: 1218, entryX: 1150, entryY: 1270, radius: 122, color: 0x2f6fb5, npc: 'Bibliotecária Lia',
    descricao: 'Língua Portuguesa, Espanhol, Inglês, leitura e interpretação.',
    medalha: 'Leitor Ávido', district: 'Bairro Cultural'
  },
  {
    id: 'praca', nome: 'Praça Central', icon: '⭐', area: 'Desafios mistos e convivência',
    x: 1800, y: 1085, entryX: 1800, entryY: 1085, radius: 140, color: 0xf3d58a, npc: 'Conselheira Helena',
    descricao: 'Desafios rápidos, convivência, cidadania e eventos especiais.',
    medalha: 'Explorador Curioso', district: 'Centro'
  },
  {
    id: 'escola-militar', nome: 'Escola Militar', icon: '🛡', area: 'Valores e Formação',
    x: 1885, y: 1785, entryX: 1885, entryY: 1838, radius: 132, color: 0x1f6fb5, npc: 'Professor Guardião',
    descricao: 'Honra, disciplina, responsabilidade e orientação da jornada.',
    medalha: 'Guardião Axoriin', district: 'Campus Sul'
  },
  {
    id: 'laboratorio', nome: 'Laboratório', icon: '🔬', area: 'Matemática e Ciências — 6º ano',
    x: 650, y: 2106, entryX: 650, entryY: 2068, radius: 126, color: 0x42c7d9, npc: 'Professora Ada',
    descricao: 'Operações, frações, medidas, geometria, experimentos e resolução de problemas.',
    medalha: 'Mente Científica', district: 'Campus Sul'
  },
  {
    id: 'floresta', nome: 'Floresta', icon: '🌳', area: 'Ciências, Geografia e Sustentabilidade',
    x: 2855, y: 1110, entryX: 2855, entryY: 1116, radius: 136, color: 0x2e8f68, npc: 'Guardiã Íris',
    descricao: 'Paisagens, recursos naturais, ecossistemas e sustentabilidade.',
    medalha: 'Protetor da Floresta', district: 'Reserva Leste'
  }
];

export const DISTRICTS = [
  { id: 'parque-leste', nome: 'Parque Leste', x: 610, y: 330, width: 520, height: 520, color: 0x48c78e },
  { id: 'centro-civico', nome: 'Centro Cívico', x: 1600, y: 300, width: 560, height: 560, color: 0xd6a84f },
  { id: 'historico', nome: 'Centro Histórico', x: 2600, y: 330, width: 600, height: 560, color: 0xb18cff },
  { id: 'bairrocultural', nome: 'Bairro Cultural', x: 820, y: 1050, width: 520, height: 520, color: 0x7c5cff },
  { id: 'centro', nome: 'Centro da Cidade', x: 1660, y: 920, width: 560, height: 520, color: 0xf3d58a },
  { id: 'campus', nome: 'Campus Sul', x: 1700, y: 1700, width: 660, height: 650, color: 0x1f6fb5 },
  { id: 'laboratorio-sul', nome: 'Campus Científico', x: 430, y: 1840, width: 520, height: 520, color: 0x42c7d9 },
  { id: 'reserva', nome: 'Reserva Leste', x: 2620, y: 1680, width: 640, height: 650, color: 0x2e8f68 }
];

export const UI = {
  font: 'Nunito, Inter, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif',
  title: { fontFamily: 'Nunito, system-ui, sans-serif', fontSize: '44px', fontStyle: '900', color: '#ffffff' },
  small: { fontFamily: 'Nunito, system-ui, sans-serif', fontSize: '16px', color: '#a9bdd4' }
};
