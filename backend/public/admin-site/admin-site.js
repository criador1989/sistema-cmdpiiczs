'use strict';

/* =========================
   AUTH
   ========================= */

const CMS_TOKEN = localStorage.getItem('site_cms_token');

if (
  CMS_TOKEN === 'null' ||
  CMS_TOKEN === 'undefined'
) {
  localStorage.removeItem('site_cms_token');
  window.location.href = '/admin-site/login.html';
}

if (!CMS_TOKEN) {
  window.location.href = '/admin-site/login.html';
}

/* =========================
   API
   ========================= */

const API_PUBLICA = '/api/site-publico';
const API_ADMIN = '/api/site-admin';

/* =========================
   ELEMENTOS GERAIS
   ========================= */

const pageTitle = document.getElementById('page-title');
const pageSubtitle = document.getElementById('page-subtitle');
const toast = document.getElementById('toast');

const previewFrame = document.getElementById('preview-frame');
const viewDesktop = document.getElementById('view-desktop');
const viewMobile = document.getElementById('view-mobile');

let blocoAtivoId = 'home-banner';

let cmsUploadTarget = null;

const noticiasHomePadrao = [
  {
    titulo: 'Formatura da Turma 2026',
    categoria: 'Evento',
    data: '2026-12-10',
    autor: 'Comunicação CMDPII',
    resumo: 'Acompanhe os principais momentos da solenidade de formatura dos alunos do Colégio Militar.',
    imagem: '',
    link: './noticias.html',
    destaque: true
  },
  {
    titulo: 'Resultado do Processo Seletivo',
    categoria: 'Processo Seletivo',
    data: '2026-01-20',
    autor: 'Secretaria Escolar',
    resumo: 'Confira as informações oficiais sobre o processo seletivo e orientações para os responsáveis.',
    imagem: '',
    link: './processo-seletivo.html',
    destaque: false
  },
  {
    titulo: 'Projetos Pedagógicos em Destaque',
    categoria: 'Pedagógico',
    data: '2026-05-20',
    autor: 'Coordenação Pedagógica',
    resumo: 'Conheça ações, projetos e atividades desenvolvidas com os estudantes ao longo do bimestre.',
    imagem: '',
    link: './noticias.html',
    destaque: false
  }
];

/* =========================
   CONFIGURAÇÕES DE SEÇÕES
   ========================= */

const sectionTitles = {
  painel: ['Painel do Site Institucional', 'Resumo geral do portal e atalhos de gestão.'],
  editor: ['Construtor de Página', 'Edite blocos, imagens, textos, links e visualize tudo em tempo real.'],
  midias: ['Biblioteca de Mídias', 'Gerencie imagens, vídeos, documentos e arquivos do site.'],
  noticias: ['Notícias', 'Cadastre comunicados, avisos e destaques institucionais.'],
  patrocinadores: ['Patrocinadores e Links', 'Crie banners clicáveis para parceiros, formulários e campanhas.'],
  visitas: ['Estatísticas de Visitas', 'Acompanhe acessos e movimentação do site.'],
  config: ['Configurações Gerais', 'Edite as informações institucionais principais.'],
  identidade: ['Identidade Visual', 'Configure logos, brasões, cores, header, rodapé e elementos institucionais.']
};

const previewUrls = {
  painel: '/site-cmdpii/index.html',
  editor: '/site-cmdpii/index.html',
  midias: '/site-cmdpii/galeria.html',
  noticias: '/site-cmdpii/noticias.html',
  patrocinadores: '/site-cmdpii/index.html',
  visitas: '/site-cmdpii/index.html',
  config: '/site-cmdpii/contato.html',
  identidade: '/site-cmdpii/index.html'
};

const pagePreviewMap = {
  home: '/site-cmdpii/index.html',
  historia: '/site-cmdpii/historia.html',
  direcao: '/site-cmdpii/direcao.html',
  'corpo-alunos': '/site-cmdpii/corpo-alunos.html',
  'processo-seletivo': '/site-cmdpii/processo-seletivo.html',
  noticias: '/site-cmdpii/noticias.html',
  galeria: '/site-cmdpii/galeria.html',
  contato: '/site-cmdpii/contato.html',
  professores: '/site-cmdpii/professores.html'
};

/* =========================
   BLOCOS POR PÁGINA
   ========================= */

const pageBlocksMap = {
  home: [
  { id: 'home-banner', nome: 'Banner Principal', tipo: 'Hero institucional' },
  { id: 'home-menu', nome: 'Menu Rápido', tipo: 'Atalhos' },
  { id: 'home-patrocinadores', nome: 'Parceiros', tipo: 'Banners' },
  { id: 'home-noticias', nome: 'Notícias em Destaque', tipo: 'Cards' },
  { id: 'home-associacao', nome: 'Associação de Pais', tipo: 'Card institucional' },
  { id: 'home-estatisticas', nome: 'Estatísticas', tipo: 'Contadores' },
  { id: 'home-documentos', nome: 'Documentos e Informações', tipo: 'Cards' },
  { id: 'home-galeria', nome: 'Galeria de Fotos', tipo: 'Imagens' },
  { id: 'home-video', nome: 'Vídeo Institucional', tipo: 'Vídeo' }
],

  historia: [
    { id: 'historia-banner', nome: 'Banner da História', tipo: 'Hero da página' },
    { id: 'historia-texto', nome: 'Texto Nossa História', tipo: 'Texto institucional' },
    { id: 'historia-menu', nome: 'Menu Lateral', tipo: 'Links internos' },
    { id: 'historia-linha', nome: 'Linha do Tempo', tipo: 'Cards históricos' },
    { id: 'historia-video', nome: 'Vídeo Institucional', tipo: 'Chamada' }
  ],

  direcao: [
    { id: 'direcao-banner', nome: 'Banner da Direção', tipo: 'Hero da página' },
    { id: 'direcao-intro', nome: 'Introdução', tipo: 'Texto' },
    { id: 'direcao-equipe', nome: 'Equipe Gestora', tipo: 'Cards de pessoas' },
    { id: 'direcao-chamada', nome: 'Chamada Final', tipo: 'CTA' }
  ],

  'corpo-alunos': [
    { id: 'alunos-banner', nome: 'Banner Corpo de Alunos', tipo: 'Hero da página' },
    { id: 'alunos-intro', nome: 'Formação Integral', tipo: 'Texto' },
    { id: 'alunos-destaque', nome: 'Destaque Institucional', tipo: 'Texto + imagem' },
    { id: 'alunos-numeros', nome: 'Números Institucionais', tipo: 'Contadores' },
    { id: 'alunos-projetos', nome: 'Projetos', tipo: 'Cards' },
    { id: 'alunos-chamada', nome: 'Chamada Final', tipo: 'CTA' }
  ],

  'processo-seletivo': [
    { id: 'processo-banner', nome: 'Banner Processo Seletivo', tipo: 'Hero' },
    { id: 'processo-etapas', nome: 'Etapas do Processo', tipo: 'Cards' },
    { id: 'processo-cronograma', nome: 'Cronograma', tipo: 'Tabela' },
    { id: 'processo-certames', nome: 'Certames / Processos', tipo: 'Certames' },
    { id: 'processo-editais', nome: 'Editais Anteriores', tipo: 'Documentos' },
    { id: 'processo-chamada', nome: 'Chamada de Inscrição', tipo: 'CTA' }
  ],

  noticias: [
    { id: 'noticias-banner', nome: 'Banner Notícias', tipo: 'Hero da página' },
    { id: 'noticias-lista', nome: 'Lista de Notícias', tipo: 'Cards' },
    { id: 'noticias-categorias', nome: 'Categorias', tipo: 'Sidebar' },
    { id: 'noticias-recentes', nome: 'Notícias Recentes', tipo: 'Sidebar' },
    { id: 'noticias-suporte', nome: 'Suporte', tipo: 'CTA' }
  ],

  galeria: [
    { id: 'galeria-banner', nome: 'Banner Galeria', tipo: 'Hero da página' },
    { id: 'galeria-filtros', nome: 'Filtros da Galeria', tipo: 'Botões' },
    { id: 'galeria-grid', nome: 'Grid de Imagens', tipo: 'Imagens' },
    { id: 'galeria-video', nome: 'Vídeo Institucional', tipo: 'Vídeo' }
  ],

  contato: [
    { id: 'contato-banner', nome: 'Banner Contato', tipo: 'Hero da página' },
    { id: 'contato-info', nome: 'Informações de Contato', tipo: 'Cards' },
    { id: 'contato-form', nome: 'Formulário', tipo: 'Formulário' },
    { id: 'contato-mapa', nome: 'Localização', tipo: 'Mapa' }
  ],

  professores: [
  { id: 'professores-banner', nome: 'Banner Professores', tipo: 'Hero da página' },
  { id: 'professores-lista', nome: 'Lista de Professores', tipo: 'Cards de professores' },
  { id: 'professores-materiais', nome: 'Materiais dos Professores', tipo: 'Arquivos e links' }
]
};

/* =========================
   UTILITÁRIOS
   ========================= */

function showToast(msg) {
  if (!toast) return;

  toast.textContent = msg;
  toast.classList.add('show');

  setTimeout(() => {
    toast.classList.remove('show');
  }, 2400);
}

function getPreviewDoc() {
  const iframe = document.getElementById('live-preview');
  return iframe?.contentDocument || iframe?.contentWindow?.document || null;
}

function getInput(id) {
  return document.getElementById(id);
}

/* =========================
   SEÇÕES / SIDEBAR
   ========================= */

function abrirSecao(secao) {
  document.querySelectorAll('.side-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.section === secao);
  });

  document.querySelectorAll('.admin-section').forEach(section => {
    section.classList.toggle('active', section.id === `section-${secao}`);
  });

  const info = sectionTitles[secao] || sectionTitles.painel;

  if (pageTitle) pageTitle.textContent = info[0];
  if (pageSubtitle) pageSubtitle.textContent = info[1];

  if (secao === 'editor') {
  if (builderPageSelect) {
    builderPageSelect.value = 'home';
  }

  setTimeout(() => {
    renderizarBlocosDaPagina('home');
  }, 150);
}

if (secao === 'midias') carregarMidias();
if (secao === 'noticias') carregarNoticiasCms();
if (secao === 'visitas') carregarConfig();
  

  const iframe = document.getElementById('live-preview');

  if (iframe && previewUrls[secao]) {
    iframe.src = previewUrls[secao];
  }
  setTimeout(() => {
  aplicarLayoutGlobalNaPreview();
}, 500);
}

document.querySelectorAll('.side-btn').forEach(btn => {
  btn.addEventListener('click', () => abrirSecao(btn.dataset.section));
});

/* =========================
   SELETOR DE PÁGINAS
   ========================= */

const builderPageSelect = document.getElementById('builder-page-select');

builderPageSelect?.addEventListener('change', () => {
  const iframe = document.getElementById('live-preview');
  const slug = builderPageSelect.value;
  const url = pagePreviewMap[slug] || pagePreviewMap.home;

  if (iframe) iframe.src = url;

  renderizarBlocosDaPagina(slug);

  showToast('Página carregada na prévia.');
});

/* =========================
   RENDERIZAR BLOCOS
   ========================= */

async function carregarBlocosDaPaginaMongo(slug) {
  try {
    const headers = {
      Authorization: `Bearer ${localStorage.getItem('site_cms_token')}`
    };

    const paginasRes = await fetch(`${API_ADMIN}/paginas`, {
      headers
    });

    const paginasData = await paginasRes.json();

    if (!paginasData.ok || !Array.isArray(paginasData.paginas)) {
      return null;
    }

    const pagina = paginasData.paginas.find(item => item.slug === slug);

    if (!pagina) return null;

    const blocosRes = await fetch(
      `${API_ADMIN}/paginas/${pagina._id}/blocos`,
      { headers }
    );

    const blocosData = await blocosRes.json();

    if (!blocosData.ok || !Array.isArray(blocosData.blocos)) {
      return null;
    }

    if (!blocosData.blocos.length) return null;

    const vistos = new Set();

return blocosData.blocos
  .filter(bloco => {
    const id = bloco.configuracao?.cmsBlockId || bloco._id;

    if (vistos.has(id)) {
      return false;
    }

    vistos.add(id);

    return true;
  })
  .sort((a, b) => Number(a.ordem || 0) - Number(b.ordem || 0))
  .map(bloco => ({
        id: bloco.configuracao?.cmsBlockId || bloco._id,
        nome: bloco.titulo || 'Bloco',
        tipo: bloco.configuracao?.cmsTipo || bloco.subtitulo || bloco.tipo || 'Bloco',
        ativo: bloco.ativo !== false,
        mongoId: bloco._id,
        paginaId: pagina._id,
        mongo: bloco
      }));

  } catch (err) {
    console.error('Erro ao carregar blocos do Mongo:', err);
    return null;
  }
}

async function renderizarBlocosDaPagina(slug) {
  const container = document.getElementById('builder-blocks');
  if (!container) return;

  container.innerHTML = `
    <div class="empty-state">
      Carregando blocos...
    </div>
  `;

  const blocosMongo = await carregarBlocosDaPaginaMongo(slug);

  const blocosPadrao = pageBlocksMap[slug] || pageBlocksMap.home;

let blocos = [];

if (blocosMongo && blocosMongo.length) {
  const idsMongo = new Set(blocosMongo.map(b => b.id));

  const novosBlocosPadrao = blocosPadrao.filter(b =>
    !idsMongo.has(b.id)
  );

  blocos = [
    ...blocosMongo,
    ...novosBlocosPadrao
  ];
} else {
  blocos = blocosPadrao;
}

pageBlocksMap[slug] = blocos;

  container.innerHTML = blocos.map((bloco, index) => `
    <article
      class="builder-block ${index === 0 ? 'active' : ''} ${bloco.ativo === false ? 'is-hidden' : ''}"
      data-block-id="${bloco.id}"
    >
      <div>
        <strong>${bloco.nome}</strong>
        <small>${bloco.tipo}</small>
      </div>

      <div class="block-actions-mini">
        <button type="button" title="Editar">⚙</button>
        <button type="button" title="Mover para cima">↑</button>
        <button type="button" title="Mover para baixo">↓</button>
        <button type="button" title="Mostrar/Ocultar">👁</button>
        <button type="button" title="Excluir">🗑</button>
      </div>
    </article>
  `).join('');

  ativarCliqueNosBlocos();
  ligarAcoesDosBlocos();

  const primeiro = blocos.find(b => b.ativo !== false) || blocos[0];

  if (primeiro) {
    carregarDadosDoBloco(primeiro.id, primeiro.nome);
  }
}

function ativarCliqueNosBlocos() {
  document.querySelectorAll('.builder-block').forEach(block => {
    block.addEventListener('click', () => {
      document.querySelectorAll('.builder-block').forEach(b => b.classList.remove('active'));
      block.classList.add('active');

      const id = block.dataset.blockId;
      const nome = block.querySelector('strong')?.textContent || 'Bloco';

      carregarDadosDoBloco(id, nome);
    });
  });
}

function getBlocoCmsAtual(blocoId) {
  const slug = builderPageSelect?.value || 'home';
  const blocos = pageBlocksMap[slug] || [];

  return blocos.find(b => b.id === blocoId) || null;
}

function setCampoCms(id, valor) {
  const el = document.getElementById(id);
  if (!el) return;

  if (el.type === 'checkbox') {
    el.checked = !!valor;
    return;
  }

  el.value = valor ?? '';
}

function hidratarCamposDoBlocoMongo(blocoId) {
  const bloco = getBlocoCmsAtual(blocoId);

  if (!bloco || !bloco.mongo) return;

  const mongo = bloco.mongo;
  const config = mongo.configuracao || {};
  const link = mongo.link || {};

  // Genérico: banners, textos, CTAs
  setCampoCms('hero-title', mongo.titulo || '');
  setCampoCms('hero-text', mongo.texto || '');
  setCampoCms('image-url', mongo.imagemUrl || '');
  setCampoCms('button-text', link.texto || '');
  setCampoCms('button-link', link.url || '');

  // Blocos dinâmicos
  setCampoCms('dynamic-title', mongo.titulo || '');
  setCampoCms('dynamic-text', mongo.texto || '');
  setCampoCms('dynamic-image', mongo.imagemUrl || '');
  setCampoCms('dynamic-video', mongo.videoUrl || '');
  setCampoCms('dynamic-file', mongo.arquivoUrl || '');
  setCampoCms('dynamic-button-text', link.texto || '');
  setCampoCms('dynamic-button-link', link.url || '');

  // Home - Notícias
  if (blocoId === 'home-noticias') {
    setCampoCms('news-section-title', mongo.titulo || '');
    setCampoCms('news-section-subtitle', mongo.texto || '');
    setCampoCms('home-news-limit', config.limite ?? 4);
    setCampoCms('home-news-category-filter', config.categoria || '');
    setCampoCms('home-news-only-published', config.somentePublicadas ?? true);
    setCampoCms('home-news-featured-first', config.destaquesPrimeiro ?? true);
    setCampoCms('home-news-all-text', config.textoLinkGeral || 'VER TODAS AS NOTÍCIAS →');
    setCampoCms('home-news-button-text', config.textoBotao || 'Leia mais →');
  }

  // Home - Patrocinadores
  if (blocoId === 'home-patrocinadores') {
    setCampoCms('home-sponsor-section-title', mongo.titulo || '');
    setCampoCms('home-sponsor-section-text', mongo.texto || '');
    setCampoCms('home-sponsor-limit', config.limite ?? 6);
    setCampoCms('home-sponsor-type-filter', config.tipo || '');
    setCampoCms('home-sponsor-only-active', config.somenteAtivos ?? true);
    setCampoCms('home-sponsor-featured-first', config.destaquesPrimeiro ?? true);
    setCampoCms('home-sponsor-layout', config.layout || 'grid');
  }

  // Home - Galeria
  if (blocoId === 'home-galeria') {
    setCampoCms('gallery-section-title', mongo.titulo || '');
    setCampoCms('gallery-section-subtitle', mongo.texto || '');
    setCampoCms('gallery-link-text', link.texto || '');
    setCampoCms('gallery-link-url', link.url || '');

    if (Array.isArray(mongo.itens)) {
      mongo.itens.forEach((item, index) => {
        const n = index + 1;
        setCampoCms(`gallery-image-${n}`, item.imagem || '');
        setCampoCms(`gallery-alt-${n}`, item.alt || '');
      });
    }
  }

  // Home - Menu Rápido
  if (blocoId === 'home-menu' && Array.isArray(mongo.itens)) {
    mongo.itens.forEach((item, index) => {
      const n = index + 1;
      setCampoCms(`home-menu-icon-${n}`, item.icon || '🔗');
      setCampoCms(`home-menu-${n}`, item.texto || '');
      setCampoCms(`home-menu-link-${n}`, item.link || '#');
      setCampoCms(`home-menu-featured-${n}`, !!item.destaque);
    });
  }

  // Home - Vídeo
  if (blocoId === 'home-video') {
  setCampoCms('video-section-title', mongo.titulo || '');
  setCampoCms('video-section-text', mongo.texto || '');
  setCampoCms('video-cover-image', mongo.imagemUrl || '');
  setCampoCms('video-link', mongo.videoUrl || link.url || '');
  setCampoCms('video-button-text', link.texto || 'Assistir vídeo');
}

if (blocoId === 'professores-banner') {
  setCampoCms('professores-banner-titulo', mongo.titulo || '');
  setCampoCms('professores-banner-texto', mongo.texto || '');
  setCampoCms('professores-banner-imagem', mongo.imagemUrl || '');
}

if (blocoId === 'professores-lista') {
  // Depois vamos hidratar aqui os cards dos professores
  // quando criarmos coletarProfessoresLista() e montarItemProfessor().
}


if (blocoId === 'professores-materiais') {
  setCampoCms('professores-materiais-titulo', mongo.titulo || '');
  setCampoCms('professores-materiais-texto', mongo.texto || '');
}

}

/* =========================
   CAMPOS DO BLOCO
   ========================= */

function carregarDadosDoBloco(id, nome) {
  blocoAtivoId = id;

  const props = document.querySelector('.builder-properties');
  if (!props) return;

  props.innerHTML = montarCamposDoBloco(id, nome);

  hidratarCamposDoBlocoMongo(id);

  ligarEventosCamposDinamicos();

  atualizarPreview();
}

function montarItemProjetoAlunos(n, item = {}) {
  return `
    <div class="student-project-editor" data-student-project-index="${n}">
      <div class="news-editor-top">
        <strong>Projeto ${n}</strong>

        <div class="quick-item-controls">
          <button type="button" class="btn-student-project-up">↑</button>
          <button type="button" class="btn-student-project-down">↓</button>
        </div>
      </div>

      <label>Ícone</label>
      <input id="student-project-icon-${n}" value="${item.icon || '📚'}">

      <label>Título</label>
      <input id="student-project-title-${n}" value="${item.titulo || 'Projeto'}">

      <label>Descrição</label>
      <textarea id="student-project-text-${n}">${item.texto || ''}</textarea>

      <button class="btn ghost btn-remove-student-project" type="button">
        Remover projeto
      </button>
    </div>
  `;
}

function montarCamposAlunosProjetos(nome) {
  const blocoAtual =
    pageBlocksMap?.alunos?.find(b => b.id === 'alunos-projetos');

  const mongo = blocoAtual?.mongo || {};

  const itensSalvos =
    Array.isArray(mongo.itens)
      ? mongo.itens
      : [];

  const projetos = itensSalvos.length
    ? itensSalvos.map(item => ({
        icon: item.icon || item.icone || '📚',
        titulo: item.titulo || item.nome || '',
        texto: item.texto || item.descricao || ''
      }))
    : [
        {
          icon: '📚',
          titulo: 'Projeto ENEM',
          texto: 'Preparação focada em desempenho acadêmico e desenvolvimento educacional.'
        }
      ];

  return `
    <div class="properties-head">
      <h2>Projetos e Desenvolvimento</h2>
      <span>${nome}</span>
    </div>

    <label>Título da seção</label>
    <input
      id="student-projects-section-title"
      value="${mongo.titulo || 'Projetos e Desenvolvimento'}"
    >

    <div id="student-projects-fields">
      ${projetos.map((item, index) =>
        montarItemProjetoAlunos(index + 1, item)
      ).join('')}
    </div>

    <button class="btn ghost full" id="btn-add-student-project" type="button">
      + Adicionar projeto
    </button>

    <div class="builder-actions">
      <button class="btn ghost" type="button" data-action="duplicate">Duplicar bloco</button>
      <button class="btn primary" type="button" data-action="save">Salvar bloco</button>
    </div>
  `;
}

function coletarProjetosAlunos() {
  const campos = [...document.querySelectorAll('.student-project-editor')];

  return campos.map((box, index) => {
    const i = box.dataset.studentProjectIndex;

    return {
      ordem: index,
      icon: getInput(`student-project-icon-${i}`)?.value || '📚',
      titulo: getInput(`student-project-title-${i}`)?.value || '',
      texto: getInput(`student-project-text-${i}`)?.value || ''
    };
  }).filter(item => item.titulo.trim());
}

function adicionarProjetoAlunos() {
  const container = document.getElementById('student-projects-fields');
  if (!container) return;

  const novo = Date.now();
  const wrap = document.createElement('div');

  wrap.innerHTML = montarItemProjetoAlunos(novo, {
    icon: '✨',
    titulo: 'Novo projeto',
    texto: 'Descrição do novo projeto desenvolvido com os estudantes.'
  });

  container.appendChild(wrap.firstElementChild);

  ligarEventosCamposDinamicos();
  atualizarPreview();

  showToast('Projeto adicionado.');
}

function atualizarAlunosProjetosNaPreview() {
  const doc = getPreviewDoc();
  if (!doc) return;

  const section =
    doc.querySelector('.project-grid')?.closest('.section');

  const grid =
    doc.querySelector('.project-grid');

  if (!section || !grid) return;

  section.setAttribute('data-cms-block-id', 'alunos-projetos');

  const h2 =
    section.querySelector('.section-head h2') ||
    section.querySelector('h2');

  if (h2) {
    h2.textContent =
      getInput('student-projects-section-title')?.value ||
      'Projetos e Desenvolvimento';
  }

  const projetos =
    coletarProjetosAlunos();

  grid.innerHTML = projetos.map(item => `
    <article class="project-card">
      <div class="project-icon">${item.icon}</div>
      <h3>${item.titulo}</h3>
      <p>${item.texto}</p>
    </article>
  `).join('');
}

function montarCamposBlocoDinamico(id, nome) {

  const blocoAtual = getBlocoCmsAtual(id);
  const mongo = blocoAtual?.mongo || {};
  const link = mongo.link || {};
  const config = mongo.configuracao || {};

  return `
    <div class="properties-head">
      <h2>${nome}</h2>
      <span>Bloco dinâmico</span>
    </div>

    <label>Título</label>
    <input
      id="dynamic-title"
      value="${mongo.titulo || nome}"
    >

    <label>Texto / descrição</label>
    <textarea id="dynamic-text">${mongo.texto || 'Edite aqui o conteúdo deste bloco.'}</textarea>

    <label>Texto do botão</label>
<input
  id="dynamic-button-text"
  value="${link.texto || 'Saiba mais'}"
>

<label>Link</label>
<input
  id="dynamic-button-link"
  value="${link.url || '#'}"
>

<label>Imagem / capa</label>

<div class="upload-field">

  <input
    id="dynamic-image"
    value="${mongo.imagemUrl || ''}"
    placeholder="/uploads/site/imagem.png"
  >

  <button
    class="btn upload btn-upload-dynamic-image"
    type="button"
    data-target="dynamic-image"
  >
    Enviar
  </button>

  <button
    class="btn ghost btn-open-media-picker"
    type="button"
    data-target="dynamic-image"
  >
    Biblioteca
  </button>

</div>

    <div class="cms-field-row">
      <div>
        <label>Largura</label>
        <select id="dynamic-width">
          <option value="container" ${config.width === 'container' ? 'selected' : ''}>Container</option>
          <option value="small" ${config.width === 'small' ? 'selected' : ''}>Pequena</option>
          <option value="medium" ${config.width === 'medium' ? 'selected' : ''}>Média</option>
          <option value="large" ${config.width === 'large' ? 'selected' : ''}>Larga</option>
          <option value="full" ${config.width === 'full' ? 'selected' : ''}>Full hero</option>
        </select>
      </div>

      <div>
        <label>Alinhamento</label>
        <select id="dynamic-align">
          <option value="center" ${config.align === 'center' ? 'selected' : ''}>Centro</option>
          <option value="left" ${config.align === 'left' ? 'selected' : ''}>Esquerda</option>
          <option value="right" ${config.align === 'right' ? 'selected' : ''}>Direita</option>
          <option value="full" ${config.align === 'full' ? 'selected' : ''}>Largura total</option>
        </select>
      </div>
    </div>

    <div class="cms-field-row">
      <div>
        <label>Layout</label>
        <select id="dynamic-layout">
          <option value="section" ${config.layout === 'section' ? 'selected' : ''}>Dentro de seção</option>
          <option value="isolated" ${config.layout === 'isolated' ? 'selected' : ''}>Bloco isolado</option>
          <option value="cta" ${config.layout === 'cta' ? 'selected' : ''}>CTA central</option>
        </select>
      </div>

      <div>
        <label>Espaçamento</label>
        <select id="dynamic-spacing">
          <option value="comfortable" ${config.spacing === 'comfortable' ? 'selected' : ''}>Confortável</option>
          <option value="compact" ${config.spacing === 'compact' ? 'selected' : ''}>Compacto</option>
          <option value="wide" ${config.spacing === 'wide' ? 'selected' : ''}>Amplo</option>
        </select>
      </div>
    </div>

    <div class="cms-field-row">
      <label>
        <input
          type="checkbox"
          id="dynamic-hide-mobile"
          ${config.hideMobile ? 'checked' : ''}
        >
        Ocultar no mobile
      </label>

      <label>
        <input
          type="checkbox"
          id="dynamic-hide-desktop"
          ${config.hideDesktop ? 'checked' : ''}
        >
        Ocultar no desktop
      </label>
    </div>

    <div class="builder-actions">
      <button class="btn ghost" type="button" data-action="duplicate">
        Duplicar bloco
      </button>

      <button class="btn primary" type="button" data-action="save">
        Salvar bloco
      </button>
    </div>
  `;
}

function montarItemNoticiaHome(n, noticia = {}) {
  return `
    <div class="news-item-editor" data-news-index="${n}">
      <div class="news-editor-top">
        <strong>Notícia ${n}</strong>

        <div class="quick-item-controls">
          <button type="button" class="btn-news-up">↑</button>
          <button type="button" class="btn-news-down">↓</button>

          <label style="display:flex;align-items:center;gap:6px;">
            <input type="checkbox" id="news-featured-${n}" ${noticia.destaque ? 'checked' : ''}>
            Destaque
          </label>
        </div>
      </div>

      <label>Título</label>
      <input id="news-title-${n}" value="${noticia.titulo || ''}" placeholder="Título da notícia">

      <div class="cms-field-row">
        <div>
          <label>Categoria</label>
          <input id="news-category-${n}" value="${noticia.categoria || ''}" placeholder="Ex: Evento">
        </div>

        <div>
          <label>Data</label>
          <input id="news-date-${n}" type="date" value="${noticia.data || ''}">
        </div>
      </div>

      <label>Autor / setor</label>
      <input id="news-author-${n}" value="${noticia.autor || ''}" placeholder="Ex: Coordenação Pedagógica">

      <label>Resumo</label>
      <textarea id="news-summary-${n}" placeholder="Resumo curto da notícia">${noticia.resumo || ''}</textarea>

      <label>Imagem</label>

<div class="upload-field">
  <input
    id="news-image-${n}"
    value="${noticia.imagem || ''}"
    placeholder="/uploads/site/noticia.png"
  >

  <button
    class="btn upload btn-upload-news-image"
    type="button"
    data-target="news-image-${n}"
  >
    Enviar
  </button>

  <button
    class="btn ghost btn-open-media-picker"
    type="button"
    data-target="news-image-${n}"
  >
    Biblioteca
  </button>
</div>

      <label>Link do botão</label>
      <input id="news-link-${n}" value="${noticia.link || './noticias.html'}" placeholder="./noticias.html">

      <button class="btn ghost btn-remove-news" type="button">
        Remover notícia
      </button>
    </div>
  `;
}

function montarCamposHomeNoticias(nome) {
  const blocoAtual =
    pageBlocksMap?.home?.find(b => b.id === 'home-noticias');

  const mongo = blocoAtual?.mongo || {};
  const config = mongo.configuracao || {};

  return `
    <div class="properties-head">
      <h2>Notícias em Destaque</h2>
      <span>${nome}</span>
    </div>

    <div class="cms-alert-info">
      As notícias exibidas aqui vêm da aba Notícias. Este bloco controla apenas a exibição na Página Inicial.
    </div>

    <label>Título da seção</label>
    <input id="news-section-title" value="${mongo.titulo || 'Notícias em Destaque'}">

    <label>Descrição da seção</label>
    <textarea id="news-section-subtitle">${mongo.texto || 'Acompanhe os principais comunicados, eventos e informações do Colégio Militar Dom Pedro II.'}</textarea>

    <div class="cms-field-row">
      <div>
        <label>Quantidade</label>
        <input id="home-news-limit" type="number" min="1" max="6" value="${config.limite ?? 4}">
      </div>

      <div>
        <label>Categoria</label>
        <input id="home-news-category-filter" value="${config.categoria || ''}" placeholder="Todas">
      </div>
    </div>

    <div class="cms-field-row">
      <label>
        <input type="checkbox" id="home-news-only-published" ${config.somentePublicadas !== false ? 'checked' : ''}>
        Mostrar somente publicadas
      </label>

      <label>
        <input type="checkbox" id="home-news-featured-first" ${config.destaquesPrimeiro !== false ? 'checked' : ''}>
        Destaques primeiro
      </label>
    </div>

    <label>Texto do link geral</label>
    <input id="home-news-all-text" value="${config.textoLinkGeral || 'VER TODAS AS NOTÍCIAS →'}">

    <label>Texto do botão da notícia</label>
    <input id="home-news-button-text" value="${config.textoBotao || 'Leia mais →'}">

    <div class="builder-actions">
      <button class="btn ghost" type="button" data-action="duplicate">Duplicar bloco</button>
      <button class="btn primary" type="button" data-action="save">Salvar bloco</button>
    </div>
  `;
}

function montarCamposHomeAssociacao(nome) {
  const blocoAtual =
    pageBlocksMap?.home?.find(b => b.id === 'home-associacao');

  const mongo = blocoAtual?.mongo || {};

  const projetos =
    Array.isArray(mongo.configuracao?.projetos) && mongo.configuracao.projetos.length
      ? mongo.configuracao.projetos
      : [
          {
            imagem: '',
            titulo: 'Projeto apoiado pela Associação',
            texto: 'Descreva aqui uma ação desenvolvida com apoio da Associação de Pais.'
          }
        ];

  return `
    <div class="properties-head">
      <h2>Associação de Pais</h2>
      <span>${nome}</span>
    </div>

    <label>Título do card</label>
    <input id="home-assoc-title" value="${mongo.titulo || 'Associação de Pais'}">

    <label>Texto curto do card</label>
    <textarea id="home-assoc-text">${mongo.texto || 'Conheça as ações da Associação de Pais e participe das iniciativas que fortalecem nossa comunidade escolar.'}</textarea>

    <label>Título do modal</label>
    <input id="home-assoc-modal-title" value="${mongo.configuracao?.modalTitulo || 'Associação de Pais do Colégio'}">

    <label>Texto completo do modal</label>
    <textarea id="home-assoc-modal-text">${mongo.configuracao?.modalTexto || 'A Associação de Pais atua em parceria com a escola, apoiando ações pedagógicas, projetos institucionais, eventos, melhorias e iniciativas voltadas ao fortalecimento da comunidade escolar.'}</textarea>

    <label>Texto do botão</label>
    <input id="home-assoc-button-text" value="${mongo.link?.texto || 'Quero participar'}">

    <label>Link do formulário</label>
    <input id="home-assoc-button-link" value="${mongo.link?.url || '#'}">

    <div class="cms-alert-info">
      Imagens/projetos exibidos no modal da Associação
    </div>

    <div id="home-assoc-projects-fields">
      ${projetos.map((item, index) =>
        montarItemProjetoAssociacao(index + 1, item)
      ).join('')}
    </div>

    <input type="file" id="upload-file" hidden accept="image/*">

    <button class="btn ghost full" id="btn-add-home-assoc-project" type="button">
      + Adicionar imagem/projeto
    </button>

    <div class="builder-actions">
      <button class="btn ghost" type="button" data-action="duplicate">Duplicar bloco</button>
      <button class="btn primary" type="button" data-action="save">Salvar bloco</button>
    </div>
  `;
}

function montarItemProjetoAssociacao(n, item = {}) {
  return `
    <div class="home-assoc-project-editor" data-home-assoc-project-index="${n}">
      <div class="news-editor-top">
        <strong>Imagem/Projeto ${n}</strong>

        <div class="quick-item-controls">
          <button type="button" class="btn-home-assoc-project-up">↑</button>
          <button type="button" class="btn-home-assoc-project-down">↓</button>
        </div>
      </div>

      <label>Imagem</label>
      <div class="upload-field">
        <input
          id="home-assoc-project-image-${n}"
          value="${item.imagem || ''}"
          placeholder="/uploads/site/projeto-associacao.jpg"
        >

        <button
          class="btn upload btn-upload-home-assoc-project"
          type="button"
          data-target="home-assoc-project-image-${n}"
        >
          Enviar
        </button>

        <button
          class="btn ghost btn-open-media-picker"
          type="button"
          data-target="home-assoc-project-image-${n}"
        >
          Biblioteca
        </button>
      </div>

      <label>Título da imagem/projeto</label>
      <input
        id="home-assoc-project-title-${n}"
        value="${item.titulo || ''}"
        placeholder="Ex.: Apoio em projeto pedagógico"
      >

      <label>Descrição</label>
      <textarea
        id="home-assoc-project-text-${n}"
        placeholder="Descreva brevemente a ação realizada."
      >${item.texto || ''}</textarea>

      <button class="btn ghost btn-remove-home-assoc-project" type="button">
        Remover imagem/projeto
      </button>
    </div>
  `;
}

function coletarProjetosAssociacaoHome() {
  const campos = [...document.querySelectorAll('.home-assoc-project-editor')];

  return campos.map((box, index) => {
    const i = box.dataset.homeAssocProjectIndex;

    return {
      ordem: index,
      imagem: getInput(`home-assoc-project-image-${i}`)?.value || '',
      titulo: getInput(`home-assoc-project-title-${i}`)?.value || '',
      texto: getInput(`home-assoc-project-text-${i}`)?.value || ''
    };
  }).filter(item => item.imagem.trim() || item.titulo.trim() || item.texto.trim());
}



function montarCamposHomeDocumentos(nome) {
  const blocoAtual =
    pageBlocksMap?.home?.find(b => b.id === 'home-documentos');

  const mongo = blocoAtual?.mongo || {};

  const itensSalvos =
    Array.isArray(mongo?.itens)
      ? mongo.itens
      : [];

  const itens = itensSalvos.length
    ? itensSalvos
    : [
        { icone: '📜', titulo: 'Regulamentos', texto: 'Normas e documentos institucionais.', link: '#' },
        { icone: '📚', titulo: 'Ensino Fundamental II', texto: 'Materiais e informações do Fundamental II.', link: '#' },
        { icone: '🎓', titulo: 'Ensino Médio', texto: 'Materiais e informações do Ensino Médio.', link: '#' },
        { icone: '📅', titulo: 'Calendário Escolar', texto: 'Acesse o calendário letivo.', link: '#' },
        { icone: '⏰', titulo: 'Horários das Disciplinas', texto: 'Consulte os horários das turmas.', link: '#' },
        { icone: '🚌', titulo: 'Rotas de Ônibus', texto: 'Informações sobre transporte escolar.', link: '#' }
      ];

  return `
    <div class="properties-head">
      <h2>Documentos e Informações</h2>
      <span>${nome}</span>
    </div>

    <label>Título da seção</label>
    <input id="home-docs-title" value="${mongo?.titulo || 'Documentos e Informações'}">

    <label>Descrição</label>
    <textarea id="home-docs-text">${mongo?.texto || 'Acesse rapidamente documentos, materiais e informações importantes para alunos e famílias.'}</textarea>

    <div id="home-docs-fields">
      ${itens.map((item, index) => montarItemHomeDocumento(index + 1, item)).join('')}
    </div>

    <button class="btn ghost full" id="btn-add-home-doc" type="button">
      + Adicionar card
    </button>

    <div class="builder-actions">
      <button class="btn ghost" type="button" data-action="duplicate">Duplicar bloco</button>
      <button class="btn primary" type="button" data-action="save">Salvar bloco</button>
    </div>
  `;
}

function montarItemHomeDocumento(n, item = {}) {
  const documentos =
    Array.isArray(item.documentos) && item.documentos.length
      ? item.documentos
      : [
          {
            titulo: 'Novo documento',
            texto: 'Baixar arquivo',
            url: item.link || item.url || '#'
          }
        ];

  return `
    <div class="home-doc-editor" data-home-doc-index="${n}">
      <div class="news-editor-top">
        <strong>Card ${n}</strong>

        <div class="quick-item-controls">
          <button type="button" class="btn-home-doc-up">↑</button>
          <button type="button" class="btn-home-doc-down">↓</button>
        </div>
      </div>

      <label>Ícone</label>
      <input id="home-doc-icon-${n}" value="${item.icone || item.icon || '📄'}">

      <label>Título</label>
      <input id="home-doc-title-${n}" value="${item.titulo || ''}">

      <label>Descrição</label>
      <textarea id="home-doc-text-${n}">${item.texto || item.descricao || ''}</textarea>

      <div class="cms-alert-info">
        Documentos dentro deste card
      </div>

      <div id="home-doc-files-${n}" class="home-doc-files-list">
        ${documentos.map((doc, index) =>
          montarArquivoHomeDocumento(n, index + 1, doc)
        ).join('')}
      </div>

      <button
        class="btn ghost full btn-add-home-doc-file"
        type="button"
        data-card-index="${n}"
      >
        + Adicionar documento neste card
      </button>

      <button class="btn ghost btn-remove-home-doc" type="button">
        Remover card
      </button>
    </div>
  `;
}

function montarArquivoHomeDocumento(cardIndex, fileIndex, doc = {}) {
  return `
    <div
      class="home-doc-file-editor"
      data-card-index="${cardIndex}"
      data-file-index="${fileIndex}"
    >
      <div class="news-editor-top">
        <strong>Documento ${fileIndex}</strong>

        <button
          class="btn ghost btn-remove-home-doc-file"
          type="button"
        >
          Remover
        </button>
      </div>

      <label>Título do documento</label>
      <input
        id="home-doc-file-title-${cardIndex}-${fileIndex}"
        value="${doc.titulo || ''}"
        placeholder="Ex.: Material Escolar"
      >

      <label>Descrição / texto do botão</label>
      <input
        id="home-doc-file-text-${cardIndex}-${fileIndex}"
        value="${doc.texto || 'Baixar arquivo'}"
        placeholder="Ex.: Baixar PDF"
      >

      <label>Link / arquivo</label>
      <div class="upload-field">
        <input
          id="home-doc-file-url-${cardIndex}-${fileIndex}"
          value="${doc.url || doc.link || '#'}"
          placeholder="/uploads/site/documento.pdf"
        >

        <button
          class="btn upload btn-upload-home-doc-file"
          type="button"
          data-target="home-doc-file-url-${cardIndex}-${fileIndex}"
        >
          Enviar
        </button>

        <button
          class="btn ghost btn-open-media-picker"
          type="button"
          data-target="home-doc-file-url-${cardIndex}-${fileIndex}"
        >
          Biblioteca
        </button>
      </div>
    </div>
  `;
}

function coletarHomeDocumentos() {
  const cards = [...document.querySelectorAll('.home-doc-editor')];

  return cards.map((box, index) => {
    const i = box.dataset.homeDocIndex;

    const documentos =
      [...box.querySelectorAll('.home-doc-file-editor')].map((docBox, docIndex) => {
        const fileIndex = docBox.dataset.fileIndex;

        return {
          ordem: docIndex,
          titulo: getInput(`home-doc-file-title-${i}-${fileIndex}`)?.value || '',
          texto: getInput(`home-doc-file-text-${i}-${fileIndex}`)?.value || 'Baixar arquivo',
          url: getInput(`home-doc-file-url-${i}-${fileIndex}`)?.value || '#'
        };
      }).filter(doc => doc.titulo.trim() || doc.url.trim());

    return {
      ordem: index,
      icone: getInput(`home-doc-icon-${i}`)?.value || '📄',
      titulo: getInput(`home-doc-title-${i}`)?.value || '',
      texto: getInput(`home-doc-text-${i}`)?.value || '',
      documentos
    };
  }).filter(item => item.titulo.trim() || item.texto.trim() || item.documentos.length);
}

function coletarNoticiasHome() {
  const campos = [...document.querySelectorAll('.news-item-editor')];

  return campos.map((box, index) => {
    const i = box.dataset.newsIndex;

    return {
      ordem: index,
      titulo: getInput(`news-title-${i}`)?.value || '',
      categoria: getInput(`news-category-${i}`)?.value || '',
      data: getInput(`news-date-${i}`)?.value || '',
      autor: getInput(`news-author-${i}`)?.value || '',
      resumo: getInput(`news-summary-${i}`)?.value || '',
      imagem: getInput(`news-image-${i}`)?.value || '',
      link: getInput(`news-link-${i}`)?.value || './noticias.html',
      destaque: getInput(`news-featured-${i}`)?.checked || false
    };
  }).filter(item => item.titulo.trim());
}

function obterCategoriaNoticia() {
  const categoria = getInput('cms-news-category')?.value || 'Comunicado';

  if (categoria === 'Outro') {
    return getInput('cms-news-category-custom')?.value?.trim() || 'Outro';
  }

  return categoria;
}

function aplicarCategoriaNoticia(categoria = 'Comunicado') {
  const select = getInput('cms-news-category');
  const custom = getInput('cms-news-category-custom');

  if (!select) return;

  const opcoes = [...select.options].map(opt => opt.value);

  if (opcoes.includes(categoria)) {
    select.value = categoria;
    if (custom) {
      custom.style.display = 'none';
      custom.value = '';
    }
  } else {
    select.value = 'Outro';
    if (custom) {
      custom.style.display = 'block';
      custom.value = categoria;
    }
  }
}

function coletarImagensNoticia() {
  const itens = [...document.querySelectorAll('.cms-news-image-item')];

  return itens.map((item, index) => {
    const i = item.dataset.imageIndex;

    return {
      ordem: index,
      url: getInput(`cms-news-gallery-url-${i}`)?.value || '',
      legenda: getInput(`cms-news-gallery-caption-${i}`)?.value || '',
      posicao: getInput(`cms-news-gallery-position-${i}`)?.value || 'galeria'
    };
  }).filter(img => img.url.trim());
}

function montarImagemNoticiaItem(n, imagem = {}) {
  const url = imagem.url || imagem.imagem || '';
  const legenda = imagem.legenda || imagem.alt || '';
  const posicao = imagem.posicao || 'galeria';

  return `
    <div class="cms-news-image-item" data-image-index="${n}">
      <div class="news-editor-top">
        <strong>Imagem ${n}</strong>

        <div class="quick-item-controls">
          <button type="button" class="btn-news-image-cover" data-image-index="${n}">
            Usar como capa
          </button>

          <button type="button" class="btn-remove-news-image">
            Remover
          </button>
        </div>
      </div>

      ${url ? `
        <div
          class="cms-news-image-preview"
          style="background-image:url('${url}')"
        ></div>
      ` : ''}

      <label>URL da imagem</label>
      <input
        id="cms-news-gallery-url-${n}"
        value="${url}"
        placeholder="URL da imagem"
      >

      <label>Legenda</label>
      <input
        id="cms-news-gallery-caption-${n}"
        value="${legenda}"
        placeholder="Legenda da imagem"
      >

      <label>Posição no texto</label>
      <select id="cms-news-gallery-position-${n}">
        <option value="galeria" ${posicao === 'galeria' ? 'selected' : ''}>Galeria final</option>
        <option value="meio-texto" ${posicao === 'meio-texto' ? 'selected' : ''}>Inserir no meio do texto</option>
      </select>
    </div>
  `;
}

function renderizarImagensNoticia(imagens = []) {
  const container = document.getElementById('cms-news-images-list');
  if (!container) return;

  container.innerHTML = imagens.map((img, index) =>
    montarImagemNoticiaItem(index + 1, img)
  ).join('');
}

function adicionarImagemNoticia(imagem = {}) {
  const container = document.getElementById('cms-news-images-list');
  if (!container) return;

  const n = Date.now();

  const wrap = document.createElement('div');
  wrap.innerHTML = montarImagemNoticiaItem(n, imagem);

  container.appendChild(wrap.firstElementChild);
}

async function enviarMultiplasImagensNoticia(files) {
  const arquivos = Array.from(files || []);

  if (!arquivos.length) return;

  const campoCapa = getInput('cms-news-image');

  for (const file of arquivos) {
    if (!file.type?.startsWith('image/')) {
      continue;
    }

    const formData = new FormData();
    formData.append('arquivo', file);

    const res = await fetch(`${API_ADMIN}/midias/upload`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${localStorage.getItem('site_cms_token')}`
      },
      body: formData
    });

    const data = await res.json();

    if (!data.ok) {
      throw new Error(data.erro || 'Erro ao enviar imagem.');
    }

    const url = data.midia?.url || '';

    if (!url) continue;

    adicionarImagemNoticia({
      url,
      legenda: '',
      posicao: 'galeria'
    });

    // Define capa apenas no campo da notícia.
    // Não mexe em image-url, hero-image, banner-home etc.
    if (campoCapa && !campoCapa.value) {
      campoCapa.value = url;
    }
  }

  showToast('Imagens da notícia enviadas com sucesso.');
}

function adicionarCampoHomeNoticia() {
  const container = document.getElementById('home-news-fields');
  if (!container) return;

  const novo = Date.now();

  const wrap = document.createElement('div');
  wrap.innerHTML = montarItemNoticiaHome(novo, {
    titulo: 'Nova notícia',
    categoria: 'Comunicado',
    data: new Date().toISOString().slice(0, 10),
    autor: 'Comunicação CMDPII',
    resumo: 'Escreva aqui o resumo da nova notícia em destaque.',
    imagem: '',
    link: './noticias.html',
    destaque: false
  });

  const item = wrap.firstElementChild;
  container.appendChild(item);

  ligarEventosCamposDinamicos();
  atualizarPreview();
  showToast('Nova notícia adicionada.');
}



function montarItemEstatisticaHome(n, item = {}) {
  return `
    <div class="stats-item-editor" data-stats-index="${n}">

      <div class="news-editor-top">
        <strong>Estatística ${n}</strong>

        <div class="quick-item-controls">
          <button type="button" class="btn-stats-up">↑</button>
          <button type="button" class="btn-stats-down">↓</button>
        </div>
      </div>

      <div class="cms-field-row">
        <div>
          <label>Ícone</label>
          <input id="stats-icon-${n}" value="${item.icon || '🎓'}" placeholder="🎓">
        </div>

        <div>
          <label>Número</label>
          <input id="stats-number-${n}" value="${item.numero || '1200'}">
        </div>
      </div>

      <label>Título</label>
      <input id="stats-label-${n}" value="${item.titulo || 'Alunos'}">

      <button class="btn ghost btn-remove-stats" type="button">
        Remover estatística
      </button>
    </div>
  `;
}

function montarCamposHomeEstatisticas(nome) {
  const blocoAtual =
    pageBlocksMap?.home?.find(b => b.id === 'home-estatisticas');

  const itensSalvos =
    Array.isArray(blocoAtual?.mongo?.itens)
      ? blocoAtual.mongo.itens
      : [];

  const itens = itensSalvos.length
    ? itensSalvos
    : [
        {
          icon: '👥',
          numero: '',
          titulo: 'Alunos matriculados'
        },
        {
          icon: '🎓',
          numero: '',
          titulo: 'Anos de história'
        },
        {
          icon: '🏆',
          numero: '',
          titulo: 'Prêmios conquistados'
        }
      ];

  return `
    <div class="properties-head">
      <h2>Estatísticas</h2>
      <span>${nome}</span>
    </div>

    <div class="cms-alert-info">
      O primeiro contador, de visitas, é automático e não deve ser editado manualmente.
    </div>

    <div id="home-stats-fields">
      ${itens.map((item, index) =>
        montarItemEstatisticaHome(index + 2, item)
      ).join('')}
    </div>

    <button class="btn ghost full" id="btn-add-home-stats" type="button">
      + Adicionar estatística
    </button>

    <div class="builder-actions">
      <button class="btn ghost" type="button" data-action="duplicate">Duplicar bloco</button>
      <button class="btn primary" type="button" data-action="save">Salvar bloco</button>
    </div>
  `;
}

function coletarEstatisticasHome() {
  const campos = [...document.querySelectorAll('.stats-item-editor')];

  return campos.map((box, index) => {
    const i = box.dataset.statsIndex;

    return {
      ordem: index,
      icon: getInput(`stats-icon-${i}`)?.value || '🎓',
      numero: getInput(`stats-number-${i}`)?.value || '',
      titulo: getInput(`stats-label-${i}`)?.value || ''
    };
  }).filter(item => item.titulo.trim());
}

function adicionarCampoHomeEstatistica() {
  const container = document.getElementById('home-stats-fields');
  if (!container) return;

  const novo = Date.now();

  const wrap = document.createElement('div');

  wrap.innerHTML = montarItemEstatisticaHome(novo, {
    icon: '📌',
    numero: '100',
    titulo: 'Nova estatística'
  });

  const item = wrap.firstElementChild;

  container.appendChild(item);

  ligarEventosCamposDinamicos();
  atualizarPreview();

  showToast('Nova estatística adicionada.');
}

function aplicarEstilosStatsPreview() {
  const doc = getPreviewDoc();

  if (!doc || doc.getElementById('cms-stats-style')) return;

  const style = doc.createElement('style');

  style.id = 'cms-stats-style';

  style.textContent = `
    [data-cms-block-id="home-estatisticas"] {
      padding: clamp(42px, 6vw, 80px) 20px;
      background:
        linear-gradient(135deg, #061a35, #08244a);
      color: white;
    }

    .cms-stats-wrap {
      width: min(1180px, 100%);
      margin: 0 auto;
    }

    .cms-stats-head {
      text-align: center;
      margin-bottom: clamp(28px, 4vw, 46px);
    }

    .cms-stats-head h2 {
      font-size: clamp(28px, 4vw, 42px);
      margin-bottom: 12px;
      font-weight: 900;
    }

    .cms-stats-head p {
      max-width: 760px;
      margin: 0 auto;
      line-height: 1.7;
      color: rgba(255,255,255,.82);
    }

    .cms-stats-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: clamp(18px, 2vw, 26px);
    }

    .cms-stat-card {
      background: rgba(255,255,255,.08);
      border: 1px solid rgba(255,255,255,.12);
      border-radius: 22px;
      padding: clamp(24px, 4vw, 36px);
      text-align: center;
      backdrop-filter: blur(10px);
      box-shadow: 0 14px 32px rgba(0,0,0,.18);
    }

    .cms-stat-icon {
      font-size: clamp(34px, 5vw, 52px);
      margin-bottom: 18px;
    }

    .cms-stat-number {
      font-size: clamp(34px, 5vw, 54px);
      font-weight: 900;
      margin-bottom: 8px;
      color: #f5b51b;
    }

    .cms-stat-label {
      font-size: 15px;
      font-weight: 700;
      color: rgba(255,255,255,.88);
    }

    @media (max-width: 900px) {
      .cms-stats-grid {
        grid-template-columns: repeat(2, 1fr);
      }
    }

    @media (max-width: 560px) {
      .cms-stats-grid {
        grid-template-columns: 1fr;
      }
    }
  `;

  doc.head.appendChild(style);
}

function atualizarEstatisticasHomeNaPreview() {
  const doc = getPreviewDoc();
  if (!doc) return;

  const statsCards =
    doc.querySelectorAll('.stats-card, .stat-card, .stats article, .stats div');

  if (!statsCards.length) return;

  const itens = coletarEstatisticasHome();

  itens.forEach((item, index) => {
    const card = statsCards[index + 1];

    if (!card) return;

    const icon =
      card.querySelector('.stats-icon') ||
      card.querySelector('.stat-icon') ||
      card.querySelector('span');

    const number =
      card.querySelector('.stats-number') ||
      card.querySelector('.stat-number') ||
      card.querySelector('strong') ||
      card.querySelector('h3');

    const label =
      card.querySelector('.stats-label') ||
      card.querySelector('.stat-label') ||
      card.querySelector('small') ||
      card.querySelector('p');

    if (icon) icon.textContent = item.icon || '📌';
    if (number) number.textContent = item.numero || '0';
    if (label) label.textContent = item.titulo || 'Indicador';
  });
}

function formatarDataNoticia(data) {
  if (!data) return '';

  const partes = data.split('-');
  if (partes.length !== 3) return data;

  return `${partes[2]}/${partes[1]}/${partes[0]}`;
}
function formatarDataNoticiaCms(data) {
  if (!data) return '';

  try {
    return new Date(data).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    });
  } catch {
    return '';
  }
}

function aplicarEstilosNoticiasPreview() {
  const doc = getPreviewDoc();
  if (!doc || doc.getElementById('cms-news-style')) return;

  const style = doc.createElement('style');
  style.id = 'cms-news-style';

  style.textContent = `
    [data-cms-block-id="home-noticias"] {
      padding: 22px 20px 42px;
      background: #f3f6fa;
    }

    .home-news-admin-head {
      width: min(1120px, 100%);
      margin: 0 auto 14px;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 18px;
    }

    .home-news-admin-head h2 {
      font-size: clamp(22px, 3vw, 30px);
      color: #061a35;
      font-weight: 900;
      text-transform: uppercase;
      margin: 0;
    }

    .home-news-admin-head p {
      color: #64748b;
      margin-top: 6px;
      max-width: 680px;
      line-height: 1.5;
    }

    .home-news-all {
      color: #b9151b;
      font-size: 12px;
      font-weight: 900;
      text-decoration: none;
      white-space: nowrap;
      margin-top: 6px;
    }

    .home-news-layout {
      width: min(1120px, 100%);
      margin: 0 auto;
      display: grid;
      grid-template-columns: 1.1fr .9fr;
      gap: 28px;
    }

    .home-news-featured {
      background: #fff;
      border-radius: 10px;
      overflow: hidden;
      box-shadow: 0 10px 25px rgba(6,26,53,.08);
    }

    .home-news-featured-img {
      position: relative;
      min-height: 250px;
      background: #c8ced6;
      overflow: hidden;
    }

    .home-news-featured-img img,
    .home-news-mini-img img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }

    .home-news-badge {
      position: absolute;
      top: 0;
      left: 0;
      background: #b9151b;
      color: white;
      font-size: 10px;
      font-weight: 900;
      padding: 8px 12px;
      text-transform: uppercase;
    }

    .home-news-featured-body {
      padding: 28px 24px 30px;
    }

    .home-news-featured-body small,
    .home-news-mini small {
      display: block;
      color: #64748b;
      font-size: 10px;
      text-transform: uppercase;
      margin-bottom: 8px;
    }

    .home-news-featured-body h3 {
      color: #061a35;
      font-size: 24px;
      margin: 0 0 10px;
      font-weight: 900;
    }

    .home-news-featured-body p {
      color: #334155;
      line-height: 1.6;
      margin-bottom: 18px;
    }

    .home-news-featured-body a {
      color: #b9151b;
      font-weight: 900;
      text-decoration: none;
    }

    .home-news-side {
      display: flex;
      flex-direction: column;
      gap: 18px;
    }

    .home-news-mini {
      background: #fff;
      border-radius: 10px;
      padding: 14px;
      display: grid;
      grid-template-columns: 150px 1fr;
      gap: 16px;
      align-items: center;
      box-shadow: 0 10px 25px rgba(6,26,53,.08);
    }

    .home-news-mini-img {
      height: 92px;
      border-radius: 8px;
      background: #c8ced6;
      overflow: hidden;
    }

    .home-news-mini h3 {
      color: #061a35;
      font-size: 15px;
      font-weight: 900;
      margin: 0 0 6px;
    }

    .home-news-mini p {
      color: #334155;
      font-size: 13px;
      line-height: 1.45;
      margin: 0;
    }

    @media (max-width: 850px) {
      .home-news-layout {
        grid-template-columns: 1fr;
      }

      .home-news-admin-head {
        flex-direction: column;
      }

      .home-news-mini {
        grid-template-columns: 120px 1fr;
      }
    }

    @media (max-width: 560px) {
      .home-news-mini {
        grid-template-columns: 1fr;
      }

      .home-news-mini-img {
        height: 170px;
      }
    }
  `;

  doc.head.appendChild(style);
}

async function atualizarNoticiasHomeNaPreview() {
  const doc = getPreviewDoc();
  if (!doc) return;

  const main = doc.querySelector('main') || doc.body;
  if (!main) return;

  let section =
    doc.querySelector('[data-cms-block-id="home-noticias"]');

  if (!section) {
    section = doc.createElement('section');
    main.appendChild(section);
  }

  section.className = 'section';
  section.setAttribute('data-cms-block-id', 'home-noticias');

  const titulo = getInput('news-section-title')?.value || 'Notícias em Destaque';
  const subtitulo = getInput('news-section-subtitle')?.value || '';
  const allText = getInput('home-news-all-text')?.value || 'VER TODAS AS NOTÍCIAS →';
  const btnText = getInput('home-news-button-text')?.value || 'Leia mais →';

  try {
    const res = await fetch(`${API_ADMIN}/noticias`, {
      headers: {
        Authorization: `Bearer ${localStorage.getItem('site_cms_token')}`
      }
    });

    const data = await res.json();

    if (!data.ok) {
      throw new Error(data.erro || 'Erro ao carregar notícias.');
    }

    let noticias = Array.isArray(data.noticias) ? data.noticias : [];

    const onlyPublished = getInput('home-news-only-published')?.checked ?? true;
    const featuredFirst = getInput('home-news-featured-first')?.checked ?? true;
    const categoria = getInput('home-news-category-filter')?.value?.trim();
    const limite = Number(getInput('home-news-limit')?.value || 4);

    if (onlyPublished) {
      noticias = noticias.filter(n => n.status === 'publicada');
    }

    if (categoria) {
      noticias = noticias.filter(n =>
        String(n.categoria || '').toLowerCase() === categoria.toLowerCase()
      );
    }

    if (featuredFirst) {
      noticias = noticias.sort((a, b) =>
        Number(b.destaque || 0) - Number(a.destaque || 0)
      );
    }

    noticias = noticias.slice(0, limite);

    const principal = noticias[0];
    const laterais = noticias.slice(1, 4);

    if (!principal) {
      section.innerHTML = `
        <div class="section-head">
          <h2>${titulo}</h2>
          <a href="./noticias.html">${allText}</a>
        </div>

        ${subtitulo ? `<div class="page-intro"><p>${subtitulo}</p></div>` : ''}

        <div class="single-news-loading">
          Nenhuma notícia publicada encontrada.
        </div>
      `;
      return;
    }

    section.innerHTML = `
      <div class="section-head">
        <h2>${titulo}</h2>
        <a href="./noticias.html">${allText}</a>
      </div>

      ${subtitulo ? `<div class="page-intro"><p>${subtitulo}</p></div>` : ''}

      <div class="news-grid">
        <a
          class="main-news"
          href="./pagina-noticia.html?slug=${principal.slug || ''}"
        >
          <div
            class="image-placeholder"
            style="${principal.imagem ? `background-image:url('${principal.imagem}')` : ''}"
          >
            ${principal.destaque ? '<span>Destaque</span>' : ''}
          </div>

          <div class="news-content">
            <small>${formatarDataNoticiaCms(principal.dataPublicacao || principal.createdAt)}</small>
            <h3>${principal.titulo || 'Notícia em destaque'}</h3>
            <p>${principal.resumo || ''}</p>

            <strong class="news-read-more">
              ${btnText}
            </strong>
          </div>
        </a>

        <div class="side-news">
          ${laterais.map(n => `
            <a href="./pagina-noticia.html?slug=${n.slug || ''}">
              <div
                class="thumb"
                style="${n.imagem ? `background-image:url('${n.imagem}')` : ''}"
              ></div>

              <div>
                <small>${formatarDataNoticiaCms(n.dataPublicacao || n.createdAt)}</small>
                <h4>${n.titulo || ''}</h4>
                <p>${n.resumo || ''}</p>
              </div>
            </a>
          `).join('')}
        </div>
      </div>
    `;

  } catch (err) {
    console.error(err);

    section.innerHTML = `
      <div class="section-head">
        <h2>${titulo}</h2>
        <a href="./noticias.html">${allText}</a>
      </div>

      <div class="single-news-loading">
        Erro ao carregar notícias cadastradas.
      </div>
    `;
  }
}

const galeriaHomePadrao = [
  { imagem: '', alt: 'Foto institucional 1' },
  { imagem: '', alt: 'Foto institucional 2' },
  { imagem: '', alt: 'Foto institucional 3' },
  { imagem: '', alt: 'Foto institucional 4' },
  { imagem: '', alt: 'Foto institucional 5' }
];

function montarItemGaleriaHome(n, item = {}) {
  return `
    <div class="gallery-item-editor" data-gallery-index="${n}">
      <div class="news-editor-top">
        <strong>Imagem ${n}</strong>

        <div class="quick-item-controls">
          <button type="button" class="btn-gallery-up">↑</button>
          <button type="button" class="btn-gallery-down">↓</button>
        </div>
      </div>

      <label>Imagem</label>
      <div class="upload-field">

  <input
    id="gallery-image-${n}"
    value="${item.imagem || ''}"
    placeholder="/uploads/site/foto.png"
  >

  <button
    class="btn upload btn-upload-gallery-image"
    type="button"
    data-target="gallery-image-${n}"
  >
    Enviar
  </button>

  <button
    class="btn ghost btn-open-media-picker"
    type="button"
    data-target="gallery-image-${n}"
  >
    Biblioteca
  </button>

</div>

      <label>Descrição alternativa</label>
      <input id="gallery-alt-${n}" value="${item.alt || ''}" placeholder="Descrição da imagem">

      <button class="btn ghost btn-remove-gallery" type="button">
        Remover imagem
      </button>
    </div>
  `;
}

function montarCamposHomeGaleria(nome) {
  const blocoAtual =
    pageBlocksMap?.home?.find(b => b.id === 'home-galeria');

  const mongo = blocoAtual?.mongo || {};
  const itensSalvos =
    Array.isArray(mongo.itens) && mongo.itens.length
      ? mongo.itens
      : galeriaHomePadrao;

  return `
    <div class="properties-head">
      <h2>Galeria de Fotos</h2>
      <span>${nome}</span>
    </div>

    <label>Título da seção</label>
    <input id="gallery-section-title" value="${mongo.titulo || 'Galeria de Fotos'}">

    <label>Texto do botão</label>
    <input id="gallery-button-text" value="${mongo.link?.texto || 'Ver galeria completa →'}">

    <label>Link do botão</label>
    <input id="gallery-button-link" value="${mongo.link?.url || './galeria.html'}">

    <div id="home-gallery-fields">
      ${itensSalvos.map((item, index) =>
        montarItemGaleriaHome(index + 1, item)
      ).join('')}
    </div>

    <input type="file" id="upload-file" hidden accept="image/*">

    <button class="btn ghost full" id="btn-add-home-gallery" type="button">
      + Adicionar imagem
    </button>

    <div class="builder-actions">
      <button class="btn ghost" type="button" data-action="duplicate">Duplicar bloco</button>
      <button class="btn primary" type="button" data-action="save">Salvar bloco</button>
    </div>
  `;
}

function coletarGaleriaHome() {
  const campos = [...document.querySelectorAll('.gallery-item-editor')];

  return campos.map((box, index) => {
    const i = box.dataset.galleryIndex;

    return {
      ordem: index,
      imagem: getInput(`gallery-image-${i}`)?.value || '',
      alt: getInput(`gallery-alt-${i}`)?.value || ''
    };
  }).filter(item => item.imagem.trim());
}

function adicionarCampoHomeGaleria() {
  const container = document.getElementById('home-gallery-fields');
  if (!container) return;

  const novo = Date.now();
  const wrap = document.createElement('div');

  wrap.innerHTML = montarItemGaleriaHome(novo, {
    imagem: '',
    alt: 'Nova foto da galeria'
  });

  container.appendChild(wrap.firstElementChild);

  ligarEventosCamposDinamicos();
  atualizarPreview();
  showToast('Nova imagem adicionada.');
}

function atualizarGaleriaHomeNaPreview() {
  const doc = getPreviewDoc();
  if (!doc) return;
  aplicarEstilosGaleriaPreview();

  let section =
    doc.querySelector('[data-cms-block-id="home-galeria"]') ||
    [...doc.querySelectorAll('section')].find(sec =>
      sec.textContent?.toLowerCase().includes('galeria de fotos')
    );

  if (!section) return;

  section.setAttribute('data-cms-block-id', 'home-galeria');

  const titulo = getInput('gallery-section-title')?.value || 'Galeria de Fotos';
  const btnText = getInput('gallery-button-text')?.value || 'Ver galeria completa →';
  const btnLink = getInput('gallery-button-link')?.value || './galeria.html';
  const imagens = coletarGaleriaHome();

  const h2 = section.querySelector('h2');
  if (h2) h2.textContent = titulo;

  const link =
    [...section.querySelectorAll('a')].find(a =>
      a.textContent?.toLowerCase().includes('galeria')
    ) || section.querySelector('a');

  if (link) {
    link.textContent = btnText;
    link.href = btnLink;
  }

  const grid =
    section.querySelector('.gallery-grid') ||
    section.querySelector('.galeria-grid') ||
    section.querySelector('.gallery') ||
    section.querySelector('.fotos-grid') ||
    section.querySelector('div');

  if (!grid) return;

  grid.innerHTML = imagens.map(item => `
  <div class="cms-gallery-photo">
    <img src="${item.imagem}" alt="${item.alt || 'Foto da galeria'}">
  </div>
`).join('');
}

function aplicarEstilosGaleriaPreview() {
  const doc = getPreviewDoc();

  if (!doc || doc.getElementById('cms-gallery-style')) return;

  const style = doc.createElement('style');

  style.id = 'cms-gallery-style';

  style.textContent = `
    .cms-gallery-photo {
      width: 100%;
      height: 110px;
      border-radius: 14px;
      overflow: hidden;
      background: #d7dce2;
    }

    .cms-gallery-photo img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }

    @media (max-width: 700px) {
      .cms-gallery-photo {
        height: 90px;
      }
    }
  `;

  doc.head.appendChild(style);
}

function montarCamposHomePatrocinadores(nome) {
  const blocoAtual =
    pageBlocksMap?.home?.find(b => b.id === 'home-patrocinadores');

  const mongo = blocoAtual?.mongo || {};
  const config = mongo.configuracao || {};

  return `
    <div class="properties-head">
      <h2>Parceiros</h2>
      <span>${nome}</span>
    </div>

    <div class="cms-alert-info">
      Os itens exibidos aqui vêm da aba Patrocinadores. Este bloco controla apenas a exibição na Página Inicial.
    </div>

    <label>Título da seção</label>
    <input id="home-sponsor-section-title" value="${mongo.titulo || 'Parceiros'}">

    <label>Descrição da seção</label>
    <textarea id="home-sponsor-section-text">${mongo.texto || 'Conheça parceiros e apoiadores das ações institucionais do Colégio.'}</textarea>

    <div class="cms-field-row">
      <div>
        <label>Quantidade</label>
        <input id="home-sponsor-limit" type="number" min="1" max="20" value="${config.limite ?? 6}">
      </div>

      <div>
        <label>Tipo</label>
        <select id="home-sponsor-type-filter">
          <option value="" ${!config.tipo ? 'selected' : ''}>Todos</option>
          <option value="patrocinador" ${config.tipo === 'patrocinador' ? 'selected' : ''}>Patrocinador</option>
          <option value="parceiro" ${config.tipo === 'parceiro' ? 'selected' : ''}>Parceiro</option>
          <option value="atalho" ${config.tipo === 'atalho' ? 'selected' : ''}>Atalho</option>
          <option value="campanha" ${config.tipo === 'campanha' ? 'selected' : ''}>Campanha</option>
        </select>
      </div>
    </div>

    <div class="cms-field-row">
      <label>
        <input type="checkbox" id="home-sponsor-only-active" ${config.somenteAtivos !== false ? 'checked' : ''}>
        Mostrar somente ativos
      </label>

      <label>
        <input type="checkbox" id="home-sponsor-featured-first" ${config.destaquesPrimeiro !== false ? 'checked' : ''}>
        Destaques primeiro
      </label>
    </div>

    <label>Layout</label>
    <select id="home-sponsor-layout">
      <option value="grid" ${(config.layout || 'grid') === 'grid' ? 'selected' : ''}>Grid de cards</option>
      <option value="banner" ${config.layout === 'banner' ? 'selected' : ''}>Banners largos</option>
      <option value="compact" ${config.layout === 'compact' ? 'selected' : ''}>Compacto</option>
    </select>

    <div class="builder-actions">
      <button class="btn ghost" type="button" data-action="duplicate">Duplicar bloco</button>
      <button class="btn primary" type="button" data-action="save">Salvar bloco</button>
    </div>
  `;
}

async function atualizarPatrocinadoresHomeNaPreview() {
  const doc = getPreviewDoc();
  if (!doc) return;

  const main = doc.querySelector('main') || doc.body;
  if (!main) return;

  let section = doc.querySelector('[data-cms-block-id="home-patrocinadores"]');

  if (!section) {
    section = doc.createElement('section');
    section.className = 'cms-home-sponsors-section';
    section.setAttribute('data-cms-block-id', 'home-patrocinadores');

    const noticias =
      doc.querySelector('[data-cms-block-id="home-noticias"]') ||
      [...doc.querySelectorAll('section')].find(sec =>
        sec.textContent?.toLowerCase().includes('notícias em destaque') ||
        sec.textContent?.toLowerCase().includes('destaques')
      );

    if (noticias) {
      main.insertBefore(section, noticias);
    } else {
      main.appendChild(section);
    }
  }

  const titulo =
    getInput('home-sponsor-section-title')?.value ||
    'Parceiros';

  const tipo = getInput('home-sponsor-type-filter')?.value || '';
  const limite = Number(getInput('home-sponsor-limit')?.value || 6);
  const onlyActive = getInput('home-sponsor-only-active')?.checked ?? true;
  const featuredFirst = getInput('home-sponsor-featured-first')?.checked ?? true;
  const layout = getInput('home-sponsor-layout')?.value || 'grid';

  section.innerHTML = `
    <div class="cms-home-sponsors-head subtle">
      <span>${titulo}</span>
    </div>

    <div class="empty-state">
      Carregando patrocinadores...
    </div>
  `;

  try {
    const res = await fetch('/api/site-publico/patrocinadores');
    const data = await res.json();

    if (!data.ok) {
      throw new Error(data.erro || 'Erro ao carregar patrocinadores.');
    }

    let patrocinadores = Array.isArray(data.patrocinadores)
      ? data.patrocinadores
      : [];

    if (onlyActive) {
      patrocinadores = patrocinadores.filter(item => item.status !== 'inativo');
    }

    if (tipo) {
      patrocinadores = patrocinadores.filter(item => item.tipo === tipo);
    }

    if (featuredFirst) {
      patrocinadores = patrocinadores.sort((a, b) => {
        if (a.destaque === b.destaque) {
          return Number(a.ordem || 0) - Number(b.ordem || 0);
        }

        return a.destaque ? -1 : 1;
      });
    }

    patrocinadores = patrocinadores.slice(0, limite);

    if (!patrocinadores.length) {
      section.innerHTML = `
        <div class="cms-home-sponsors-head subtle">
          <span>${titulo}</span>
        </div>

        <div class="empty-state">
          Nenhum patrocinador ativo encontrado.
        </div>
      `;
      return;
    }

    section.classList.remove('sponsors-layout-banner', 'sponsors-layout-compact');

    if (layout === 'banner') {
      section.classList.add('sponsors-layout-banner');
    }

    if (layout === 'compact') {
      section.classList.add('sponsors-layout-compact');
    }

    section.innerHTML = `
      <div class="cms-home-sponsors-head subtle">
        <span>${titulo}</span>
      </div>

      <div class="cms-home-sponsors-grid">
        ${patrocinadores.map(item => `
          <a
            class="cms-home-sponsor-card ${item.destaque ? 'featured' : ''}"
            href="${item.url || '#'}"
            target="${item.url ? '_blank' : '_self'}"
            rel="noopener noreferrer"
          >
            <div class="cms-home-sponsor-logo">
              ${
                item.imagem
                  ? `<img
                      src="${item.imagem}"
                      alt="${item.nome || 'Patrocinador'}"
                      style="width:100%;height:100%;object-fit:contain;padding:10px;display:block;"
                    >`
                  : '<span>🤝</span>'
              }
            </div>

            <div>
              <strong>${item.nome || 'Patrocinador'}</strong>
              ${item.descricao ? `<p>${item.descricao}</p>` : ''}
              <small>${item.tipo || 'patrocinador'}</small>
            </div>
          </a>
        `).join('')}
      </div>
    `;

    aplicarEstilosPatrocinadoresHomePreview();

  } catch (err) {
    console.error(err);

    section.innerHTML = `
      <div class="cms-home-sponsors-head subtle">
        <span>${titulo}</span>
      </div>

      <div class="empty-state">
        Erro ao carregar patrocinadores.
      </div>
    `;
  }
}

function aplicarEstilosPatrocinadoresHomePreview() {
  const doc = getPreviewDoc();

  if (!doc) return;

  const antigo = doc.getElementById('cms-home-sponsors-style');

  if (antigo) {
    antigo.remove();
  }

  const style = doc.createElement('style');
  style.id = 'cms-home-sponsors-style';

  style.textContent = `
  .cms-home-sponsors-section {
    padding: 24px 20px;
    background: #f3f6fa;
  }

  .cms-home-sponsors-head {
    width: min(1120px, 100%);
    margin: 0 auto 14px;
    text-align: center;
  }

  .cms-home-sponsors-head.subtle {
    margin-bottom: 14px;
  }

  .cms-home-sponsors-head.subtle span {
    display: inline-flex;
    padding: 7px 14px;
    border-radius: 999px;
    background: rgba(185,21,27,.08);
    color: #b9151b;
    font-size: 11px;
    font-weight: 900;
    text-transform: uppercase;
    letter-spacing: .08em;
  }

  .cms-home-sponsors-grid {
    width: min(1120px, 100%);
    margin: 0 auto;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(160px, 210px));
    justify-content: center;
    gap: 12px;
  }

  .cms-home-sponsor-card {
    background: white;
    border: 1px solid rgba(15,23,42,.08);
    border-radius: 18px;
    padding: 12px;
    text-decoration: none;
    color: inherit;
    box-shadow: 0 10px 24px rgba(15,23,42,.06);
    transition: .25s;
  }

  .cms-home-sponsor-card:hover {
    transform: translateY(-3px);
    box-shadow: 0 16px 34px rgba(15,23,42,.10);
  }

  .cms-home-sponsor-card.featured {
    border-color: rgba(185,21,27,.18);
    box-shadow: 0 14px 30px rgba(185,21,27,.10);
  }

  .cms-home-sponsor-logo {
    height: 72px;
    border-radius: 14px;
    background: #f8fafc;
    display: grid;
    place-items: center;
    overflow: hidden;
    margin-bottom: 10px;
  }

  .cms-home-sponsor-logo img {
    width: 100%;
    height: 100%;
    object-fit: contain !important;
    padding: 8px;
    display: block;
  }

  .cms-home-sponsor-logo span {
    font-size: 30px;
  }

  .cms-home-sponsor-card strong {
    display: block;
    color: #061a35;
    font-size: 13px;
    font-weight: 900;
    margin-bottom: 4px;
  }

  .cms-home-sponsor-card p {
    color: #475569;
    font-size: 11px;
    line-height: 1.45;
    margin-bottom: 6px;
  }

  .cms-home-sponsor-card small {
    color: #b9151b;
    text-transform: uppercase;
    font-size: 9px;
    font-weight: 900;
    letter-spacing: .05em;
  }

  .sponsors-layout-banner .cms-home-sponsors-grid {
    grid-template-columns: 1fr;
  }

  .sponsors-layout-banner .cms-home-sponsor-card {
    display: grid;
    grid-template-columns: 140px 1fr;
    align-items: center;
    gap: 16px;
  }

  .sponsors-layout-banner .cms-home-sponsor-logo {
    height: 76px;
    margin-bottom: 0;
  }

  .sponsors-layout-compact .cms-home-sponsors-grid {
    grid-template-columns: repeat(auto-fill, minmax(130px, 170px));
  }

  .sponsors-layout-compact .cms-home-sponsor-card {
    padding: 10px;
  }

  .sponsors-layout-compact .cms-home-sponsor-logo {
    height: 56px;
  }

  .sponsors-layout-compact .cms-home-sponsor-card p {
    display: none;
  }

  @media (max-width: 700px) {
    .cms-home-sponsors-grid {
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    }

    .sponsors-layout-banner .cms-home-sponsor-card {
      grid-template-columns: 1fr;
    }
  }
`;

  doc.head.appendChild(style);
}

function montarCamposHomeVideo(nome) {
  const blocoAtual =
    pageBlocksMap?.home?.find(b => b.id === 'home-video');

  const mongo = blocoAtual?.mongo || {};

  return `
    <div class="properties-head">
      <h2>Vídeo Institucional</h2>
      <span>${nome}</span>
    </div>

    <label>Título da seção</label>
    <input id="video-section-title" value="${mongo.titulo || 'Conheça nossa instituição'}">

    <label>Descrição</label>
    <textarea id="video-section-text">${mongo.texto || 'Assista ao vídeo institucional e conheça mais sobre a estrutura, projetos e valores do Colégio Militar Dom Pedro II.'}</textarea>

    <label>Texto do botão</label>
    <input id="video-button-text" value="${mongo.link?.texto || 'Assistir vídeo'}">

    <label>Link do vídeo (YouTube/Vimeo)</label>
    <input id="video-link" value="${mongo.videoUrl || mongo.link?.url || 'https://youtube.com'}">

    <label>Imagem de capa</label>

    <div class="upload-field">
      <input
        id="video-cover-image"
        value="${mongo.imagemUrl || ''}"
        placeholder="/uploads/site/video-capa.png"
      >

      <button
        class="btn upload btn-upload-video-cover"
        type="button"
        data-target="video-cover-image"
      >
        Enviar
      </button>
    </div>

    <input type="file" id="upload-file" hidden accept="image/*">

    <div class="builder-actions">
      <button class="btn ghost" type="button" data-action="duplicate">
        Duplicar bloco
      </button>

      <button class="btn primary" type="button" data-action="save">
        Salvar bloco
      </button>
    </div>
  `;
}

function aplicarEstilosVideoPreview() {
  const doc = getPreviewDoc();

  if (!doc || doc.getElementById('cms-video-style')) return;

  const style = doc.createElement('style');

  style.id = 'cms-video-style';

  style.textContent = `
    .cms-video-cover {
      border-radius: 18px;
      overflow: hidden;
      position: relative;
    }

    .cms-video-modal {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,.82);
      z-index: 999999;
      display: none;
      align-items: center;
      justify-content: center;
      padding: 30px;
    }

    .cms-video-modal.active {
      display: flex;
    }

    .cms-video-modal-box {
      width: min(1100px, 100%);
      aspect-ratio: 16/9;
      background: #000;
      border-radius: 18px;
      overflow: hidden;
      position: relative;
      box-shadow: 0 30px 80px rgba(0,0,0,.4);
    }

    .cms-video-modal iframe {
      width: 100%;
      height: 100%;
      border: none;
    }

    .cms-video-close {
      position: absolute;
      top: 14px;
      right: 14px;
      width: 44px;
      height: 44px;
      border-radius: 999px;
      border: none;
      background: rgba(255,255,255,.92);
      color: #061a35;
      font-size: 24px;
      font-weight: 900;
      cursor: pointer;
      z-index: 10;
    }

    .cms-video-play {
      position: absolute;
      inset: 0;
      display: grid;
      place-items: center;
      background: rgba(0,0,0,.22);
    }

    .cms-video-play span {
      width: 82px;
      height: 82px;
      border-radius: 999px;
      background: rgba(255,255,255,.92);
      display: grid;
      place-items: center;
      font-size: 34px;
      color: #b9151b;
      box-shadow: 0 10px 30px rgba(0,0,0,.28);
    }
  `;

  doc.head.appendChild(style);
}

function atualizarVideoHomeNaPreview() {
  const doc = getPreviewDoc();
  if (!doc) return;

  aplicarEstilosVideoPreview();

  let section =
    doc.querySelector('[data-cms-block-id="home-video"]');

  if (!section) {
    section = doc.createElement('section');
    section.className = 'video-call';
    section.setAttribute('data-cms-block-id', 'home-video');

    const main = doc.querySelector('main') || doc.body;
    main.appendChild(section);
  }

  const titulo =
    getInput('video-section-title')?.value ||
    'Assista ao vídeo institucional';

  const texto =
    getInput('video-section-text')?.value || '';

  const botao =
    getInput('video-button-text')?.value ||
    'Assistir agora';

  const link =
    getInput('video-link')?.value || '';

  const imagem =
    getInput('video-cover-image')?.value || '';

  const embed = converterYoutubeParaEmbed(link);

  section.innerHTML = `
    <div>
      <span class="video-icon">▶</span>

      <h2>${titulo}</h2>

      <p>${texto}</p>
    </div>

    <a
      href="${link || '#'}"
      class="btn primary"
      target="_blank"
      rel="noopener noreferrer"
    >
      ${botao}
    </a>
  `;

  if (imagem) {
    section.style.background = `
      linear-gradient(
        90deg,
        rgba(6,26,53,.94),
        rgba(6,26,53,.78)
      ),
      url("${imagem}")
    `;

    section.style.backgroundSize = 'cover';
    section.style.backgroundPosition = 'center';
  } else {
    section.style.background = '';
  }

  const btn = section.querySelector('a.btn');

  if (btn && embed) {
    btn.onclick = (e) => {
      e.preventDefault();
      abrirModalVideo(embed);
    };
  }

  criarModalVideoPreview();
}

function converterYoutubeParaEmbed(url) {
  if (!url) return '';

  if (url.includes('embed')) return url;

  const match =
    url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&]+)/);

  if (!match) return url;

  return `https://www.youtube.com/embed/${match[1]}?autoplay=1`;
}

function criarModalVideoPreview() {
  const doc = getPreviewDoc();

  if (!doc || doc.getElementById('cms-video-modal')) return;

  const modal = doc.createElement('div');

  modal.id = 'cms-video-modal';

  modal.className = 'cms-video-modal';

  modal.innerHTML = `
    <div class="cms-video-modal-box">

      <button class="cms-video-close">
        ×
      </button>

      <iframe
        src=""
        allowfullscreen
        allow="autoplay; encrypted-media"
      ></iframe>

    </div>
  `;

  doc.body.appendChild(modal);

  modal.querySelector('.cms-video-close')
    .addEventListener('click', fecharModalVideo);

  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      fecharModalVideo();
    }
  });
}

function abrirModalVideo(link) {
  const doc = getPreviewDoc();

  const modal =
    doc.getElementById('cms-video-modal');

  if (!modal) return;

  const iframe =
    modal.querySelector('iframe');

  iframe.src = link;

  modal.classList.add('active');
}

function fecharModalVideo() {
  const doc = getPreviewDoc();

  const modal =
    doc.getElementById('cms-video-modal');

  if (!modal) return;

  const iframe =
    modal.querySelector('iframe');

  iframe.src = '';

  modal.classList.remove('active');
}

function coletarTimelineHistoria() {
  const campos = [...document.querySelectorAll('.timeline-item-editor')];

  return campos.map((box, index) => {
    const i = box.dataset.timelineIndex;

    return {
      ordem: index,
      ano: getInput(`timeline-year-${i}`)?.value || '',
      texto: getInput(`timeline-text-${i}`)?.value || '',
      destaque: getInput(`timeline-featured-${i}`)?.checked || false
    };
  }).filter(item => item.ano.trim() || item.texto.trim());
}

function adicionarMarcoTimelineHistoria() {
  const container = document.getElementById('timeline-fields');
  if (!container) return;

  const novo = Date.now();

  const div = document.createElement('div');
  div.className = 'timeline-item-editor';
  div.dataset.timelineIndex = novo;

  div.innerHTML = `
    <div class="news-editor-top">
      <strong>Novo marco</strong>

      <div class="quick-item-controls">
        <button type="button" class="btn-timeline-up">↑</button>
        <button type="button" class="btn-timeline-down">↓</button>

        <label style="display:flex;align-items:center;gap:6px;">
          <input type="checkbox" id="timeline-featured-${novo}">
          Destaque
        </label>
      </div>
    </div>

    <label>Ano</label>
    <input id="timeline-year-${novo}" value="2026">

    <label>Descrição</label>
    <textarea id="timeline-text-${novo}">Novo marco histórico da instituição.</textarea>

    <button class="btn ghost btn-remove-timeline" type="button">
      Remover marco
    </button>
  `;

  container.appendChild(div);

  ligarEventosCamposDinamicos();
  atualizarPreview();
  showToast('Marco histórico adicionado.');
}

function atualizarTimelineHistoriaNaPreview() {
  const doc = getPreviewDoc();
  if (!doc) return;

  const section = doc.querySelector('.timeline')?.closest('.section');
  const timeline = doc.querySelector('.timeline');

  if (!section || !timeline) return;

  const titulo = getInput('timeline-section-title')?.value || 'Linha do Tempo';
  const h2 = section.querySelector('.section-head h2') || section.querySelector('h2');

  if (h2) h2.textContent = titulo;

  const itens = coletarTimelineHistoria();

  timeline.innerHTML = itens.map(item => `
    <div class="timeline-card ${item.destaque ? 'destaque' : ''}">
      <strong>${item.ano}</strong>
      <p>${item.texto}</p>
    </div>
  `).join('');
}

function montarItemMenuHistoria(n, item = {}) {
  return `
    <div class="hist-menu-item-editor" data-hist-menu-index="${n}">
      <div class="news-editor-top">
        <strong>Item ${n}</strong>

        <div class="quick-item-controls">
          <button type="button" class="btn-hist-menu-up">↑</button>
          <button type="button" class="btn-hist-menu-down">↓</button>

          <label style="display:flex;align-items:center;gap:6px;">
            <input type="radio" name="hist-menu-active" id="hist-menu-active-${n}" ${item.ativo ? 'checked' : ''}>
            Ativo
          </label>
        </div>
      </div>

      <label>Texto do item</label>
      <input id="hist-menu-text-${n}" value="${item.texto || ''}" placeholder="Ex: Nossa História">

      <label>Link</label>
      <input id="hist-menu-link-${n}" value="${item.link || '#'}" placeholder="#nossa-historia">

      <button class="btn ghost btn-remove-hist-menu" type="button">
        Remover item
      </button>
    </div>
  `;
}

function montarCamposMenuHistoria(nome) {
  const blocoAtual =
    pageBlocksMap?.historia?.find(b => b.id === 'historia-menu');

  const itensSalvos =
    Array.isArray(blocoAtual?.mongo?.itens)
      ? blocoAtual.mongo.itens
      : [];

  const itens = itensSalvos.length
    ? itensSalvos
    : [
        { texto: 'Nossa História', link: '#nossa-historia', ativo: true },
        { texto: 'Linha do Tempo', link: '#linha-do-tempo', ativo: false }
      ];

  return `
    <div class="properties-head">
      <h2>Menu Lateral</h2>
      <span>${nome}</span>
    </div>

    <div id="hist-menu-fields">
      ${itens.map((item, index) =>
        montarItemMenuHistoria(index + 1, item)
      ).join('')}
    </div>

    <button class="btn ghost full" id="btn-add-hist-menu-item" type="button">
      + Adicionar item
    </button>

    <div class="builder-actions">
      <button class="btn ghost" type="button" data-action="duplicate">Duplicar bloco</button>
      <button class="btn primary" type="button" data-action="save">Salvar bloco</button>
    </div>
  `;
}

function coletarMenuHistoria() {
  const campos = [...document.querySelectorAll('.hist-menu-item-editor')];

  return campos.map((box, index) => {
    const i = box.dataset.histMenuIndex;

    return {
      ordem: index,
      texto: getInput(`hist-menu-text-${i}`)?.value || '',
      link: getInput(`hist-menu-link-${i}`)?.value || '#',
      ativo: getInput(`hist-menu-active-${i}`)?.checked || false
    };
  }).filter(item => item.texto.trim());
}

function adicionarItemMenuHistoria() {
  const container = document.getElementById('hist-menu-fields');
  if (!container) return;

  const novo = Date.now();

  const wrap = document.createElement('div');

  wrap.innerHTML = montarItemMenuHistoria(novo, {
    texto: 'Novo item',
    link: '#',
    ativo: false
  });

  container.appendChild(wrap.firstElementChild);

  ligarEventosCamposDinamicos();
  atualizarPreview();

  showToast('Item do menu adicionado.');
}

function atualizarMenuHistoriaNaPreview() {
  const doc = getPreviewDoc();
  if (!doc) return;

  const layout = doc.querySelector('.history-layout');
  if (!layout) return;

  let sidebar = layout.querySelector('.history-sidebar');

  if (!sidebar) {
    sidebar = doc.createElement('aside');
    sidebar.className = 'history-sidebar';
    layout.prepend(sidebar);
  }

  const itens = typeof coletarMenuHistoria === 'function'
    ? coletarMenuHistoria()
    : [];

  sidebar.innerHTML = `
    <nav class="history-side-menu">
      ${itens.map(item => `
        <a href="${item.link || '#'}" class="${item.ativo ? 'active' : ''}">
          ${item.texto || ''}
        </a>
      `).join('')}
    </nav>
  `;
}

function montarCamposHistoriaVideo(nome) {

  const blocoAtual =
    pageBlocksMap?.historia?.find(b => b.id === 'historia-video');

  const mongo = blocoAtual?.mongo || {};

  return `
    <div class="properties-head">
      <h2>Vídeo Institucional</h2>
      <span>${nome}</span>
    </div>

    <label>Título</label>

    <input
      id="hist-video-title"
      value="${mongo.titulo || 'Tradição que inspira, educação que transforma.'}"
    >

    <label>Descrição</label>

    <textarea id="hist-video-text">${mongo.texto || 'Conheça mais sobre a história, os valores e a missão do Colégio Dom Pedro II - Campus CZS.'}</textarea>

    <label>Texto do botão</label>

    <input
      id="hist-video-button"
      value="${mongo.link?.texto || 'Assistir vídeo institucional'}"
    >

    <label>Link do vídeo</label>

    <input
      id="hist-video-link"
      value="${mongo.videoUrl || mongo.link?.url || 'https://youtube.com'}"
    >

    <label>Imagem de fundo</label>

    <div class="upload-field">

      <input
        id="hist-video-bg"
        value="${mongo.imagemUrl || ''}"
        placeholder="/uploads/site/video-historia.png"
      >

      <button
        class="btn upload btn-upload-hist-video"
        type="button"
        data-target="hist-video-bg"
      >
        Enviar
      </button>

    </div>

    <input
      type="file"
      id="upload-file"
      hidden
      accept="image/*"
    >

    <div class="builder-actions">

      <button
        class="btn ghost"
        type="button"
        data-action="duplicate"
      >
        Duplicar bloco
      </button>

      <button
        class="btn primary"
        type="button"
        data-action="save"
      >
        Salvar bloco
      </button>

    </div>
  `;
}

function atualizarHistoriaVideoNaPreview() {
  const doc = getPreviewDoc();
  if (!doc) return;

  aplicarEstilosVideoPreview();

  const section = doc.querySelector('.video-call');

  if (!section) return;

  section.setAttribute('data-cms-block-id', 'historia-video');

  const titulo =
    getInput('hist-video-title')?.value ||
    '';

  const texto =
    getInput('hist-video-text')?.value ||
    '';

  const botao =
    getInput('hist-video-button')?.value ||
    '';

  const link =
    getInput('hist-video-link')?.value ||
    '';

  const imagem =
    getInput('hist-video-bg')?.value ||
    '';

  const embed =
    converterYoutubeParaEmbed(link);

  const h2 =
    section.querySelector('h2');

  if (h2) {
    h2.textContent = titulo;
  }

  const p =
    section.querySelector('p');

  if (p) {
    p.textContent = texto;
  }

  const btn =
    section.querySelector('a');

  if (btn) {
    btn.textContent = botao;

    btn.href = '#';

    btn.onclick = (e) => {
      e.preventDefault();

      abrirModalVideo(embed);
    };
  }

  if (imagem) {
    section.style.background = `
      linear-gradient(
        90deg,
        rgba(6,26,53,.92),
        rgba(6,26,53,.82)
      ),
      url("${imagem}")
    `;

    section.style.backgroundSize = 'cover';
    section.style.backgroundPosition = 'center';
  }

  criarModalVideoPreview();
}

function atualizarHistoriaBannerNaPreview() {
  const doc = getPreviewDoc();
  if (!doc) return;

  const hero =
    doc.querySelector('[data-cms-block-id="historia-banner"]') ||
    doc.querySelector('.page-hero.red-hero') ||
    doc.querySelector('.page-hero');

  if (!hero) return;

  hero.setAttribute('data-cms-block-id', 'historia-banner');

  const breadcrumb =
    getInput('hist-banner-breadcrumb')?.value || 'Início › História';

  const titulo =
    getInput('hist-banner-title')?.value || 'Nossa História';

  const texto =
    getInput('hist-banner-text')?.value || '';

  const imagem =
    getInput('hist-banner-image')?.value || '';

  const overlay =
    getInput('hist-banner-overlay')?.value || '0.94';

  const small = hero.querySelector('small');
  const h1 = hero.querySelector('h1');
  const p = hero.querySelector('p');

  if (small) small.textContent = breadcrumb;
  if (h1) h1.textContent = titulo;
  if (p) p.textContent = texto;

  if (imagem) {
    hero.style.background = `
      linear-gradient(
        90deg,
        rgba(185,21,27,${overlay}),
        rgba(6,26,53,.84)
      ),
      url("${imagem}")
    `;

    hero.style.backgroundSize = 'cover';
    hero.style.backgroundPosition = 'center';
  }
}

function montarItemParagrafoHistoria(n, texto = '') {
  return `
    <div class="hist-paragraph-editor" data-hist-paragraph-index="${n}">
      <div class="news-editor-top">
        <strong>Parágrafo ${n}</strong>

        <div class="quick-item-controls">
          <button type="button" class="btn-hist-paragraph-up">↑</button>
          <button type="button" class="btn-hist-paragraph-down">↓</button>
        </div>
      </div>

      <label>Texto do parágrafo</label>
      <textarea id="hist-paragraph-${n}">${texto}</textarea>

      <button class="btn ghost btn-remove-hist-paragraph" type="button">
        Remover parágrafo
      </button>
    </div>
  `;
}

function montarCamposHistoriaTexto(nome) {
  const blocoAtual =
    pageBlocksMap?.historia?.find(b => b.id === 'historia-texto');

  const mongo = blocoAtual?.mongo || {};
  const itensSalvos =
    Array.isArray(mongo.itens)
      ? mongo.itens
      : [];

  const paragrafos = itensSalvos.length
    ? itensSalvos.map(item => item.texto || item.descricao || '')
    : [
        'O Colégio Dom Pedro II - Campus CZS representa uma instituição comprometida com a formação integral dos estudantes, unindo ensino de qualidade, disciplina, civismo, valores humanos e preparação para os desafios da vida.'
      ];

  return `
    <div class="properties-head">
      <h2>Texto Nossa História</h2>
      <span>${nome}</span>
    </div>

    <label>Título</label>
    <input id="hist-text-title" value="${mongo.titulo || 'Nossa História'}">

    <label>Subtítulo opcional</label>
    <input
      id="hist-text-subtitle"
      value="${mongo.subtitulo || ''}"
      placeholder="Ex: Uma trajetória de disciplina, civismo e educação"
    >

    <div id="hist-paragraph-fields">
      ${paragrafos.map((texto, index) =>
        montarItemParagrafoHistoria(index + 1, texto)
      ).join('')}
    </div>

    <button class="btn ghost full" id="btn-add-hist-paragraph" type="button">
      + Adicionar parágrafo
    </button>

    <div class="builder-actions">
      <button class="btn ghost" type="button" data-action="duplicate">Duplicar bloco</button>
      <button class="btn primary" type="button" data-action="save">Salvar bloco</button>
    </div>
  `;
}

function coletarParagrafosHistoria() {
  const campos = [...document.querySelectorAll('.hist-paragraph-editor')];

  return campos.map((box, index) => {
    const i = box.dataset.histParagraphIndex;

    return {
      ordem: index,
      texto: getInput(`hist-paragraph-${i}`)?.value || ''
    };
  }).filter(item => item.texto.trim());
}

function adicionarParagrafoHistoria() {
  const container = document.getElementById('hist-paragraph-fields');
  if (!container) return;

  const novo = Date.now();
  const wrap = document.createElement('div');

  wrap.innerHTML = montarItemParagrafoHistoria(
    novo,
    'Novo parágrafo da história institucional.'
  );

  container.appendChild(wrap.firstElementChild);

  ligarEventosCamposDinamicos();
  atualizarPreview();

  showToast('Parágrafo adicionado.');
}

function atualizarTextoHistoriaNaPreview() {
  const doc = getPreviewDoc();
  if (!doc) return;

  const content = doc.querySelector('.page-content');
  if (!content) return;

  const titulo = getInput('hist-text-title')?.value || 'Nossa História';
  const subtitulo = getInput('hist-text-subtitle')?.value || '';
  const paragrafos = coletarParagrafosHistoria();

  content.innerHTML = `
    <h2>${titulo}</h2>

    ${
      subtitulo
        ? `<p class="hist-subtitle"><strong>${subtitulo}</strong></p>`
        : ''
    }

    ${paragrafos.map(item => `<p>${item.texto}</p>`).join('')}
  `;
}

function montarCamposDirecaoBanner(nome) {
  const blocoAtual =
    pageBlocksMap?.direcao?.find(b => b.id === 'direcao-banner');

  const mongo = blocoAtual?.mongo || {};
  const config = mongo.configuracao || {};

  return `
    <div class="properties-head">
      <h2>Banner da Direção</h2>
      <span>${nome}</span>
    </div>

    <label>Breadcrumb</label>
    <input
      id="direcao-banner-breadcrumb"
      value="${config.breadcrumb || mongo.subtitulo || 'Início › Direção'}"
    >

    <label>Título</label>
    <input
      id="direcao-banner-title"
      value="${mongo.titulo || 'Direção'}"
    >

    <label>Subtítulo</label>
    <textarea id="direcao-banner-text">${mongo.texto || 'Gestão, liderança e compromisso com a educação militar.'}</textarea>

    <label>Imagem de fundo</label>
    <div class="upload-field">
      <input
        id="direcao-banner-image"
        value="${mongo.imagemUrl || ''}"
        placeholder="/uploads/site/banner-direcao.png"
      >

      <button
        class="btn upload btn-upload-direcao-banner"
        type="button"
        data-target="direcao-banner-image"
      >
        Enviar
      </button>
    </div>

    <label>Intensidade do overlay</label>
    <select id="direcao-banner-overlay">
      <option value="0.94" ${String(config.overlay || '0.94') === '0.94' ? 'selected' : ''}>Forte</option>
      <option value="0.82" ${String(config.overlay || '') === '0.82' ? 'selected' : ''}>Médio</option>
      <option value="0.68" ${String(config.overlay || '') === '0.68' ? 'selected' : ''}>Leve</option>
    </select>

    <input type="file" id="upload-file" hidden accept="image/*">

    <div class="builder-actions">
      <button class="btn ghost" type="button" data-action="duplicate">Duplicar bloco</button>
      <button class="btn primary" type="button" data-action="save">Salvar bloco</button>
    </div>
  `;
}

function atualizarDirecaoBannerNaPreview() {
  const doc = getPreviewDoc();
  if (!doc) return;

  const hero =
    doc.querySelector('[data-cms-block-id="direcao-banner"]') ||
    doc.querySelector('.page-hero.red-hero') ||
    doc.querySelector('.page-hero');

  if (!hero) return;

  hero.setAttribute('data-cms-block-id', 'direcao-banner');

  const breadcrumb =
    getInput('direcao-banner-breadcrumb')?.value || 'Início › Direção';

  const titulo =
    getInput('direcao-banner-title')?.value || 'Direção';

  const texto =
    getInput('direcao-banner-text')?.value || '';

  const imagem =
    getInput('direcao-banner-image')?.value || '';

  const overlay =
    getInput('direcao-banner-overlay')?.value || '0.94';

  const small = hero.querySelector('small');
  const h1 = hero.querySelector('h1');
  const p = hero.querySelector('p');

  if (small) small.textContent = breadcrumb;
  if (h1) h1.textContent = titulo;
  if (p) p.textContent = texto;

  if (imagem) {
    hero.style.background = `
      linear-gradient(
        90deg,
        rgba(185,21,27,${overlay}),
        rgba(6,26,53,.84)
      ),
      url("${imagem}")
    `;

    hero.style.backgroundSize = 'cover';
    hero.style.backgroundPosition = 'center';
  }
}

function montarCamposDirecaoIntro(nome) {
  const blocoAtual =
    pageBlocksMap?.direcao?.find(b => b.id === 'direcao-intro');

  const mongo = blocoAtual?.mongo || {};

  return `
    <div class="properties-head">
      <h2>Introdução</h2>
      <span>${nome}</span>
    </div>

    <label>Título</label>
    <input
      id="direcao-intro-title"
      value="${mongo.titulo || 'Equipe Gestora'}"
    >

    <label>Texto</label>
    <textarea id="direcao-intro-text">${mongo.texto || 'A direção do Colégio Dom Pedro II - Campus CZS atua com foco na organização, disciplina, valorização dos profissionais e desenvolvimento integral dos estudantes.'}</textarea>

    <div class="builder-actions">
      <button class="btn ghost" type="button" data-action="duplicate">Duplicar bloco</button>
      <button class="btn primary" type="button" data-action="save">Salvar bloco</button>
    </div>
  `;
}

function atualizarDirecaoIntroNaPreview() {
  const doc = getPreviewDoc();
  if (!doc) return;

  const section =
    doc.querySelector('[data-cms-block-id="direcao-intro"]') ||
    doc.querySelector('.page-intro');

  if (!section) return;

  section.setAttribute('data-cms-block-id', 'direcao-intro');

  const h2 = section.querySelector('h2');
  const p = section.querySelector('p');

  if (h2) h2.textContent = getInput('direcao-intro-title')?.value || 'Equipe Gestora';
  if (p) p.textContent = getInput('direcao-intro-text')?.value || '';
}

function montarItemEquipeDirecao(n, item = {}) {
  return `
    <div class="team-item-editor" data-team-index="${n}">
      <div class="news-editor-top">
        <strong>Membro ${n}</strong>

        <div class="quick-item-controls">
          <button type="button" class="btn-team-up">↑</button>
          <button type="button" class="btn-team-down">↓</button>

          <label style="display:flex;align-items:center;gap:6px;">
            <input type="checkbox" id="team-featured-${n}" ${item.principal ? 'checked' : ''}>
            Principal
          </label>
        </div>
      </div>

      <label>Foto</label>
      <div class="upload-field">
        <input id="team-photo-${n}" value="${item.foto || ''}" placeholder="/uploads/site/direcao.png">
        <button class="btn upload btn-upload-team-photo" type="button" data-target="team-photo-${n}">
          Enviar
        </button>
      </div>

      <label>Cargo</label>
      <input id="team-role-${n}" value="${item.cargo || ''}" placeholder="Ex: Direção Geral">

      <label>Nome</label>
      <input id="team-name-${n}" value="${item.nome || ''}" placeholder="Nome do responsável">

      <label>Descrição</label>
      <textarea id="team-desc-${n}">${item.descricao || ''}</textarea>

      <label>Link do perfil</label>
      <input id="team-link-${n}" value="${item.link || '#'}" placeholder="#">

      <button class="btn ghost btn-remove-team" type="button">
        Remover membro
      </button>
    </div>
  `;
}

function montarCamposDirecaoEquipe(nome) {
  const blocoAtual =
    pageBlocksMap?.direcao?.find(b => b.id === 'direcao-equipe');

  const itensSalvos =
    Array.isArray(blocoAtual?.mongo?.itens)
      ? blocoAtual.mongo.itens
      : [];

  const equipe = itensSalvos.length
    ? itensSalvos.map(item => ({
        principal: item.principal || false,
        foto: item.foto || item.imagem || '',
        cargo: item.cargo || item.funcao || '',
        nome: item.nome || item.titulo || '',
        descricao: item.descricao || item.texto || '',
        link: item.link || '#'
      }))
    : [
        {
          principal: true,
          foto: '',
          cargo: 'Direção Geral',
          nome: '',
          descricao: '',
          link: '#'
        }
      ];

  return `
    <div class="properties-head">
      <h2>Equipe Gestora</h2>
      <span>${nome}</span>
    </div>

    <div id="team-fields">
      ${equipe.map((item, index) =>
        montarItemEquipeDirecao(index + 1, item)
      ).join('')}
    </div>

    <input type="file" id="upload-file" hidden accept="image/*">

    <button class="btn ghost full" id="btn-add-team-member" type="button">
      + Adicionar membro
    </button>

    <div class="builder-actions">
      <button class="btn ghost" type="button" data-action="duplicate">Duplicar bloco</button>
      <button class="btn primary" type="button" data-action="save">Salvar bloco</button>
    </div>
  `;
}

function coletarEquipeDirecao() {
  const campos = [...document.querySelectorAll('.team-item-editor')];

  return campos.map((box, index) => {
    const i = box.dataset.teamIndex;

    return {
      ordem: index,
      principal: getInput(`team-featured-${i}`)?.checked || false,
      foto: getInput(`team-photo-${i}`)?.value || '',
      cargo: getInput(`team-role-${i}`)?.value || '',
      nome: getInput(`team-name-${i}`)?.value || '',
      descricao: getInput(`team-desc-${i}`)?.value || '',
      link: getInput(`team-link-${i}`)?.value || '#'
    };
  }).filter(item => item.nome.trim() || item.cargo.trim());
}

function adicionarMembroEquipeDirecao() {
  const container = document.getElementById('team-fields');
  if (!container) return;

  const novo = Date.now();
  const wrap = document.createElement('div');

  wrap.innerHTML = montarItemEquipeDirecao(novo, {
    principal: false,
    foto: '',
    cargo: 'Novo cargo',
    nome: 'Novo membro',
    descricao: 'Descrição do membro da equipe gestora.',
    link: '#'
  });

  container.appendChild(wrap.firstElementChild);

  ligarEventosCamposDinamicos();
  atualizarPreview();
  showToast('Membro adicionado.');
}

function atualizarEquipeDirecaoNaPreview() {
  const doc = getPreviewDoc();
  if (!doc) return;

  const grid = doc.querySelector('.direction-grid');
  if (!grid) return;

  grid.setAttribute('data-cms-block-id', 'direcao-equipe');

  const equipe = coletarEquipeDirecao();

  grid.innerHTML = equipe.map(item => `
    <article class="direction-card ${item.principal ? 'principal' : ''}">
      <div class="person-photo">
        ${
          item.foto
            ? `<img src="${item.foto}" alt="${item.nome || item.cargo}">`
            : 'Foto'
        }
      </div>

      <div>
        <span>${item.cargo}</span>
        <h3>${item.nome}</h3>
        <p>${item.descricao}</p>

        ${
          item.link && item.link !== '#'
            ? `<a href="${item.link}">Ver perfil →</a>`
            : ''
        }
      </div>
    </article>
  `).join('');
}

function montarCamposDirecaoChamada(nome) {
  const blocoAtual =
    pageBlocksMap?.direcao?.find(b => b.id === 'direcao-chamada');

  const mongo = blocoAtual?.mongo || {};
  const config = mongo.configuracao || {};

  return `
    <div class="properties-head">
      <h2>Chamada Final</h2>
      <span>${nome}</span>
    </div>

    <label>Ícone</label>
    <input
      id="direcao-chamada-icon"
      value="${config.icone || '🎖️'}"
    >

    <label>Título</label>
    <input
      id="direcao-chamada-title"
      value="${mongo.titulo || 'Gestão comprometida com a formação cidadã.'}"
    >

    <label>Texto</label>
    <textarea id="direcao-chamada-text">${mongo.texto || 'Uma equipe dedicada à excelência educacional, à disciplina e ao fortalecimento dos valores institucionais.'}</textarea>

    <label>Texto do botão</label>
    <input
      id="direcao-chamada-button"
      value="${mongo.link?.texto || 'Fale conosco'}"
    >

    <label>Link do botão</label>
    <input
      id="direcao-chamada-link"
      value="${mongo.link?.url || './contato.html'}"
    >

    <label>Imagem de fundo</label>
    <div class="upload-field">
      <input
        id="direcao-chamada-bg"
        value="${mongo.imagemUrl || ''}"
        placeholder="/uploads/site/chamada-direcao.png"
      >

      <button
        class="btn upload btn-upload-direcao-chamada"
        type="button"
        data-target="direcao-chamada-bg"
      >
        Enviar
      </button>
    </div>

    <input type="file" id="upload-file" hidden accept="image/*">

    <div class="builder-actions">
      <button class="btn ghost" type="button" data-action="duplicate">Duplicar bloco</button>
      <button class="btn primary" type="button" data-action="save">Salvar bloco</button>
    </div>
  `;
}

function atualizarDirecaoChamadaNaPreview() {
  const doc = getPreviewDoc();
  if (!doc) return;

  const section =
    doc.querySelector('[data-cms-block-id="direcao-chamada"]') ||
    doc.querySelector('.video-call');

  if (!section) return;

  section.setAttribute('data-cms-block-id', 'direcao-chamada');

  const icon =
    getInput('direcao-chamada-icon')?.value || '🎖️';

  const titulo =
    getInput('direcao-chamada-title')?.value || '';

  const texto =
    getInput('direcao-chamada-text')?.value || '';

  const botao =
    getInput('direcao-chamada-button')?.value || 'Fale conosco';

  const link =
    getInput('direcao-chamada-link')?.value || './contato.html';

  const imagem =
    getInput('direcao-chamada-bg')?.value || '';

  const iconEl =
    section.querySelector('.video-icon') ||
    section.querySelector('span');

  const h2 =
    section.querySelector('h2');

  const p =
    section.querySelector('p');

  const btn =
    section.querySelector('a');

  if (iconEl) iconEl.textContent = icon;
  if (h2) h2.textContent = titulo;
  if (p) p.textContent = texto;

  if (btn) {
    btn.textContent = botao;
    btn.href = link;
  }

  if (imagem) {
    section.style.background = `
      linear-gradient(
        90deg,
        rgba(6,26,53,.92),
        rgba(6,26,53,.80)
      ),
      url("${imagem}")
    `;

    section.style.backgroundSize = 'cover';
    section.style.backgroundPosition = 'center';
  }
}

function montarCamposAlunosBanner(nome) {

  const blocoAtual =
    pageBlocksMap?.alunos?.find(b => b.id === 'alunos-banner');

  const mongo = blocoAtual?.mongo || {};
  const config = mongo.configuracao || {};

  return `
    <div class="properties-head">
      <h2>Banner Corpo de Alunos</h2>
      <span>${nome}</span>
    </div>

    <label>Breadcrumb</label>

    <input
      id="alunos-banner-breadcrumb"
      value="${config.breadcrumb || mongo.subtitulo || 'Início › Corpo de Alunos'}"
    >

    <label>Título</label>

    <input
      id="alunos-banner-title"
      value="${mongo.titulo || 'Corpo de Alunos'}"
    >

    <label>Subtítulo</label>

    <textarea id="alunos-banner-text">${mongo.texto || 'Formação acadêmica, disciplina, liderança e desenvolvimento humano.'}</textarea>

    <label>Imagem de fundo</label>

    <div class="upload-field">

      <input
        id="alunos-banner-image"
        value="${mongo.imagemUrl || ''}"
        placeholder="/uploads/site/banner-corpo-alunos.png"
      >

      <button
        class="btn upload btn-upload-alunos-banner"
        type="button"
        data-target="alunos-banner-image"
      >
        Enviar
      </button>

    </div>

    <label>Intensidade do overlay</label>

    <select id="alunos-banner-overlay">

      <option value="0.94" ${String(config.overlay || '0.94') === '0.94' ? 'selected' : ''}>
        Forte
      </option>

      <option value="0.82" ${String(config.overlay || '') === '0.82' ? 'selected' : ''}>
        Médio
      </option>

      <option value="0.68" ${String(config.overlay || '') === '0.68' ? 'selected' : ''}>
        Leve
      </option>

    </select>

    <input type="file" id="upload-file" hidden accept="image/*">

    <div class="builder-actions">

      <button
        class="btn ghost"
        type="button"
        data-action="duplicate"
      >
        Duplicar bloco
      </button>

      <button
        class="btn primary"
        type="button"
        data-action="save"
      >
        Salvar bloco
      </button>

    </div>
  `;
}

function atualizarAlunosBannerNaPreview() {
  const doc = getPreviewDoc();
  if (!doc) return;

  const hero =
    doc.querySelector('[data-cms-block-id="alunos-banner"]') ||
    doc.querySelector('.page-hero.red-hero') ||
    doc.querySelector('.page-hero');

  if (!hero) return;

  hero.setAttribute('data-cms-block-id', 'alunos-banner');

  const breadcrumb =
    getInput('alunos-banner-breadcrumb')?.value || 'Início › Corpo de Alunos';

  const titulo =
    getInput('alunos-banner-title')?.value || 'Corpo de Alunos';

  const texto =
    getInput('alunos-banner-text')?.value || '';

  const imagem =
    getInput('alunos-banner-image')?.value || '';

  const overlay =
    getInput('alunos-banner-overlay')?.value || '0.94';

  const small = hero.querySelector('small');
  const h1 = hero.querySelector('h1');
  const p = hero.querySelector('p');

  if (small) small.textContent = breadcrumb;
  if (h1) h1.textContent = titulo;
  if (p) p.textContent = texto;

  if (imagem) {
    hero.style.background = `
      linear-gradient(
        90deg,
        rgba(185,21,27,${overlay}),
        rgba(6,26,53,.84)
      ),
      url("${imagem}")
    `;

    hero.style.backgroundSize = 'cover';
    hero.style.backgroundPosition = 'center';
  }
}

function montarCamposAlunosIntro(nome) {

  const blocoAtual =
    pageBlocksMap?.alunos?.find(b => b.id === 'alunos-intro');

  const mongo = blocoAtual?.mongo || {};

  const paragrafos =
    Array.isArray(mongo.paragrafos)
      ? mongo.paragrafos
      : [];

  return `
    <div class="properties-head">
      <h2>Formação Integral</h2>
      <span>${nome}</span>
    </div>

    <label>Título</label>

    <input
      id="alunos-intro-title"
      value="${mongo.titulo || 'Formação Integral'}"
    >

    <label>Parágrafo 1</label>

    <textarea id="alunos-intro-p1">${
      paragrafos[0] ||
      'O Corpo de Alunos do Colégio Dom Pedro II - Campus CZS representa uma comunidade estudantil construída sobre valores de respeito, responsabilidade, organização, ética e compromisso com a sociedade.'
    }</textarea>

    <label>Parágrafo 2</label>

    <textarea id="alunos-intro-p2">${
      paragrafos[1] ||
      'Além do desenvolvimento acadêmico, os estudantes participam de atividades voltadas ao civismo, liderança, convivência social e fortalecimento da cidadania.'
    }</textarea>

    <div class="builder-actions">

      <button
        class="btn ghost"
        type="button"
        data-action="duplicate"
      >
        Duplicar bloco
      </button>

      <button
        class="btn primary"
        type="button"
        data-action="save"
      >
        Salvar bloco
      </button>

    </div>
  `;
}

function atualizarAlunosIntroNaPreview() {
  const doc = getPreviewDoc();
  if (!doc) return;

  const section =
    doc.querySelector('[data-cms-block-id="alunos-intro"]') ||
    doc.querySelector('.page-intro');

  if (!section) return;

  section.setAttribute('data-cms-block-id', 'alunos-intro');

  const h2 = section.querySelector('h2');
  const paragrafos = section.querySelectorAll('p');

  if (h2) h2.textContent = getInput('alunos-intro-title')?.value || 'Formação Integral';

  if (paragrafos[0]) {
    paragrafos[0].textContent = getInput('alunos-intro-p1')?.value || '';
  }

  if (paragrafos[1]) {
    paragrafos[1].textContent = getInput('alunos-intro-p2')?.value || '';
  }
}

function montarItemTagAlunos(n, texto = '') {
  return `
    <div class="student-tag-editor" data-student-tag-index="${n}">
      <div class="cms-field-row">
        <input id="student-tag-${n}" value="${texto}" placeholder="Ex: 🎖️ Disciplina">

        <button type="button" class="btn ghost btn-remove-student-tag">
          Remover
        </button>
      </div>
    </div>
  `;
}

function montarCamposAlunosDestaque(nome) {

  const blocoAtual =
    pageBlocksMap?.alunos?.find(b => b.id === 'alunos-destaque');

  const mongo = blocoAtual?.mongo || {};
  const config = mongo.configuracao || {};

  const tags =
    Array.isArray(config.tags)
      ? config.tags
      : [
          '🎖️ Disciplina',
          '📚 Ensino de qualidade',
          '🏆 Projetos educacionais',
          '🤝 Formação cidadã'
        ];

  return `
    <div class="properties-head">
      <h2>Destaque Institucional</h2>
      <span>${nome}</span>
    </div>

    <label>Etiqueta superior</label>

    <input
      id="alunos-destaque-label"
      value="${config.label || 'Destaque institucional'}"
    >

    <label>Título</label>

    <input
      id="alunos-destaque-title"
      value="${mongo.titulo || 'Disciplina e excelência acadêmica'}"
    >

    <label>Texto</label>

    <textarea id="alunos-destaque-text">${mongo.texto || 'O ambiente escolar promove organização, comprometimento e estímulo ao crescimento pessoal e educacional dos estudantes.'}</textarea>

    <label>Imagem</label>

    <div class="upload-field">

      <input
        id="alunos-destaque-image"
        value="${mongo.imagemUrl || ''}"
        placeholder="/uploads/site/destaque-alunos.png"
      >

      <button
        class="btn upload btn-upload-alunos-destaque"
        type="button"
        data-target="alunos-destaque-image"
      >
        Enviar
      </button>

    </div>

    <label>Marcadores / Tags</label>

    <div id="student-tags-fields">
      ${tags.map((tag, index) =>
        montarItemTagAlunos(index + 1, tag)
      ).join('')}
    </div>

    <input type="file" id="upload-file" hidden accept="image/*">

    <button class="btn ghost full" id="btn-add-student-tag" type="button">
      + Adicionar marcador
    </button>

    <div class="builder-actions">

      <button
        class="btn ghost"
        type="button"
        data-action="duplicate"
      >
        Duplicar bloco
      </button>

      <button
        class="btn primary"
        type="button"
        data-action="save"
      >
        Salvar bloco
      </button>

    </div>
  `;
}

function coletarTagsAlunos() {
  const campos = [...document.querySelectorAll('.student-tag-editor')];

  return campos.map((box, index) => {
    const i = box.dataset.studentTagIndex;

    return {
      ordem: index,
      texto: getInput(`student-tag-${i}`)?.value || ''
    };
  }).filter(item => item.texto.trim());
}

function adicionarTagAlunos() {
  const container = document.getElementById('student-tags-fields');
  if (!container) return;

  const novo = Date.now();
  const wrap = document.createElement('div');

  wrap.innerHTML = montarItemTagAlunos(novo, '✨ Novo marcador');

  container.appendChild(wrap.firstElementChild);

  ligarEventosCamposDinamicos();
  atualizarPreview();

  showToast('Marcador adicionado.');
}

function atualizarAlunosDestaqueNaPreview() {
  const doc = getPreviewDoc();
  if (!doc) return;

  let section =
    doc.querySelector('[data-cms-block-id="alunos-destaque"]') ||
    doc.querySelector('.destaque-institucional-section');

  if (!section) return;

  section.className = 'section destaque-institucional-section';
  section.setAttribute('data-cms-block-id', 'alunos-destaque');

  const label =
    getInput('alunos-destaque-label')?.value ||
    'Destaque institucional';

  const titulo =
    getInput('alunos-destaque-title')?.value || '';

  const texto =
    getInput('alunos-destaque-text')?.value || '';

  const imagem =
    getInput('alunos-destaque-image')?.value || '';

  const tags =
    [...document.querySelectorAll('.student-tag-input')]
      .map(el => el.value.trim())
      .filter(Boolean);

  section.innerHTML = `
    <div class="feature-card">
      ${
        imagem
          ? `
            <div
              class="feature-image"
              style="background-image:url('${imagem}')"
            ></div>
          `
          : ''
      }

      <div class="feature-content">
        <span class="tag">${label}</span>

        <h2>${titulo}</h2>

        <p>${texto}</p>

        ${
          tags.length
            ? `
              <div class="feature-tags">
                ${tags.map(tag => `<span>${tag}</span>`).join('')}
              </div>
            `
            : ''
        }
      </div>
    </div>
  `;
}

function atualizarNoticiasBannerNaPreview() {
  const doc = getPreviewDoc();
  if (!doc) return;

  const hero =
  doc.querySelector('[data-cms-block-id="noticias-banner"]') ||
  doc.querySelector('.news-hero') ||
  doc.querySelector('.internal-page-hero') ||
  doc.querySelector('.page-hero') ||
  doc.querySelector('.hero');

  if (!hero) return;

  const breadcrumb = getInput('noticias-banner-breadcrumb')?.value || 'Início › Notícias';
  const titulo = getInput('noticias-banner-title')?.value || 'Notícias';
  const texto = getInput('noticias-banner-text')?.value || '';
  const imagem = getInput('noticias-banner-image')?.value || '';
  const overlay = getInput('noticias-banner-overlay')?.value || '0.92';

  hero.setAttribute('data-cms-block-id', 'noticias-banner');

  if (imagem) {
    hero.style.background = `
      linear-gradient(
        90deg,
        rgba(6,26,53,${overlay}),
        rgba(185,21,27,.72)
      ),
      url('${imagem}')
    `;
    hero.style.backgroundSize = 'cover';
    hero.style.backgroundPosition = 'center';
  }

  const tag = hero.querySelector('.tag');
  const h1 = hero.querySelector('h1');
  const p = hero.querySelector('p');

  if (tag) tag.textContent = breadcrumb;
  if (h1) h1.textContent = titulo;
  if (p) p.textContent = texto;
}

function aplicarEstilosAlunosDestaquePreview() {
  const doc = getPreviewDoc();

  if (!doc || doc.getElementById('cms-student-highlight-style')) return;

  const style = doc.createElement('style');
  style.id = 'cms-student-highlight-style';

  style.textContent = `
    .cms-student-image-preview {
      overflow: hidden;
    }

    .cms-student-image-preview img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }
  `;

  doc.head.appendChild(style);
}

function montarItemNumeroAlunos(n, item = {}) {
  return `
    <div class="student-number-editor" data-student-number-index="${n}">
      <div class="news-editor-top">
        <strong>Número ${n}</strong>

        <div class="quick-item-controls">
          <button type="button" class="btn-student-number-up">↑</button>
          <button type="button" class="btn-student-number-down">↓</button>
        </div>
      </div>

      <div class="cms-field-row">
        <div>
          <label>Ícone</label>
          <input id="student-number-icon-${n}" value="${item.icon || '👥'}">
        </div>

        <div>
          <label>Número</label>
          <input id="student-number-value-${n}" value="${item.numero || '1.248'}">
        </div>
      </div>

      <label>Texto</label>
      <input id="student-number-label-${n}" value="${item.label || 'Alunos matriculados'}">

      <button class="btn ghost btn-remove-student-number" type="button">
        Remover número
      </button>
    </div>
  `;
}

function montarCamposAlunosNumeros(nome) {
  const blocoAtual =
    pageBlocksMap?.alunos?.find(b => b.id === 'alunos-numeros');

  const mongo = blocoAtual?.mongo || {};

  const itensSalvos =
    Array.isArray(mongo.itens)
      ? mongo.itens
      : [];

  const numeros = itensSalvos.length
    ? itensSalvos.map(item => ({
        icon: item.icon || item.icone || '👥',
        numero: item.numero || item.valor || '',
        label: item.label || item.titulo || item.texto || ''
      }))
    : [
        { icon: '👥', numero: '1.248', label: 'Alunos matriculados' },
        { icon: '🏫', numero: '32', label: 'Turmas ativas' }
      ];

  return `
    <div class="properties-head">
      <h2>Números Institucionais</h2>
      <span>${nome}</span>
    </div>

    <label>Título da seção</label>
    <input
      id="student-numbers-title"
      value="${mongo.titulo || 'Números Institucionais'}"
    >

    <div id="student-numbers-fields">
      ${numeros.map((item, index) =>
        montarItemNumeroAlunos(index + 1, item)
      ).join('')}
    </div>

    <button class="btn ghost full" id="btn-add-student-number" type="button">
      + Adicionar número
    </button>

    <div class="builder-actions">
      <button class="btn ghost" type="button" data-action="duplicate">Duplicar bloco</button>
      <button class="btn primary" type="button" data-action="save">Salvar bloco</button>
    </div>
  `;
}

function coletarNumerosAlunos() {
  const campos = [...document.querySelectorAll('.student-number-editor')];

  return campos.map((box, index) => {
    const i = box.dataset.studentNumberIndex;

    return {
      ordem: index,
      icon: getInput(`student-number-icon-${i}`)?.value || '👥',
      numero: getInput(`student-number-value-${i}`)?.value || '',
      label: getInput(`student-number-label-${i}`)?.value || ''
    };
  }).filter(item => item.numero.trim() || item.label.trim());
}

function adicionarNumeroAlunos() {
  const container = document.getElementById('student-numbers-fields');
  if (!container) return;

  const novo = Date.now();
  const wrap = document.createElement('div');

  wrap.innerHTML = montarItemNumeroAlunos(novo, {
    icon: '📌',
    numero: '100',
    label: 'Novo indicador'
  });

  container.appendChild(wrap.firstElementChild);

  ligarEventosCamposDinamicos();
  atualizarPreview();

  showToast('Número institucional adicionado.');
}

function atualizarAlunosNumerosNaPreview() {
  const doc = getPreviewDoc();
  if (!doc) return;

  const section =
    doc.querySelector('.student-stats')?.closest('.section');

  const grid =
    doc.querySelector('.student-stats');

  if (!section || !grid) return;

  section.setAttribute('data-cms-block-id', 'alunos-numeros');

  const h2 =
    section.querySelector('.section-head h2') ||
    section.querySelector('h2');

  if (h2) {
    h2.textContent = getInput('student-numbers-title')?.value || 'Números Institucionais';
  }

  const numeros = coletarNumerosAlunos();

  grid.innerHTML = numeros.map(item => `
    <div class="student-stat-card">
      <span>${item.icon}</span>
      <strong>${item.numero}</strong>
      <small>${item.label}</small>
    </div>
  `).join('');
}

function montarCamposAlunosChamada(nome) {

  const blocoAtual =
    pageBlocksMap?.alunos?.find(b => b.id === 'alunos-chamada');

  const mongo = blocoAtual?.mongo || {};

  return `
    <div class="properties-head">
      <h2>Chamada Final</h2>
      <span>${nome}</span>
    </div>

    <label>Ícone</label>
    <input
      id="alunos-chamada-icon"
      value="${mongo.icone || mongo.icon || '👥'}"
    >

    <label>Título</label>
    <input
      id="alunos-chamada-title"
      value="${mongo.titulo || 'Alunos preparados para o presente e o futuro.'}"
    >

    <label>Texto</label>
    <textarea id="alunos-chamada-text">${
      mongo.texto || 'Educação baseada em valores, disciplina e compromisso com a sociedade.'
    }</textarea>

    <label>Texto do botão</label>
    <input
      id="alunos-chamada-button"
      value="${mongo.link?.texto || 'Ver galeria estudantil'}"
    >

    <label>Link do botão</label>
    <input
      id="alunos-chamada-link"
      value="${mongo.link?.url || './galeria.html'}"
    >

    <label>Imagem de fundo</label>

    <div class="upload-field">
      <input
        id="alunos-chamada-bg"
        value="${mongo.imagemUrl || ''}"
        placeholder="/uploads/site/chamada-alunos.png"
      >

      <button
        class="btn upload btn-upload-alunos-chamada"
        type="button"
        data-target="alunos-chamada-bg"
      >
        Enviar
      </button>
    </div>

    <input type="file" id="upload-file" hidden accept="image/*">

    <div class="builder-actions">
      <button class="btn ghost" type="button" data-action="duplicate">
        Duplicar bloco
      </button>

      <button class="btn primary" type="button" data-action="save">
        Salvar bloco
      </button>
    </div>
  `;
}

function atualizarAlunosChamadaNaPreview() {
  const doc = getPreviewDoc();
  if (!doc) return;

  const section =
    doc.querySelector('[data-cms-block-id="alunos-chamada"]') ||
    doc.querySelector('.video-call');

  if (!section) return;

  section.setAttribute('data-cms-block-id', 'alunos-chamada');

  const icon =
    getInput('alunos-chamada-icon')?.value || '👥';

  const titulo =
    getInput('alunos-chamada-title')?.value || '';

  const texto =
    getInput('alunos-chamada-text')?.value || '';

  const botao =
    getInput('alunos-chamada-button')?.value || 'Saiba mais';

  const link =
    getInput('alunos-chamada-link')?.value || '#';

  const imagem =
    getInput('alunos-chamada-bg')?.value || '';

  const iconEl =
    section.querySelector('.video-icon') ||
    section.querySelector('span');

  const h2 =
    section.querySelector('h2');

  const p =
    section.querySelector('p');

  const btn =
    section.querySelector('a');

  if (iconEl) iconEl.textContent = icon;
  if (h2) h2.textContent = titulo;
  if (p) p.textContent = texto;

  if (btn) {
    btn.textContent = botao;
    btn.href = link;
  }

  if (imagem) {
    section.style.background = `
      linear-gradient(
        90deg,
        rgba(6,26,53,.92),
        rgba(6,26,53,.80)
      ),
      url("${imagem}")
    `;

    section.style.backgroundSize = 'cover';
    section.style.backgroundPosition = 'center';
  }
}

function montarCamposProcessoBanner(nome) {
  const blocoAtual =
    pageBlocksMap?.['processo-seletivo']?.find(b => b.id === 'processo-banner');

  const mongo = blocoAtual?.mongo || {};
  const config = mongo.configuracao || {};
  const itens = Array.isArray(mongo.itens) ? mongo.itens : [];

  return `
    <div class="properties-head">
      <h2>Banner Processo Seletivo</h2>
      <span>${nome}</span>
    </div>

    <label>Badge 1</label>
    <input id="processo-banner-badge-1" value="${itens[0]?.texto || 'CBMAC'}">

    <label>Badge 2</label>
    <input id="processo-banner-badge-2" value="${itens[1]?.texto || 'CMDPII'}">

    <label>Etiqueta superior</label>
    <input id="processo-banner-tag" value="${config.breadcrumb || mongo.subtitulo || 'Processo de admissão de alunos'}">

    <label>Título</label>
    <textarea id="processo-banner-title">${mongo.titulo || 'Ingresso com disciplina, organização e excelência educacional.'}</textarea>

    <label>Texto</label>
    <textarea id="processo-banner-text">${mongo.texto || 'O processo seletivo do Colégio Dom Pedro II - Campus CZS ocorre de forma transparente e organizada, buscando garantir igualdade de oportunidades aos candidatos.'}</textarea>

    <label>Botão 1</label>
    <div class="cms-field-row">
      <input id="processo-banner-btn1-text" value="${mongo.link?.texto || 'Baixar edital'}" placeholder="Texto">
      <input id="processo-banner-btn1-link" value="${mongo.link?.url || '#'}" placeholder="Link">
    </div>

    <label>Botão 2</label>
    <div class="cms-field-row">
      <input id="processo-banner-btn2-text" value="${itens[2]?.texto || 'Inscrição online'}" placeholder="Texto">
      <input id="processo-banner-btn2-link" value="${itens[2]?.link || '#'}" placeholder="Link">
    </div>

    <label>Imagem de fundo</label>
    <div class="upload-field">
      <input
        id="processo-banner-image"
        value="${mongo.imagemUrl || ''}"
        placeholder="/uploads/site/banner-processo.png"
      >

      <button
        class="btn upload btn-upload-processo-banner"
        type="button"
        data-target="processo-banner-image"
      >
        Enviar
      </button>
    </div>

    <label>Intensidade do overlay</label>
    <select id="processo-banner-overlay">
      <option value="0.90" ${String(config.overlay || '0.90') === '0.90' ? 'selected' : ''}>Forte</option>
      <option value="0.78" ${String(config.overlay || '') === '0.78' ? 'selected' : ''}>Médio</option>
      <option value="0.62" ${String(config.overlay || '') === '0.62' ? 'selected' : ''}>Leve</option>
    </select>

    <input type="file" id="upload-file" hidden accept="image/*">

    <div class="builder-actions">
      <button class="btn ghost" type="button" data-action="duplicate">Duplicar bloco</button>
      <button class="btn primary" type="button" data-action="save">Salvar bloco</button>
    </div>
  `;
}

function atualizarProcessoBannerNaPreview() {
  const doc = getPreviewDoc();
  if (!doc) return;

  const hero =
    doc.querySelector('[data-cms-block-id="processo-banner"]') ||
    doc.querySelector('.selection-hero');

  if (!hero) return;

  hero.setAttribute('data-cms-block-id', 'processo-banner');

  const badge1 = getInput('processo-banner-badge-1')?.value || 'CBMAC';
  const badge2 = getInput('processo-banner-badge-2')?.value || 'CMDPII';
  const tag = getInput('processo-banner-tag')?.value || '';
  const titulo = getInput('processo-banner-title')?.value || '';
  const texto = getInput('processo-banner-text')?.value || '';
  const btn1Text = getInput('processo-banner-btn1-text')?.value || 'Baixar edital';
  const btn1Link = getInput('processo-banner-btn1-link')?.value || '#';
  const btn2Text = getInput('processo-banner-btn2-text')?.value || 'Inscrição online';
  const btn2Link = getInput('processo-banner-btn2-link')?.value || '#';
  const imagem = getInput('processo-banner-image')?.value || '';
  const overlay = getInput('processo-banner-overlay')?.value || '0.90';

  const badges = hero.querySelectorAll('.mini-badge');
  if (badges[0]) badges[0].textContent = badge1;
  if (badges[1]) badges[1].textContent = badge2;

  const tagEl = hero.querySelector('.selection-tag');
  const h1 = hero.querySelector('h1');
  const p = hero.querySelector('p');
  const buttons = hero.querySelectorAll('.selection-buttons a');

  if (tagEl) tagEl.textContent = tag;
  if (h1) h1.textContent = titulo;
  if (p) p.textContent = texto;

  if (buttons[0]) {
    buttons[0].textContent = btn1Text;
    buttons[0].href = btn1Link;
  }

  if (buttons[1]) {
    buttons[1].textContent = btn2Text;
    buttons[1].href = btn2Link;
  }

  if (imagem) {
    hero.style.background = `
      linear-gradient(
        90deg,
        rgba(6,26,53,${overlay}),
        rgba(6,26,53,.76),
        rgba(185,21,27,.38)
      ),
      url("${imagem}")
    `;

    hero.style.backgroundSize = 'cover';
    hero.style.backgroundPosition = 'center';
  }
}

function montarItemEtapaProcesso(n, item = {}) {
  return `
    <div class="process-step-editor" data-process-step-index="${n}">
      <div class="news-editor-top">
        <strong>Etapa ${n}</strong>

        <div class="quick-item-controls">
          <button type="button" class="btn-process-step-up">↑</button>
          <button type="button" class="btn-process-step-down">↓</button>
        </div>
      </div>

      <label>Número</label>
      <input id="process-step-number-${n}" value="${item.numero || String(n).padStart(2, '0')}">

      <label>Título</label>
      <input id="process-step-title-${n}" value="${item.titulo || ''}">

      <label>Descrição</label>
      <textarea id="process-step-text-${n}">${item.texto || ''}</textarea>

      <button class="btn ghost btn-remove-process-step" type="button">
        Remover etapa
      </button>
    </div>
  `;
}

function montarCamposProcessoEtapas(nome) {
  const etapas = [
    {
      numero: '01',
      titulo: 'Publicação do edital',
      texto: 'Divulgação oficial das regras, vagas, cronograma e critérios do processo seletivo.'
    },
    {
      numero: '02',
      titulo: 'Inscrições',
      texto: 'Período destinado à inscrição dos candidatos conforme orientações do edital.'
    },
    {
      numero: '03',
      titulo: 'Aplicação da prova',
      texto: 'Realização das avaliações conforme datas definidas pela comissão organizadora.'
    },
    {
      numero: '04',
      titulo: 'Resultado final',
      texto: 'Divulgação oficial dos candidatos aprovados e orientações para matrícula.'
    }
  ];

  return `
    <div class="properties-head">
      <h2>Etapas do Processo</h2>
      <span>${nome}</span>
    </div>

    <label>Título da seção</label>
    <input id="process-steps-section-title" value="Etapas do Processo">

    <div id="process-steps-fields">
      ${etapas.map((item, index) => montarItemEtapaProcesso(index + 1, item)).join('')}
    </div>

    <button class="btn ghost full" id="btn-add-process-step" type="button">
      + Adicionar etapa
    </button>

    <div class="builder-actions">
      <button class="btn ghost" type="button" data-action="duplicate">Duplicar bloco</button>
      <button class="btn primary" type="button" data-action="save">Salvar bloco</button>
    </div>
  `;
}

function coletarEtapasProcesso() {
  const campos = [...document.querySelectorAll('.process-step-editor')];

  return campos.map((box, index) => {
    const i = box.dataset.processStepIndex;

    return {
      ordem: index,
      numero: getInput(`process-step-number-${i}`)?.value || String(index + 1).padStart(2, '0'),
      titulo: getInput(`process-step-title-${i}`)?.value || '',
      texto: getInput(`process-step-text-${i}`)?.value || ''
    };
  }).filter(item => item.titulo.trim() || item.texto.trim());
}

function adicionarEtapaProcesso() {
  const container = document.getElementById('process-steps-fields');
  if (!container) return;

  const novo = Date.now();
  const quantidade = document.querySelectorAll('.process-step-editor').length + 1;

  const wrap = document.createElement('div');

  wrap.innerHTML = montarItemEtapaProcesso(novo, {
    numero: String(quantidade).padStart(2, '0'),
    titulo: 'Nova etapa',
    texto: 'Descrição da nova etapa do processo seletivo.'
  });

  const novoItem = wrap.firstElementChild;

  container.appendChild(novoItem);

  ligarEventosProcessoEtapasDoNovoItem(novoItem);
  atualizarPreview();

  showToast('Etapa adicionada.');
}

function ligarEventosProcessoEtapasDoNovoItem(item) {
  if (!item) return;

  item
    .querySelectorAll('input, textarea, select')
    .forEach(el => {
      el.addEventListener('input', atualizarPreview);
      el.addEventListener('change', atualizarPreview);
    });

  item.querySelector('.btn-remove-process-step')?.addEventListener('click', () => {
    item.remove();
    atualizarPreview();
    showToast('Etapa removida.');
  });

  item.querySelector('.btn-process-step-up')?.addEventListener('click', () => {
    const prev = item.previousElementSibling;

    if (prev) {
      item.parentNode.insertBefore(item, prev);
      atualizarPreview();
    }
  });

  item.querySelector('.btn-process-step-down')?.addEventListener('click', () => {
    const next = item.nextElementSibling;

    if (next) {
      item.parentNode.insertBefore(next, item);
      atualizarPreview();
    }
  });
}

function atualizarProcessoEtapasNaPreview() {
  const doc = getPreviewDoc();
  if (!doc) return;

  const section =
    doc.querySelector('.steps-grid')?.closest('.section');

  const grid =
    doc.querySelector('.steps-grid');

  if (!section || !grid) return;

  section.setAttribute('data-cms-block-id', 'processo-etapas');

  const h2 =
    section.querySelector('.section-head h2') ||
    section.querySelector('h2');

  if (h2) {
    h2.textContent =
      getInput('process-steps-section-title')?.value ||
      'Etapas do Processo';
  }

  const etapas = coletarEtapasProcesso();

  grid.innerHTML = etapas.map(item => `
    <article class="step-card">
      <div class="step-number">${item.numero}</div>
      <h3>${item.titulo}</h3>
      <p>${item.texto}</p>
    </article>
  `).join('');
}

function montarItemCronogramaProcesso(n, item = {}) {
  return `
    <div class="process-schedule-editor" data-process-schedule-index="${n}">
      <div class="news-editor-top">
        <strong>Item ${n}</strong>

        <div class="quick-item-controls">
          <button type="button" class="btn-process-schedule-up">↑</button>
          <button type="button" class="btn-process-schedule-down">↓</button>
        </div>
      </div>

      <label>Etapa</label>
      <input id="process-schedule-stage-${n}" value="${item.etapa || ''}">

      <label>Data / Período</label>
      <input id="process-schedule-date-${n}" value="${item.data || ''}">

      <button class="btn ghost btn-remove-process-schedule" type="button">
        Remover item
      </button>
    </div>
  `;
}

function montarCamposProcessoCronograma(nome) {
  const itens = [
    { etapa: 'Publicação do edital', data: '10/08/2026' },
    { etapa: 'Período de inscrição', data: '12/08/2026 a 30/08/2026' },
    { etapa: 'Divulgação dos locais de prova', data: '05/09/2026' },
    { etapa: 'Aplicação da prova', data: '15/09/2026' },
    { etapa: 'Resultado preliminar', data: '25/09/2026' },
    { etapa: 'Resultado final', data: '30/09/2026' }
  ];

  return `
    <div class="properties-head">
      <h2>Cronograma</h2>
      <span>${nome}</span>
    </div>

    <label>Título da seção</label>
    <input id="process-schedule-section-title" value="Cronograma">

    <div id="process-schedule-fields">
      ${itens.map((item, index) => montarItemCronogramaProcesso(index + 1, item)).join('')}
    </div>

    <button class="btn ghost full" id="btn-add-process-schedule" type="button">
      + Adicionar item do cronograma
    </button>

    <div class="builder-actions">
      <button class="btn ghost" type="button" data-action="duplicate">Duplicar bloco</button>
      <button class="btn primary" type="button" data-action="save">Salvar bloco</button>
    </div>
  `;
}

function coletarCronogramaProcesso() {
  const campos = [...document.querySelectorAll('.process-schedule-editor')];

  return campos.map((box, index) => {
    const i = box.dataset.processScheduleIndex;

    return {
      ordem: index,
      etapa: getInput(`process-schedule-stage-${i}`)?.value || '',
      data: getInput(`process-schedule-date-${i}`)?.value || ''
    };
  }).filter(item => item.etapa.trim() || item.data.trim());
}

function coletarSlidesHomeBanner() {

  const slides = [];

  document
    .querySelectorAll('.home-banner-slide')
    .forEach((item, index) => {

      slides.push({
        ordem: index,

        titulo:
          item.querySelector('.slide-title')?.value || '',

        texto:
          item.querySelector('.slide-text')?.value || '',

        imagemUrl:
          item.querySelector('.slide-image')?.value || '',

        botaoTexto:
          item.querySelector('.slide-button-text')?.value || '',

        botaoLink:
          item.querySelector('.slide-button-link')?.value || ''
      });

    });

  return slides;
}

function adicionarSlideHomeBanner() {
  const container = document.getElementById('home-banner-slides');
  if (!container) return;

  const n = Date.now();

  const wrap = document.createElement('div');

  wrap.innerHTML = `
    <div class="home-banner-slide" data-slide-index="${n}">
      <div class="news-editor-top">
        <strong>Novo slide</strong>

        <div class="quick-item-controls">
          <button type="button" class="btn-remove-home-banner-slide">
            Remover
          </button>
        </div>
      </div>

      <label>Título do slide</label>
      <input
        class="slide-title"
        value="Novo destaque institucional"
        placeholder="Título do banner"
      >

      <label>Texto do slide</label>
      <textarea
        class="slide-text"
        placeholder="Texto de apoio do banner"
      >Descreva aqui a atividade, campanha ou comunicado em destaque.</textarea>

      <label>Texto do botão</label>
      <input
        class="slide-button-text"
        value="Saiba mais"
        placeholder="Texto do botão"
      >

      <label>Link do botão</label>
      <input
        class="slide-button-link"
        value="#"
        placeholder="./noticias.html"
      >

      <label>Imagem de fundo</label>
      <div class="upload-field">
        <input
          class="slide-image"
          id="home-banner-slide-image-${n}"
          value=""
          placeholder="/uploads/site/banner-home.png"
        >

        <button
          class="btn ghost btn-open-media-picker"
          type="button"
          data-target="home-banner-slide-image-${n}"
        >
          Biblioteca
        </button>
      </div>
    </div>
  `;

  container.appendChild(wrap.firstElementChild);

  ligarEventosCamposDinamicos();
  atualizarPreview();

  showToast('Slide adicionado.');
}

function adicionarCronogramaProcesso() {
  const container = document.getElementById('process-schedule-fields');
  if (!container) return;

  const novo = Date.now();
  const wrap = document.createElement('div');

  wrap.innerHTML = montarItemCronogramaProcesso(novo, {
    etapa: 'Nova etapa',
    data: 'Definir data'
  });

  container.appendChild(wrap.firstElementChild);

  ligarEventosCamposDinamicos();
  atualizarPreview();

  showToast('Item do cronograma adicionado.');
}

function atualizarProcessoCronogramaNaPreview() {
  const doc = getPreviewDoc();
  if (!doc) return;

  const section =
    doc.querySelector('.schedule-table')?.closest('.section');

  const tabela =
    doc.querySelector('.schedule-table');

  if (!section || !tabela) return;

  section.setAttribute('data-cms-block-id', 'processo-cronograma');

  const h2 =
    section.querySelector('.section-head h2') ||
    section.querySelector('h2');

  if (h2) {
    h2.textContent =
      getInput('process-schedule-section-title')?.value ||
      'Cronograma';
  }

  const itens = coletarCronogramaProcesso();

  tabela.innerHTML = `
    <div class="schedule-row header">
      <div>Etapa</div>
      <div>Data</div>
    </div>

    ${itens.map(item => `
      <div class="schedule-row">
        <div>${item.etapa}</div>
        <div>${item.data}</div>
      </div>
    `).join('')}
  `;
}

function montarItemEditalProcesso(n, item = {}) {
  return `
    <div class="process-edital-editor" data-process-edital-index="${n}">
      <div class="news-editor-top">
        <strong>Documento ${n}</strong>

        <div class="quick-item-controls">
          <button type="button" class="btn-process-edital-up">↑</button>
          <button type="button" class="btn-process-edital-down">↓</button>
        </div>
      </div>

      <label>Categoria</label>
      <select id="process-edital-category-${n}">
  <option value="Edital" ${(item.categoria || 'Edital') === 'Edital' ? 'selected' : ''}>Edital</option>
  <option value="Retificações" ${item.categoria === 'Retificações' ? 'selected' : ''}>Retificações</option>
  <option value="Inscrições" ${item.categoria === 'Inscrições' ? 'selected' : ''}>Inscrições</option>
  <option value="Homologação" ${item.categoria === 'Homologação' ? 'selected' : ''}>Homologação</option>
  <option value="Locais de Prova" ${item.categoria === 'Locais de Prova' ? 'selected' : ''}>Locais de Prova</option>
  <option value="Gabaritos" ${item.categoria === 'Gabaritos' ? 'selected' : ''}>Gabaritos</option>
  <option value="Recursos" ${item.categoria === 'Recursos' ? 'selected' : ''}>Recursos</option>
  <option value="Resultado Preliminar" ${item.categoria === 'Resultado Preliminar' ? 'selected' : ''}>Resultado Preliminar</option>
  <option value="Resultado Final" ${item.categoria === 'Resultado Final' ? 'selected' : ''}>Resultado Final</option>
  <option value="Convocação" ${item.categoria === 'Convocação' ? 'selected' : ''}>Convocação</option>
  <option value="Matrícula" ${item.categoria === 'Matrícula' ? 'selected' : ''}>Matrícula</option>
  <option value="Documentos" ${item.categoria === 'Documentos' ? 'selected' : ''}>Documentos</option>
</select>

      <label>Ícone</label>
      <input id="process-edital-icon-${n}" value="${item.icon || '📄'}">

      <label>Título</label>
      <input id="process-edital-title-${n}" value="${item.titulo || ''}">

      <label>Texto menor</label>
      <input id="process-edital-small-${n}" value="${item.texto || 'Baixar PDF'}">

      <label>Link do arquivo</label>
      <div class="upload-field">

  <input
    id="process-edital-link-${n}"
    value="${item.link || item.url || '#'}"
    placeholder="/uploads/site/edital.pdf"
  >

  <button
    class="btn upload btn-upload-process-edital"
    type="button"
    data-target="process-edital-link-${n}"
  >
    Enviar
  </button>

</div>
        <button
          class="btn upload btn-upload-process-edital"
          type="button"
          data-target="process-edital-link-${n}"
        >
          Enviar
        </button>
      </div>

      <button class="btn ghost btn-remove-process-edital" type="button">
        Remover documento
      </button>
    </div>
  `;
}

function montarCamposProcessoEditais(nome) {
  const blocoAtual =
    pageBlocksMap?.['processo-seletivo']?.find(b => b.id === 'processo-editais');

  const mongo = blocoAtual?.mongo || {};

  const editais =
    Array.isArray(mongo.itens) && mongo.itens.length
      ? mongo.itens.map(item => ({
          icon: item.icon || item.icone || '📄',
          titulo: item.titulo || '',
          texto: item.texto || 'Baixar PDF',
          link: item.link || item.url || '#'
        }))
      : [
          { icon: '📄', titulo: 'Edital 2025/2026', texto: 'Baixar PDF', link: '#' },
          { icon: '📄', titulo: 'Edital 2024/2025', texto: 'Baixar PDF', link: '#' },
          { icon: '📄', titulo: 'Edital 2023/2024', texto: 'Baixar PDF', link: '#' },
          { icon: '📄', titulo: 'Edital 2022/2023', texto: 'Baixar PDF', link: '#' }
        ];

  return `
    <div class="properties-head">
      <h2>Editais Anteriores</h2>
      <span>${nome}</span>
    </div>

    <label>Título da seção</label>
    <input id="process-edital-section-title" value="${mongo.titulo || 'Editais anteriores'}">

    <div id="process-edital-fields">
      ${editais.map((item, index) =>
        montarItemEditalProcesso(index + 1, item)
      ).join('')}
    </div>

    <input type="file" id="upload-file" hidden accept=".pdf,.doc,.docx,image/*">

    <button class="btn ghost full" id="btn-add-process-edital" type="button">
      + Adicionar edital
    </button>

    <div class="builder-actions">
      <button class="btn ghost" type="button" data-action="duplicate">Duplicar bloco</button>
      <button class="btn primary" type="button" data-action="save">Salvar bloco</button>
    </div>
  `;
}

function coletarEditaisProcesso() {
  const campos = [...document.querySelectorAll('.process-edital-editor')];

  return campos.map((box, index) => {
    const i = box.dataset.processEditalIndex;

    return {
      ordem: index,
      icon: getInput(`process-edital-icon-${i}`)?.value || '📄',
      categoria: getInput(`process-edital-category-${i}`)?.value || 'Editais',
      titulo: getInput(`process-edital-title-${i}`)?.value || '',
      texto: getInput(`process-edital-small-${i}`)?.value || 'Baixar PDF',
      link: getInput(`process-edital-link-${i}`)?.value || '#'
    };
  }).filter(item => item.titulo.trim());
}

function adicionarEditalProcesso() {
  const container = document.getElementById('process-edital-fields');
  if (!container) return;

  const novo = Date.now();
  const wrap = document.createElement('div');

  wrap.innerHTML = montarItemEditalProcesso(novo, {
    icon: '📄',
    titulo: 'Novo edital',
    texto: 'Baixar PDF',
    link: '#'
  });

  const novoItem = wrap.firstElementChild;

  container.appendChild(novoItem);

  ligarEventosProcessoEditalDoNovoItem(novoItem);
  atualizarPreview();

  showToast('Edital adicionado.');
}

function ligarEventosProcessoEditalDoNovoItem(item) {
  if (!item) return;

  item
    .querySelectorAll('input, textarea, select')
    .forEach(el => {
      el.addEventListener('input', atualizarPreview);
      el.addEventListener('change', atualizarPreview);
    });

  item.querySelector('.btn-upload-process-edital')?.addEventListener('click', () => {
    cmsUploadTarget = item.querySelector('.btn-upload-process-edital')?.dataset.target;
    document.getElementById('upload-file')?.click();
  });

  item.querySelector('.btn-remove-process-edital')?.addEventListener('click', () => {
    item.remove();
    atualizarPreview();
    showToast('Edital removido.');
  });

  item.querySelector('.btn-process-edital-up')?.addEventListener('click', () => {
    const prev = item.previousElementSibling;

    if (prev) {
      item.parentNode.insertBefore(item, prev);
      atualizarPreview();
    }
  });

  item.querySelector('.btn-process-edital-down')?.addEventListener('click', () => {
    const next = item.nextElementSibling;

    if (next) {
      item.parentNode.insertBefore(next, item);
      atualizarPreview();
    }
  });
}

function atualizarProcessoEditaisNaPreview() {
  const doc = getPreviewDoc();
  if (!doc) return;

  const section =
    doc.querySelector('.notice-grid')?.closest('.section');

  const grid =
    doc.querySelector('.notice-grid');

  if (!section || !grid) return;

  section.setAttribute('data-cms-block-id', 'processo-editais');

  const h2 =
    section.querySelector('.section-head h2') ||
    section.querySelector('h2');

  if (h2) {
    h2.textContent =
      getInput('process-edital-section-title')?.value ||
      'Editais anteriores';
  }

  const editais = coletarEditaisProcesso();

  grid.innerHTML = editais.map(item => `
    <a href="${item.link || '#'}" class="notice-card" target="_blank">
      <span>${item.icon}</span>
      <strong>${item.titulo}</strong>
      <small>${item.texto}</small>
    </a>
  `).join('');
}

function montarCamposProcessoChamada(nome) {
  const blocoAtual =
    pageBlocksMap?.['processo-seletivo']?.find(b => b.id === 'processo-chamada');

  const mongo = blocoAtual?.mongo || {};
  const config = mongo.configuracao || {};

  return `
    <div class="properties-head">
      <h2>Chamada de Inscrição</h2>
      <span>${nome}</span>
    </div>

    <label>Ícone</label>
    <input id="processo-chamada-icon" value="${config.icone || '🎖️'}">

    <label>Título</label>
    <textarea id="processo-chamada-title">${mongo.titulo || 'Formação baseada em disciplina, cidadania e excelência.'}</textarea>

    <label>Texto</label>
    <textarea id="processo-chamada-text">${mongo.texto || 'Faça parte de uma instituição comprometida com o futuro educacional e humano dos estudantes.'}</textarea>

    <label>Texto do botão</label>
    <input id="processo-chamada-button" value="${mongo.link?.texto || 'Realizar inscrição'}">

    <label>Link do botão</label>
    <input id="processo-chamada-link" value="${mongo.link?.url || '#'}">

    <label>Imagem de fundo</label>
    <div class="upload-field">
      <input
        id="processo-chamada-bg"
        value="${mongo.imagemUrl || ''}"
        placeholder="/uploads/site/chamada-processo.png"
      >

      <button
        class="btn upload btn-upload-processo-chamada"
        type="button"
        data-target="processo-chamada-bg"
      >
        Enviar
      </button>
    </div>

    <input type="file" id="upload-file" hidden accept="image/*">

    <div class="builder-actions">
      <button class="btn ghost" type="button" data-action="duplicate">Duplicar bloco</button>
      <button class="btn primary" type="button" data-action="save">Salvar bloco</button>
    </div>
  `;
}

function atualizarProcessoChamadaNaPreview() {
  const doc = getPreviewDoc();
  if (!doc) return;

  const section =
    doc.querySelector('[data-cms-block-id="processo-chamada"]') ||
    doc.querySelector('.selection-banner');

  if (!section) return;

  section.setAttribute('data-cms-block-id', 'processo-chamada');

  const icon =
    getInput('processo-chamada-icon')?.value || '🎖️';

  const titulo =
    getInput('processo-chamada-title')?.value || '';

  const texto =
    getInput('processo-chamada-text')?.value || '';

  const botao =
    getInput('processo-chamada-button')?.value || 'Realizar inscrição';

  const link =
    getInput('processo-chamada-link')?.value || '#';

  const imagem =
    getInput('processo-chamada-bg')?.value || '';

  const iconEl =
    section.querySelector('.selection-banner-icon') ||
    section.querySelector('span');

  const h2 = section.querySelector('h2');
  const p = section.querySelector('p');
  const btn = section.querySelector('a');

  if (iconEl) iconEl.textContent = icon;
  if (h2) h2.textContent = titulo;
  if (p) p.textContent = texto;

  if (btn) {
    btn.textContent = botao;
    btn.href = link;
  }

  if (imagem) {
    section.style.background = `
      linear-gradient(
        90deg,
        rgba(6,26,53,.92),
        rgba(6,26,53,.80)
      ),
      url("${imagem}")
    `;

    section.style.backgroundSize = 'cover';
    section.style.backgroundPosition = 'center';
  }
}

function montarCamposNoticiasBanner(nome) {

  const blocoAtual =
    pageBlocksMap?.noticias?.find(b => b.id === 'noticias-banner');

  const mongo = blocoAtual?.mongo || {};

  return `
    <div class="properties-head">
      <h2>Banner Notícias</h2>
      <span>${nome}</span>
    </div>

    <label>Breadcrumb</label>

    <input
      id="noticias-banner-breadcrumb"
      value="${mongo.breadcrumb || 'Início › Notícias'}"
    >

    <label>Título</label>

    <input
      id="noticias-banner-title"
      value="${mongo.titulo || 'Notícias'}"
    >

    <label>Subtítulo</label>

    <textarea id="noticias-banner-text">${
      mongo.texto || 'Informações, comunicados e destaques institucionais.'
    }</textarea>

    <label>Imagem de fundo</label>

    <div class="upload-field">
      <input
        id="noticias-banner-image"
        value="${mongo.imagemUrl || ''}"
        placeholder="/uploads/site/banner-noticias.png"
      >

      <button
        class="btn upload btn-upload-noticias-banner"
        type="button"
        data-target="noticias-banner-image"
      >
        Enviar
      </button>
    </div>

    <label>Intensidade do overlay</label>

    <select id="noticias-banner-overlay">
      <option value="0.92" ${mongo.overlay === '0.92' ? 'selected' : ''}>
        Forte
      </option>

      <option value="0.78" ${mongo.overlay === '0.78' ? 'selected' : ''}>
        Médio
      </option>

      <option value="0.62" ${mongo.overlay === '0.62' ? 'selected' : ''}>
        Leve
      </option>
    </select>

    <input type="file" id="upload-file" hidden accept="image/*">

    <div class="builder-actions">

      <button class="btn ghost" type="button" data-action="duplicate">
        Duplicar bloco
      </button>

      <button class="btn primary" type="button" data-action="save">
        Salvar bloco
      </button>

    </div>
  `;
}

function montarItemListaNoticias(n, item = {}) {
  return `
    <div class="news-list-editor" data-news-list-index="${n}">
      <div class="news-editor-top">
        <strong>Notícia ${n}</strong>

        <div class="quick-item-controls">
          <button type="button" class="btn-news-list-up">↑</button>
          <button type="button" class="btn-news-list-down">↓</button>

          <label style="display:flex;align-items:center;gap:6px;">
            <input type="checkbox" id="news-list-featured-${n}" ${item.destaque ? 'checked' : ''}>
            Destaque
          </label>
        </div>
      </div>

      <label>Imagem</label>
      <div class="upload-field">
        <input id="news-list-image-${n}" value="${item.imagem || ''}" placeholder="/uploads/site/noticia.png">

        <button
          class="btn upload btn-upload-news-list"
          type="button"
          data-target="news-list-image-${n}"
        >
          Enviar
        </button>
      </div>

      <label>Categoria / Etiqueta</label>
      <input id="news-list-tag-${n}" value="${item.tag || ''}" placeholder="Ex: Destaque">

      <label>Data</label>
      <input id="news-list-date-${n}" value="${item.data || ''}" placeholder="15 de maio de 2026">

      <label>Título</label>
      <input id="news-list-title-${n}" value="${item.titulo || ''}">

      <label>Resumo</label>
      <textarea id="news-list-text-${n}">${item.texto || ''}</textarea>

      <label>Texto do link</label>
      <input id="news-list-link-text-${n}" value="${item.linkTexto || 'Ler notícia →'}">

      <label>Link</label>
      <input id="news-list-link-${n}" value="${item.link || './pagina-noticia.html'}">

      <button class="btn ghost btn-remove-news-list" type="button">
        Remover notícia
      </button>
    </div>
  `;
}

function montarCamposNoticiasLista(nome) {
  const blocoAtual =
    pageBlocksMap?.noticias?.find(b => b.id === 'noticias-lista');

  const mongo = blocoAtual?.mongo || {};
  const config = mongo.configuracao || {};

  return `
    <div class="properties-head">
      <h2>Lista de Notícias</h2>
      <span>${nome}</span>
    </div>

    <div class="cms-alert-info">
      As notícias exibidas aqui vêm da aba Notícias. Este bloco controla apenas como elas aparecem na página.
    </div>

    <label>Título da seção</label>
    <input
      id="news-list-section-title"
      value="${mongo.titulo || 'Notícias'}"
    >

    <label>Texto de apoio</label>
    <textarea id="news-list-section-text">${
      mongo.texto || 'Informações, comunicados e destaques institucionais.'
    }</textarea>

    <div class="cms-field-row">
      <div>
        <label>Quantidade de notícias</label>
        <input
          id="news-list-limit"
          type="number"
          min="1"
          max="20"
          value="${config.limite ?? 6}"
        >
      </div>

      <div>
        <label>Categoria</label>
        <input
          id="news-list-category-filter"
          value="${config.categoria || ''}"
          placeholder="Todas"
        >
      </div>
    </div>

    <div class="cms-field-row">
      <label>
        <input
          type="checkbox"
          id="news-list-only-published"
          ${config.somentePublicadas !== false ? 'checked' : ''}
        >
        Mostrar somente publicadas
      </label>

      <label>
        <input
          type="checkbox"
          id="news-list-featured-first"
          ${config.destaquesPrimeiro !== false ? 'checked' : ''}
        >
        Destaques primeiro
      </label>
    </div>

    <label>Texto do botão</label>
    <input
      id="news-list-button-text"
      value="${config.textoBotao || 'Ler notícia →'}"
    >

    <div class="builder-actions">
      <button class="btn ghost" type="button" data-action="duplicate">
        Duplicar bloco
      </button>

      <button class="btn primary" type="button" data-action="save">
        Salvar bloco
      </button>
    </div>
  `;
}

function coletarListaNoticias() {
  const campos = [...document.querySelectorAll('.news-list-editor')];

  return campos.map((box, index) => {
    const i = box.dataset.newsListIndex;

    return {
      ordem: index,
      destaque: getInput(`news-list-featured-${i}`)?.checked || false,
      imagem: getInput(`news-list-image-${i}`)?.value || '',
      tag: getInput(`news-list-tag-${i}`)?.value || '',
      data: getInput(`news-list-date-${i}`)?.value || '',
      titulo: getInput(`news-list-title-${i}`)?.value || '',
      texto: getInput(`news-list-text-${i}`)?.value || '',
      linkTexto: getInput(`news-list-link-text-${i}`)?.value || 'Ler notícia →',
      link: getInput(`news-list-link-${i}`)?.value || './pagina-noticia.html'
    };
  }).filter(item => item.titulo.trim());
}

function adicionarNoticiaLista() {
  const container = document.getElementById('news-list-fields');
  if (!container) return;

  const novo = Date.now();
  const wrap = document.createElement('div');

  wrap.innerHTML = montarItemListaNoticias(novo, {
    destaque: false,
    imagem: '',
    tag: '',
    data: 'Nova data',
    titulo: 'Nova notícia',
    texto: 'Resumo da nova notícia institucional.',
    linkTexto: 'Ler notícia →',
    link: './pagina-noticia.html'
  });

  container.appendChild(wrap.firstElementChild);

  ligarEventosCamposDinamicos();
  atualizarPreview();

  showToast('Notícia adicionada.');
}

async function atualizarNoticiasListaNaPreview() {
  const doc = getPreviewDoc();
  if (!doc) return;

  const section =
    doc.querySelector('[data-cms-block-id="noticias-lista"]') ||
    doc.querySelector('.news-page');

  if (!section) return;

  section.setAttribute('data-cms-block-id', 'noticias-lista');

  const lista =
    section.querySelector('.news-list');

  if (!lista) return;

  lista.innerHTML = `
    <div class="empty-state">
      Carregando notícias cadastradas...
    </div>
  `;

  try {
    const res = await fetch(`${API_ADMIN}/noticias`, {
      headers: {
        Authorization: `Bearer ${localStorage.getItem('site_cms_token')}`
      }
    });

    const data = await res.json();

    let noticias = Array.isArray(data.noticias)
      ? data.noticias
      : [];

    const onlyPublished =
      getInput('news-list-only-published')?.checked ?? true;

    const featuredFirst =
      getInput('news-list-featured-first')?.checked ?? true;

    const categoria =
      String(getInput('news-list-category-filter')?.value || '')
        .trim()
        .toLowerCase();

    const limite =
      Number(getInput('news-list-limit')?.value || 6);

    const btnText =
      getInput('news-list-button-text')?.value || 'Ler notícia →';

    if (onlyPublished) {
      noticias = noticias.filter(n => {
        const status = String(n.status || '').trim().toLowerCase();

        return (
          !status ||
          status === 'publicada' ||
          status === 'publicado' ||
          status === 'ativo' ||
          status === 'aprovada' ||
          status === 'aprovado' ||
          n.publicada === true ||
          n.publicado === true ||
          n.ativo === true
        );
      });
    }

    if (
      categoria &&
      categoria !== 'todas' &&
      categoria !== 'todos'
    ) {
      noticias = noticias.filter(n =>
        String(n.categoria || '').trim().toLowerCase() === categoria
      );
    }

    if (featuredFirst) {
      noticias = noticias.sort((a, b) => {
        if (a.destaque === b.destaque) {
          return new Date(b.dataPublicacao || b.createdAt) -
                 new Date(a.dataPublicacao || a.createdAt);
        }

        return a.destaque ? -1 : 1;
      });
    }

    noticias = noticias.slice(0, limite);

    if (!noticias.length) {
      lista.innerHTML = `
        <div class="empty-state">
          Nenhuma notícia encontrada.
        </div>
      `;
      return;
    }

    lista.innerHTML = noticias.map(item => `
      <article class="news-page-card ${item.destaque ? 'featured' : ''}">
        <div
          class="news-page-image"
          style="${
            item.imagem
              ? `background-image:
                  linear-gradient(rgba(6,26,53,.20), rgba(6,26,53,.20)),
                  url('${item.imagem}');`
              : ''
          }"
        ></div>

        <div class="news-page-content">
          <span>${item.categoria || 'Comunicado'}</span>
          <small>${formatarDataNoticiaCms(item.dataPublicacao || item.createdAt)}</small>
          <h2>${item.titulo || 'Notícia'}</h2>
          <p>${item.resumo || ''}</p>
          <a href="./pagina-noticia.html?slug=${item.slug || ''}">
            ${btnText}
          </a>
        </div>
      </article>
    `).join('');

  } catch (err) {
    console.error(err);

    lista.innerHTML = `
      <div class="empty-state">
        Erro ao carregar notícias cadastradas.
      </div>
    `;
  }
}

function aplicarEstilosNoticiasListaPreview() {
  const doc = getPreviewDoc();

  if (!doc || doc.getElementById('cms-news-list-style')) return;

  const style = doc.createElement('style');
  style.id = 'cms-news-list-style';

  style.textContent = `
    .cms-news-page-image {
      overflow: hidden;
    }

    .cms-news-page-image img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }
  `;

  doc.head.appendChild(style);
}

function montarItemCategoriaNoticias(n, item = {}) {
  return `
    <div class="news-category-editor" data-news-category-index="${n}">
      <div class="news-editor-top">
        <strong>Categoria ${n}</strong>

        <div class="quick-item-controls">
          <button type="button" class="btn-news-category-up">↑</button>
          <button type="button" class="btn-news-category-down">↓</button>
        </div>
      </div>

      <label>Texto</label>
      <input id="news-category-text-${n}" value="${item.texto || ''}">

      <label>Link</label>
      <input id="news-category-link-${n}" value="${item.link || '#'}">

      <button class="btn ghost btn-remove-news-category" type="button">
        Remover categoria
      </button>
    </div>
  `;
}

function montarCamposNoticiasCategorias(nome) {
  const blocoAtual =
    pageBlocksMap?.noticias?.find(b => b.id === 'noticias-categorias');

  const mongo = blocoAtual?.mongo || {};

  const itensSalvos =
    Array.isArray(mongo.itens)
      ? mongo.itens
      : [];

  const categorias = itensSalvos.length
    ? itensSalvos
    : [
        { texto: 'Todas as notícias', link: '#' },
        { texto: 'Comunicados', link: '#' },
        { texto: 'Acadêmico', link: '#' },
        { texto: 'Cultural', link: '#' },
        { texto: 'Esportivo', link: '#' },
        { texto: 'Processo Seletivo', link: '#' }
      ];

  return `
    <div class="properties-head">
      <h2>Categorias</h2>
      <span>${nome}</span>
    </div>

    <label>Título da seção</label>
    <input
      id="news-category-section-title"
      value="${mongo.titulo || 'Categorias'}"
    >

    <div id="news-category-fields">
      ${categorias.map((item, index) =>
        montarItemCategoriaNoticias(index + 1, item)
      ).join('')}
    </div>

    <button class="btn ghost full" id="btn-add-news-category" type="button">
      + Adicionar categoria
    </button>

    <div class="builder-actions">
      <button class="btn ghost" type="button" data-action="duplicate">
        Duplicar bloco
      </button>

      <button class="btn primary" type="button" data-action="save">
        Salvar bloco
      </button>
    </div>
  `;
}

function coletarCategoriasNoticias() {
  const campos = [...document.querySelectorAll('.news-category-editor')];

  return campos.map((box, index) => {
    const i = box.dataset.newsCategoryIndex;

    return {
      ordem: index,
      texto: getInput(`news-category-text-${i}`)?.value || '',
      link: getInput(`news-category-link-${i}`)?.value || '#'
    };
  }).filter(item => item.texto.trim());
}

function adicionarCategoriaNoticias() {
  const container = document.getElementById('news-category-fields');
  if (!container) return;

  const novo = Date.now();
  const wrap = document.createElement('div');

  wrap.innerHTML = montarItemCategoriaNoticias(novo, {
    texto: 'Nova categoria',
    link: '#'
  });

  container.appendChild(wrap.firstElementChild);

  ligarEventosCamposDinamicos();
  atualizarPreview();

  showToast('Categoria adicionada.');
}

function atualizarNoticiasCategoriasNaPreview() {
  const doc = getPreviewDoc();
  if (!doc) return;

  const caixas =
    [...doc.querySelectorAll('.sidebar-box')];

  const box =
    caixas.find(el =>
      el.querySelector('h3')?.textContent
        ?.toLowerCase()
        ?.includes('categoria')
    );

  if (!box) return;

  box.setAttribute('data-cms-block-id', 'noticias-categorias');

  const h3 = box.querySelector('h3');

  if (h3) {
    h3.textContent =
      getInput('news-category-section-title')?.value ||
      'Categorias';
  }

  const categorias = coletarCategoriasNoticias();

  const linksHtml = categorias.map(item => `
    <a href="${item.link}">
      ${item.texto}
    </a>
  `).join('');

  box.innerHTML = `
    <h3>${h3?.textContent || 'Categorias'}</h3>
    ${linksHtml}
  `;
}

function montarItemNoticiaRecente(n, item = {}) {
  return `
    <div class="recent-news-editor" data-recent-news-index="${n}">
      <div class="news-editor-top">
        <strong>Notícia recente ${n}</strong>

        <div class="quick-item-controls">
          <button type="button" class="btn-recent-news-up">↑</button>
          <button type="button" class="btn-recent-news-down">↓</button>
        </div>
      </div>

      <label>Miniatura</label>
      <div class="upload-field">
        <input id="recent-news-image-${n}" value="${item.imagem || ''}" placeholder="/uploads/site/recente.png">

        <button
          class="btn upload btn-upload-recent-news"
          type="button"
          data-target="recent-news-image-${n}"
        >
          Enviar
        </button>
      </div>

      <label>Título</label>
      <input id="recent-news-title-${n}" value="${item.titulo || ''}">

      <label>Link</label>
      <input id="recent-news-link-${n}" value="${item.link || './pagina-noticia.html'}">

      <button class="btn ghost btn-remove-recent-news" type="button">
        Remover notícia recente
      </button>
    </div>
  `;
}

function montarCamposNoticiasRecentes(nome) {
  const blocoAtual =
    pageBlocksMap?.noticias?.find(b => b.id === 'noticias-recentes');

  const mongo = blocoAtual?.mongo || {};

  const itensSalvos =
    Array.isArray(mongo.itens)
      ? mongo.itens
      : [];

  const recentes = itensSalvos.length
    ? itensSalvos
    : [
        {
          imagem: '',
          titulo: 'Formatura Militar 2025',
          link: './pagina-noticia.html'
        },
        {
          imagem: '',
          titulo: 'OLITEF 2025',
          link: './pagina-noticia.html'
        }
      ];

  return `
    <div class="properties-head">
      <h2>Notícias Recentes</h2>
      <span>${nome}</span>
    </div>

    <label>Título da caixa</label>
    <input
      id="recent-news-section-title"
      value="${mongo.titulo || 'Recentes'}"
    >

    <div id="recent-news-fields">
      ${recentes.map((item, index) =>
        montarItemNoticiaRecente(index + 1, item)
      ).join('')}
    </div>

    <input type="file" id="upload-file" hidden accept="image/*">

    <button class="btn ghost full" id="btn-add-recent-news" type="button">
      + Adicionar notícia recente
    </button>

    <div class="builder-actions">
      <button class="btn ghost" type="button" data-action="duplicate">
        Duplicar bloco
      </button>

      <button class="btn primary" type="button" data-action="save">
        Salvar bloco
      </button>
    </div>
  `;
}

function coletarNoticiasRecentes() {
  const campos = [...document.querySelectorAll('.recent-news-editor')];

  return campos.map((box, index) => {
    const i = box.dataset.recentNewsIndex;

    return {
      ordem: index,
      imagem: getInput(`recent-news-image-${i}`)?.value || '',
      titulo: getInput(`recent-news-title-${i}`)?.value || '',
      link: getInput(`recent-news-link-${i}`)?.value || './pagina-noticia.html'
    };
  }).filter(item => item.titulo.trim());
}

function coletarContatoInfos() {
  const campos = [...document.querySelectorAll('.contact-info-editor')];

  return campos.map((box, index) => {
    const i = box.dataset.contactInfoIndex;

    return {
      ordem: index,
      icone: getInput(`contact-info-icon-${i}`)?.value || '📍',
      titulo: getInput(`contact-info-title-${i}`)?.value || '',
      texto: getInput(`contact-info-text-${i}`)?.value || ''
    };
  }).filter(item =>
    item.titulo.trim() || item.texto.trim()
  );
}

function adicionarNoticiaRecente() {
  const container = document.getElementById('recent-news-fields');
  if (!container) return;

  const novo = Date.now();
  const wrap = document.createElement('div');

  wrap.innerHTML = montarItemNoticiaRecente(novo, {
    imagem: '',
    titulo: 'Nova notícia recente',
    link: './pagina-noticia.html'
  });

  container.appendChild(wrap.firstElementChild);

  ligarEventosCamposDinamicos();
  atualizarPreview();

  showToast('Notícia recente adicionada.');
}

function atualizarNoticiasRecentesNaPreview() {
  const doc = getPreviewDoc();
  if (!doc) return;

  const caixas = [...doc.querySelectorAll('.sidebar-box')];

  const box =
  doc.querySelector('[data-cms-block-id="noticias-recentes"]') ||
  caixas.find(el =>
    el.querySelector('h3')?.textContent
      ?.toLowerCase()
      ?.includes('recente')
  );

  if (!box) return;

  box.setAttribute('data-cms-block-id', 'noticias-recentes');

  const titulo =
    getInput('recent-news-section-title')?.value ||
    'Recentes';

  const recentes = coletarNoticiasRecentes();

  box.innerHTML = `
    <h3>${titulo}</h3>

    ${recentes.map(item => `
      <a href="${item.link}" class="recent-news cms-recent-news-link">
        <div
  class="cms-recent-news-thumb"
  style="${
    item.imagem
      ? `background-image:url('${item.imagem}')`
      : ''
  }"
></div>

        <p>${item.titulo}</p>
      </a>
    `).join('')}
  `;

  aplicarEstilosNoticiasRecentesPreview();
}

function aplicarEstilosNoticiasRecentesPreview() {
  const doc = getPreviewDoc();

  if (!doc || doc.getElementById('cms-recent-news-style')) return;

  const style = doc.createElement('style');
  style.id = 'cms-recent-news-style';

  style.textContent = `
    .cms-recent-news-link {
      text-decoration: none;
      color: inherit;
    }

    .cms-recent-news-thumb {
      overflow: hidden;
    }

    .cms-recent-news-thumb img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }
  `;

  doc.head.appendChild(style);
}

function montarCamposNoticiasSuporte(nome) {
  const blocoAtual =
    pageBlocksMap?.noticias?.find(b => b.id === 'noticias-suporte');

  const mongo = blocoAtual?.mongo || {};

  return `
    <div class="properties-head">
      <h2>Suporte</h2>
      <span>${nome}</span>
    </div>

    <label>Título</label>
    <input id="news-support-title" value="${mongo.titulo || 'Suporte'}">

    <label>Texto</label>
    <textarea id="news-support-text">${mongo.texto || 'Em caso de dúvidas ou sugestões, entre em contato conosco.'}</textarea>

    <label>Texto do botão</label>
    <input id="news-support-button" value="${mongo.link?.texto || 'Fale conosco'}">

    <label>Link do botão</label>
    <input id="news-support-link" value="${mongo.link?.url || './contato.html'}">

    <div class="builder-actions">
      <button class="btn ghost" type="button" data-action="duplicate">
        Duplicar bloco
      </button>

      <button class="btn primary" type="button" data-action="save">
        Salvar bloco
      </button>
    </div>
  `;
}

function atualizarNoticiasSuporteNaPreview() {
  const doc = getPreviewDoc();
  if (!doc) return;

  const box =
    doc.querySelector('[data-cms-block-id="noticias-suporte"]') ||
    doc.querySelector('.support-box');

  if (!box) return;

  box.setAttribute('data-cms-block-id', 'noticias-suporte');

  const h3 = box.querySelector('h3');
  const p = box.querySelector('p');
  const a = box.querySelector('a');

  if (h3) h3.textContent = getInput('news-support-title')?.value || 'Suporte';
  if (p) p.textContent = getInput('news-support-text')?.value || '';
  if (a) {
    a.textContent = getInput('news-support-button')?.value || 'Fale conosco';
    a.href = getInput('news-support-link')?.value || './contato.html';
  }
}

function montarCamposGaleriaBanner(nome) {
  const blocoAtual =
    pageBlocksMap?.galeria?.find(b => b.id === 'galeria-banner');

  const mongo = blocoAtual?.mongo || {};
  const config = mongo.configuracao || {};

  return `
    <div class="properties-head">
      <h2>Banner Galeria</h2>
      <span>${nome}</span>
    </div>

    <label>Breadcrumb</label>
    <input id="galeria-banner-breadcrumb" value="${config.breadcrumb || mongo.subtitulo || 'Início › Galeria'}">

    <label>Título</label>
    <input id="galeria-banner-title" value="${mongo.titulo || 'Galeria Institucional'}">

    <label>Subtítulo</label>
    <textarea id="galeria-banner-text">${mongo.texto || 'Registros das atividades, eventos, projetos e momentos marcantes da instituição.'}</textarea>

    <label>Imagem de fundo</label>

    <div class="upload-field">
      <input
        id="galeria-banner-image"
        value="${mongo.imagemUrl || ''}"
        placeholder="/uploads/site/banner-galeria.png"
      >

      <button
        class="btn upload btn-upload-galeria-banner"
        type="button"
        data-target="galeria-banner-image"
      >
        Enviar
      </button>
    </div>

    <label>Intensidade do overlay</label>

    <select id="galeria-banner-overlay">
      <option value="0.92" ${String(config.overlay || '0.92') === '0.92' ? 'selected' : ''}>Forte</option>
      <option value="0.78" ${String(config.overlay || '') === '0.78' ? 'selected' : ''}>Médio</option>
      <option value="0.62" ${String(config.overlay || '') === '0.62' ? 'selected' : ''}>Leve</option>
    </select>

    <input type="file" id="upload-file" hidden accept="image/*">

    <div class="builder-actions">
      <button class="btn ghost" type="button" data-action="duplicate">
        Duplicar bloco
      </button>

      <button class="btn primary" type="button" data-action="save">
        Salvar bloco
      </button>
    </div>
  `;
}

function atualizarGaleriaBannerNaPreview() {
  const doc = getPreviewDoc();
  if (!doc) return;

  const hero =
    doc.querySelector('[data-cms-block-id="galeria-banner"]') ||
    doc.querySelector('.page-hero.red-hero') ||
    doc.querySelector('.page-hero');

  if (!hero) return;

  hero.setAttribute('data-cms-block-id', 'galeria-banner');

  const breadcrumb =
    getInput('galeria-banner-breadcrumb')?.value ||
    'Início › Galeria';

  const titulo =
    getInput('galeria-banner-title')?.value ||
    'Galeria Institucional';

  const texto =
    getInput('galeria-banner-text')?.value ||
    '';

  const imagem =
    getInput('galeria-banner-image')?.value ||
    '';

  const overlay =
    getInput('galeria-banner-overlay')?.value ||
    '0.92';

  const small = hero.querySelector('small');
  const h1 = hero.querySelector('h1');
  const p = hero.querySelector('p');

  if (small) small.textContent = breadcrumb;
  if (h1) h1.textContent = titulo;
  if (p) p.textContent = texto;

  if (imagem) {
    hero.style.background = `
      linear-gradient(
        90deg,
        rgba(6,26,53,${overlay}),
        rgba(185,21,27,.58)
      ),
      url("${imagem}")
    `;

    hero.style.backgroundSize = 'cover';
    hero.style.backgroundPosition = 'center';
  }
}

function montarItemFiltroGaleria(n, item = {}) {
  return `
    <div class="gallery-filter-editor" data-gallery-filter-index="${n}">
      <div class="news-editor-top">
        <strong>Filtro ${n}</strong>

        <div class="quick-item-controls">
          <button type="button" class="btn-gallery-filter-up">↑</button>
          <button type="button" class="btn-gallery-filter-down">↓</button>

          <label style="display:flex;align-items:center;gap:6px;">
            <input
              type="radio"
              name="gallery-filter-active"
              id="gallery-filter-active-${n}"
              ${item.ativo ? 'checked' : ''}
            >
            Ativo
          </label>
        </div>
      </div>

      <label>Texto do filtro</label>
      <input id="gallery-filter-text-${n}" value="${item.texto || ''}">

      <button class="btn ghost btn-remove-gallery-filter" type="button">
        Remover filtro
      </button>
    </div>
  `;
}

function montarCamposGaleriaFiltros(nome) {
  const filtros = [
    { texto: 'Todos', ativo: true },
    { texto: 'Eventos', ativo: false },
    { texto: 'Acadêmico', ativo: false },
    { texto: 'Militar', ativo: false },
    { texto: 'Esportivo', ativo: false },
    { texto: 'Cultural', ativo: false }
  ];

  return `
    <div class="properties-head">
      <h2>Filtros da Galeria</h2>
      <span>${nome}</span>
    </div>

    <div id="gallery-filter-fields">
      ${filtros.map((item, index) =>
        montarItemFiltroGaleria(index + 1, item)
      ).join('')}
    </div>

    <button
      class="btn ghost full"
      id="btn-add-gallery-filter"
      type="button"
    >
      + Adicionar filtro
    </button>

    <div class="builder-actions">

      <button
        class="btn ghost"
        type="button"
        data-action="duplicate"
      >
        Duplicar bloco
      </button>

      <button
        class="btn primary"
        type="button"
        data-action="save"
      >
        Salvar bloco
      </button>

    </div>
  `;
}

function coletarFiltrosGaleria() {
  const campos = [...document.querySelectorAll('.gallery-filter-editor')];

  return campos.map((box, index) => {
    const i = box.dataset.galleryFilterIndex;

    return {
      ordem: index,
      texto: getInput(`gallery-filter-text-${i}`)?.value || '',
      ativo: getInput(`gallery-filter-active-${i}`)?.checked || false
    };
  }).filter(item => item.texto.trim());
}

function adicionarFiltroGaleria() {
  const container = document.getElementById('gallery-filter-fields');
  if (!container) return;

  const novo = Date.now();
  const wrap = document.createElement('div');

  wrap.innerHTML = montarItemFiltroGaleria(novo, {
    texto: 'Novo filtro',
    ativo: false
  });

  container.appendChild(wrap.firstElementChild);

  ligarEventosCamposDinamicos();
  atualizarPreview();

  showToast('Filtro adicionado.');
}

function atualizarGaleriaFiltrosNaPreview() {
  const doc = getPreviewDoc();
  if (!doc) return;

  const section =
    doc.querySelector('[data-cms-block-id="galeria-filtros"]') ||
    doc.querySelector('.gallery-filter');

  if (!section) return;

  section.setAttribute('data-cms-block-id', 'galeria-filtros');

  const filtros = coletarFiltrosGaleria();

  section.innerHTML = filtros.map(item => `
    <button class="${item.ativo ? 'active' : ''}">
      ${item.texto}
    </button>
  `).join('');
}

function montarItemGridGaleria(n, item = {}) {
  const fotosEvento = Array.isArray(item.imagens) && item.imagens.length
    ? item.imagens
    : [];

  return `
    <div class="gallery-grid-editor" data-gallery-grid-index="${n}">
      <div class="news-editor-top">
        <strong>Evento ${n}</strong>

        <div class="quick-item-controls">
          <button type="button" class="btn-gallery-grid-up">↑</button>
          <button type="button" class="btn-gallery-grid-down">↓</button>

          <label style="display:flex;align-items:center;gap:6px;">
            <input type="checkbox" id="gallery-grid-large-${n}" ${item.grande ? 'checked' : ''}>
            Destaque
          </label>
        </div>
      </div>

      <label>Imagem de capa do evento</label>
      <div class="upload-field">
        <input
          id="gallery-grid-image-${n}"
          value="${item.imagem || ''}"
          placeholder="/uploads/site/galeria.png"
        >

        <button
          class="btn upload btn-upload-gallery-grid"
          type="button"
          data-target="gallery-grid-image-${n}"
        >
          Enviar
        </button>

        <button
          class="btn ghost btn-open-media-picker"
          type="button"
          data-target="gallery-grid-image-${n}"
        >
          Biblioteca
        </button>
      </div>

      <label>Categoria do evento</label>
      <select id="gallery-grid-label-${n}">
        <option value="Eventos" ${item.etiqueta === 'Eventos' ? 'selected' : ''}>Eventos</option>
        <option value="Acadêmico" ${item.etiqueta === 'Acadêmico' ? 'selected' : ''}>Acadêmico</option>
        <option value="Militar" ${item.etiqueta === 'Militar' ? 'selected' : ''}>Militar</option>
        <option value="Esportivo" ${item.etiqueta === 'Esportivo' ? 'selected' : ''}>Esportivo</option>
        <option value="Cultural" ${item.etiqueta === 'Cultural' ? 'selected' : ''}>Cultural</option>
        <option value="Destaque" ${item.etiqueta === 'Destaque' ? 'selected' : ''}>Destaque</option>
      </select>

      <label>Título do evento</label>
      <input id="gallery-grid-title-${n}" value="${item.titulo || ''}">

      <div class="gallery-event-photos-box">
        <div class="gallery-event-photos-head">
          <strong>Fotos deste evento</strong>
          <button
  class="btn ghost btn-add-gallery-event-photo"
  type="button"
  data-event-index="${n}"
>
  + Adicionar foto manual
</button>

<button
  class="btn upload btn-upload-gallery-event-photos"
  type="button"
  data-event-index="${n}"
>
  Enviar várias fotos
</button>

<input
  type="file"
  id="gallery-event-files-${n}"
  class="gallery-event-files-input"
  accept="image/*"
  multiple
  hidden
>
        </div>

        <div
          class="gallery-event-photos-list"
          data-event-index="${n}"
        >
          ${
            fotosEvento.length
              ? fotosEvento.map((foto, fotoIndex) =>
                  montarFotoEventoGaleria(n, fotoIndex + 1, foto)
                ).join('')
              : `
                <div class="gallery-event-empty">
                  Nenhuma foto adicional cadastrada. Se não adicionar fotos aqui,
                  o modal abrirá apenas com a imagem de capa.
                </div>
              `
          }
        </div>
      </div>

      <button class="btn ghost btn-remove-gallery-grid" type="button">
        Remover evento
      </button>
    </div>
  `;
}

function montarFotoEventoGaleria(eventIndex, photoIndex, foto = {}) {
  return `
    <div
      class="gallery-event-photo-editor"
      data-event-index="${eventIndex}"
      data-photo-index="${photoIndex}"
    >
      <div class="news-editor-top">
        <strong>Foto ${photoIndex}</strong>

        <button
          class="btn ghost btn-remove-gallery-event-photo"
          type="button"
        >
          Remover
        </button>
      </div>

      <label>Imagem</label>
      <div class="upload-field">
        <input
          id="gallery-event-photo-${eventIndex}-${photoIndex}"
          class="gallery-event-photo-url"
          value="${foto.url || foto.imagem || ''}"
          placeholder="/uploads/site/foto-evento.png"
        >

        <button
          class="btn upload btn-upload-gallery-grid"
          type="button"
          data-target="gallery-event-photo-${eventIndex}-${photoIndex}"
        >
          Enviar
        </button>

        <button
          class="btn ghost btn-open-media-picker"
          type="button"
          data-target="gallery-event-photo-${eventIndex}-${photoIndex}"
        >
          Biblioteca
        </button>
      </div>

      <label>Legenda da foto</label>
      <input
        class="gallery-event-photo-caption"
        value="${foto.legenda || ''}"
        placeholder="Ex.: Entrada dos alunos"
      >
    </div>
  `;
}

function coletarFotosEventoGaleria(eventIndex) {
  const lista = document.querySelector(
    `.gallery-event-photos-list[data-event-index="${eventIndex}"]`
  );

  if (!lista) return [];

  return Array.from(lista.querySelectorAll('.gallery-event-photo-editor'))
    .map((el, index) => ({
      ordem: index + 1,
      url: el.querySelector('.gallery-event-photo-url')?.value?.trim() || '',
      legenda: el.querySelector('.gallery-event-photo-caption')?.value?.trim() || ''
    }))
    .filter(foto => foto.url);
}

function montarCamposGaleriaGrid(nome) {
  const blocoAtual =
    pageBlocksMap?.galeria?.find(b => b.id === 'galeria-grid');

  const itensSalvos =
    Array.isArray(blocoAtual?.mongo?.itens)
      ? blocoAtual.mongo.itens
      : [];

  const imagens = itensSalvos.length
    ? itensSalvos.map(item => ({
        grande: item.destaque || item.grande || false,
        imagem: item.imagem || item.url || '',
        etiqueta: item.categoria || item.etiqueta || item.legenda || '',
        titulo: item.titulo || '',
        imagens: Array.isArray(item.imagens) ? item.imagens : []
      }))
    : [
        {
          grande: true,
          imagem: '',
          etiqueta: 'Destaque',
          titulo: 'Formatura 2026',
          imagens: []
        }
      ];

  return `
    <div class="properties-head">
      <h2>Grid de Eventos da Galeria</h2>
      <span>${nome}</span>
    </div>

    <div id="gallery-grid-fields">
      ${imagens.map((item, index) =>
        montarItemGridGaleria(index + 1, item)
      ).join('')}
    </div>

    <input type="file" id="upload-file" hidden accept="image/*">

    <button
      class="btn ghost full"
      id="btn-add-gallery-grid"
      type="button"
    >
      + Adicionar evento
    </button>

    <div class="builder-actions">
      <button class="btn ghost" type="button" data-action="duplicate">
        Duplicar bloco
      </button>

      <button class="btn primary" type="button" data-action="save">
        Salvar bloco
      </button>
    </div>
  `;
}

function coletarGridGaleria() {
  const campos = [...document.querySelectorAll('.gallery-grid-editor')];

  return campos.map((box, index) => {
    const i = box.dataset.galleryGridIndex;

    const imagens = [...box.querySelectorAll('.gallery-event-photo-editor')]
      .map((fotoBox, fotoIndex) => {
        const photoIndex = fotoBox.dataset.photoIndex;

        return {
          ordem: fotoIndex,
          url:
            getInput(`gallery-event-photo-${i}-${photoIndex}`)?.value ||
            '',
          legenda:
            fotoBox.querySelector('.gallery-event-photo-caption')?.value ||
            ''
        };
      })
      .filter(foto => foto.url.trim());

    return {
      ordem: index,
      eventIndex: i,
      grande: getInput(`gallery-grid-large-${i}`)?.checked || false,
      imagem: getInput(`gallery-grid-image-${i}`)?.value || '',
      etiqueta: getInput(`gallery-grid-label-${i}`)?.value || '',
      titulo: getInput(`gallery-grid-title-${i}`)?.value || '',
      imagens
    };
  }).filter(item =>
    item.titulo.trim() ||
    item.imagem.trim() ||
    item.imagens.length
  );
}

function adicionarImagemGridGaleria() {
  const container = document.getElementById('gallery-grid-fields');
  if (!container) return;

  const novo = Date.now();
  const wrap = document.createElement('div');

  wrap.innerHTML = montarItemGridGaleria(novo, {
    grande: false,
    imagem: '',
    etiqueta: '',
    titulo: 'Nova imagem'
  });

  container.appendChild(wrap.firstElementChild);

  ligarEventosCamposDinamicos();
  atualizarPreview();

  showToast('Imagem adicionada.');
}

async function enviarVariasFotosEventoGaleria(eventIndex, files) {
  const lista = document.querySelector(
    `.gallery-event-photos-list[data-event-index="${eventIndex}"]`
  );

  if (!lista || !files?.length) return;

  const vazio = lista.querySelector('.gallery-event-empty');
  if (vazio) vazio.remove();

  showToast(`Enviando ${files.length} foto(s)...`);

  for (const file of files) {
    const formData = new FormData();
    formData.append('arquivo', file);

    try {
      const res = await fetch(`${API_ADMIN}/midias/upload`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('site_cms_token')}`
        },
        body: formData
      });

      const data = await res.json();

      if (!data.ok || !data.midia?.url) {
        console.warn('Falha ao enviar imagem:', data);
        continue;
      }

      const quantidadeAtual =
        lista.querySelectorAll('.gallery-event-photo-editor').length;

      lista.insertAdjacentHTML(
        'beforeend',
        montarFotoEventoGaleria(eventIndex, quantidadeAtual + 1, {
          url: data.midia.url,
          legenda: file.name.replace(/\.[^/.]+$/, '')
        })
      );

    } catch (err) {
      console.error('Erro ao enviar foto da galeria:', err);
    }
  }

  atualizarPreview?.();
  showToast('Fotos adicionadas ao evento.');
}

function atualizarGaleriaGridNaPreview() {
  const doc = getPreviewDoc();
  if (!doc) return;

  const grid =
    doc.querySelector('[data-cms-block-id="galeria-grid"]') ||
    doc.querySelector('.gallery-page');

  if (!grid) return;

  grid.setAttribute('data-cms-block-id', 'galeria-grid');

  const imagens = coletarGridGaleria();

  grid.innerHTML = imagens.map((item, index) => `
    <article class="gallery-item ${item.grande ? 'large' : `item-${index + 1}`} ${item.imagem ? 'cms-gallery-grid-image' : ''}">
      ${
        item.imagem
          ? `<img src="${item.imagem}" alt="${item.titulo || 'Imagem da galeria'}">`
          : ''
      }

      <div class="gallery-overlay">
        ${item.etiqueta ? `<span>${item.etiqueta}</span>` : ''}
        <h3>${item.titulo}</h3>
      </div>
    </article>
  `).join('');

  aplicarEstilosGaleriaGridPreview();
}

function aplicarEstilosGaleriaGridPreview() {
  const doc = getPreviewDoc();

  if (!doc || doc.getElementById('cms-gallery-grid-style')) return;

  const style = doc.createElement('style');
  style.id = 'cms-gallery-grid-style';

  style.textContent = `
    .cms-gallery-grid-image {
      overflow: hidden;
      position: relative;
    }

    .cms-gallery-grid-image img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }

    .cms-gallery-grid-image .gallery-overlay {
      position: absolute;
      inset: auto 0 0 0;
      z-index: 2;
    }
  `;

  doc.head.appendChild(style);
}

function montarCamposGaleriaVideo(nome) {
  const blocoAtual =
    pageBlocksMap?.galeria?.find(b => b.id === 'galeria-video');

  const mongo = blocoAtual?.mongo || {};

  return `
    <div class="properties-head">
      <h2>Vídeo Institucional</h2>
      <span>${nome}</span>
    </div>

    <label>Etiqueta</label>
    <input id="galeria-video-label" value="${mongo.subtitulo || 'Vídeo institucional'}">

    <label>Título</label>
    <textarea id="galeria-video-title">${mongo.titulo || 'Conheça mais sobre o Colégio Dom Pedro II - Campus CZS'}</textarea>

    <label>Texto</label>
    <textarea id="galeria-video-text">${mongo.texto || 'Assista ao vídeo institucional e conheça nossa história, projetos, valores e estrutura.'}</textarea>

    <label>Texto do botão</label>
    <input id="galeria-video-button" value="${mongo.link?.texto || 'Assistir vídeo'}">

    <label>Link do vídeo</label>
    <input id="galeria-video-link" value="${mongo.videoUrl || mongo.link?.url || 'https://youtube.com'}">

    <label>Imagem de capa</label>
    <div class="upload-field">
      <input
        id="galeria-video-cover"
        value="${mongo.imagemUrl || ''}"
        placeholder="/uploads/site/video-galeria.png"
      >

      <button
        class="btn upload btn-upload-galeria-video"
        type="button"
        data-target="galeria-video-cover"
      >
        Enviar
      </button>
    </div>

    <input type="file" id="upload-file" hidden accept="image/*">

    <div class="builder-actions">
      <button class="btn ghost" type="button" data-action="duplicate">
        Duplicar bloco
      </button>

      <button class="btn primary" type="button" data-action="save">
        Salvar bloco
      </button>
    </div>
  `;
}

function atualizarGaleriaVideoNaPreview() {
  const doc = getPreviewDoc();
  if (!doc) return;

  aplicarEstilosVideoPreview();

  const section =
    doc.querySelector('[data-cms-block-id="galeria-video"]') ||
    doc.querySelector('.video-section');

  if (!section) return;

  section.setAttribute('data-cms-block-id', 'galeria-video');

  const label = getInput('galeria-video-label')?.value || 'Vídeo institucional';
  const titulo = getInput('galeria-video-title')?.value || '';
  const texto = getInput('galeria-video-text')?.value || '';
  const botao = getInput('galeria-video-button')?.value || 'Assistir vídeo';
  const link = getInput('galeria-video-link')?.value || '';
  const imagem = getInput('galeria-video-cover')?.value || '';

  const embed = converterYoutubeParaEmbed(link);

  const preview = section.querySelector('.video-preview');
  const labelEl = section.querySelector('.video-content span');
  const h2 = section.querySelector('h2');
  const p = section.querySelector('p');
  const btn = section.querySelector('a');

  if (labelEl) labelEl.textContent = label;
  if (h2) h2.textContent = titulo;
  if (p) p.textContent = texto;

  if (btn) {
    btn.textContent = botao;
    btn.href = '#';

    btn.onclick = (e) => {
      e.preventDefault();
      abrirModalVideo(embed);
    };
  }

  if (preview) {
    preview.classList.add('cms-video-cover');

    preview.innerHTML = `
      ${
        imagem
          ? `<img src="${imagem}" alt="${titulo || 'Vídeo institucional'}">`
          : ''
      }

      <div class="cms-video-play">
        <span>▶</span>
      </div>
    `;
  }

  criarModalVideoPreview();
}

function montarCamposContatoBanner(nome) {
  const slugAtual =
    builderPageSelect?.value || 'contato';

  const blocoAtual =
    pageBlocksMap?.[slugAtual]?.find(b =>
      b.id === 'contato-banner' ||
      b.mongo?.configuracao?.cmsBlockId === 'contato-banner'
    );

  const mongo = blocoAtual?.mongo || {};
  const config = mongo.configuracao || {};

  return `
    <div class="properties-head">
      <h2>Banner Contato</h2>
      <span>${nome}</span>
    </div>

    <label>Breadcrumb</label>
    <input
      id="contato-banner-breadcrumb"
      value="${config.breadcrumb || mongo.breadcrumb || 'Início › Contato'}"
    >

    <label>Título</label>
    <input
      id="contato-banner-title"
      value="${mongo.titulo || 'Contato'}"
    >

    <label>Subtítulo</label>
    <textarea id="contato-banner-text">${mongo.texto || 'Entre em contato com o Colégio Dom Pedro II - Campus CZS.'}</textarea>

    <label>Imagem de fundo</label>

    <div class="upload-field">
      <input
        id="contato-banner-image"
        value="${mongo.imagemUrl || ''}"
        placeholder="/uploads/site/banner-contato.png"
      >

      <button
        class="btn upload btn-upload-contato-banner"
        type="button"
        data-target="contato-banner-image"
      >
        Enviar
      </button>
    </div>

    <label>Intensidade do overlay</label>

    <select id="contato-banner-overlay">
      <option value="0.92" ${String(config.overlay || '0.92') === '0.92' ? 'selected' : ''}>Forte</option>
      <option value="0.78" ${String(config.overlay || '') === '0.78' ? 'selected' : ''}>Médio</option>
      <option value="0.62" ${String(config.overlay || '') === '0.62' ? 'selected' : ''}>Leve</option>
    </select>

    <input type="file" id="upload-file" hidden accept="image/*">

    <div class="builder-actions">
      <button class="btn ghost" type="button" data-action="duplicate">
        Duplicar bloco
      </button>

      <button class="btn primary" type="button" data-action="save">
        Salvar bloco
      </button>
    </div>
  `;
}

function atualizarContatoBannerNaPreview() {
  const doc = getPreviewDoc();
  if (!doc) return;

  const hero =
    doc.querySelector('[data-cms-block-id="contato-banner"]') ||
    doc.querySelector('.page-hero.red-hero') ||
    doc.querySelector('.page-hero');

  if (!hero) return;

  hero.setAttribute('data-cms-block-id', 'contato-banner');

  const breadcrumb =
    getInput('contato-banner-breadcrumb')?.value ||
    'Início › Contato';

  const titulo =
    getInput('contato-banner-title')?.value ||
    'Contato';

  const texto =
    getInput('contato-banner-text')?.value ||
    '';

  const imagem =
    getInput('contato-banner-image')?.value ||
    '';

  const overlay =
    getInput('contato-banner-overlay')?.value ||
    '0.92';

  const small = hero.querySelector('small');
  const h1 = hero.querySelector('h1');
  const p = hero.querySelector('p');

  if (small) small.textContent = breadcrumb;
  if (h1) h1.textContent = titulo;
  if (p) p.textContent = texto;

  if (imagem) {
    hero.style.background = `
      linear-gradient(
        90deg,
        rgba(6,26,53,${overlay}),
        rgba(185,21,27,.58)
      ),
      url("${imagem}")
    `;

    hero.style.backgroundSize = 'cover';
    hero.style.backgroundPosition = 'center';
  }
}

function montarItemContatoInfo(n, item = {}) {
  return `
    <div class="contact-info-editor" data-contact-info-index="${n}">
      <div class="news-editor-top">
        <strong>Card ${n}</strong>

        <div class="quick-item-controls">
          <button type="button" class="btn-contact-info-up">↑</button>
          <button type="button" class="btn-contact-info-down">↓</button>
        </div>
      </div>

      <label>Ícone</label>
      <input id="contact-info-icon-${n}" value="${item.icone || ''}" placeholder="📍">

      <label>Título</label>
      <input id="contact-info-title-${n}" value="${item.titulo || ''}">

      <label>Texto</label>
      <textarea id="contact-info-text-${n}">${item.texto || ''}</textarea>

      <button class="btn ghost btn-remove-contact-info" type="button">
        Remover card
      </button>
    </div>
  `;
}

function montarCamposContatoInfos(nome) {
  const slugAtual =
    builderPageSelect?.value || 'contato';

  const blocoAtual =
    pageBlocksMap?.[slugAtual]?.find(b =>
      b.id === 'contato-info' ||
      b.mongo?.configuracao?.cmsBlockId === 'contato-info'
    );

  const mongo = blocoAtual?.mongo || {};

  const itensSalvos =
    Array.isArray(mongo.itens)
      ? mongo.itens
      : [];

  const cards = itensSalvos.length
    ? itensSalvos
    : [
        {
          icone: '📍',
          titulo: 'Endereço',
          texto: 'Cruzeiro do Sul - Acre\nBrasil'
        },
        {
          icone: '📞',
          titulo: 'Telefone',
          texto: '(68) 0000-0000'
        },
        {
          icone: '✉️',
          titulo: 'Email',
          texto: 'contato@colegiodompedro2czs.com.br'
        },
        {
          icone: '🕒',
          titulo: 'Horário de Atendimento',
          texto: 'Segunda a Sexta\n07h às 17h'
        }
      ];

  return `
    <div class="properties-head">
      <h2>Informações de Contato</h2>
      <span>${nome}</span>
    </div>

    <div id="contact-info-fields">
      ${cards.map((item, index) =>
        montarItemContatoInfo(index + 1, item)
      ).join('')}
    </div>

    <button class="btn ghost full" id="btn-add-contact-info" type="button">
      + Adicionar card
    </button>

    <div class="builder-actions">
      <button class="btn ghost" type="button" data-action="duplicate">
        Duplicar bloco
      </button>

      <button class="btn primary" type="button" data-action="save">
        Salvar bloco
      </button>
    </div>
  `;
}

function coletarInfosContato() {
  const campos = [...document.querySelectorAll('.contact-info-editor')];

  return campos.map((box, index) => {
    const i = box.dataset.contactInfoIndex;

    return {
      ordem: index,
      icone: getInput(`contact-info-icon-${i}`)?.value || '',
      titulo: getInput(`contact-info-title-${i}`)?.value || '',
      texto: getInput(`contact-info-text-${i}`)?.value || ''
    };
  }).filter(item => item.titulo.trim());
}

function adicionarInfoContato() {
  const container = document.getElementById('contact-info-fields');
  if (!container) return;

  const novo = Date.now();
  const wrap = document.createElement('div');

  wrap.innerHTML = montarItemContatoInfo(novo, {
    icone: '📌',
    titulo: 'Novo contato',
    texto: 'Descrição do contato'
  });

  container.appendChild(wrap.firstElementChild);

  ligarEventosCamposDinamicos();
  atualizarPreview();

  showToast('Card adicionado.');
}

function atualizarContatoInfosNaPreview() {
  const doc = getPreviewDoc();
  if (!doc) return;

  const container =
    doc.querySelector('[data-cms-block-id="contato-infos"]') ||
    doc.querySelector('.contact-info');

  if (!container) return;

  container.setAttribute('data-cms-block-id', 'contato-info');

  const cards = coletarInfosContato();

  container.innerHTML = cards.map(item => `
    <div class="contact-card">
      <span>${item.icone}</span>

      <div>
        <h3>${item.titulo}</h3>

        <p>
          ${item.texto.replace(/\n/g, '<br>')}
        </p>
      </div>
    </div>
  `).join('');
}

function montarCamposContatoFormulario(nome) {
  const slugAtual =
    builderPageSelect?.value || 'contato';

  const blocoAtual =
    pageBlocksMap?.[slugAtual]?.find(b =>
      b.id === 'contato-form' ||
      b.mongo?.configuracao?.cmsBlockId === 'contato-form'
    );

  const mongo = blocoAtual?.mongo || {};
  const config = mongo.configuracao || {};
  const campos = config.campos || {};

  return `
    <div class="properties-head">
      <h2>Formulário</h2>
      <span>${nome}</span>
    </div>

    <label>Etiqueta superior</label>
    <input id="contact-form-label" value="${config.label || 'Fale conosco'}">

    <label>Título</label>
    <textarea id="contact-form-title">${mongo.titulo || 'Envie uma mensagem'}</textarea>

    <label>Texto</label>
    <textarea id="contact-form-text">${mongo.texto || 'Utilize o formulário abaixo para entrar em contato com nossa equipe institucional.'}</textarea>

    <label>Label Nome</label>
    <input id="contact-form-name-label" value="${campos.nome?.label || 'Nome'}">

    <label>Placeholder Nome</label>
    <input id="contact-form-name-placeholder" value="${campos.nome?.placeholder || 'Seu nome'}">

    <label>Label Email</label>
    <input id="contact-form-email-label" value="${campos.email?.label || 'Email'}">

    <label>Placeholder Email</label>
    <input id="contact-form-email-placeholder" value="${campos.email?.placeholder || 'Seu email'}">

    <label>Label Telefone</label>
    <input id="contact-form-phone-label" value="${campos.telefone?.label || 'Telefone'}">

    <label>Placeholder Telefone</label>
    <input id="contact-form-phone-placeholder" value="${campos.telefone?.placeholder || '(00) 00000-0000'}">

    <label>Label Assunto</label>
    <input id="contact-form-subject-label" value="${campos.assunto?.label || 'Assunto'}">

    <label>Placeholder Assunto</label>
    <input id="contact-form-subject-placeholder" value="${campos.assunto?.placeholder || 'Assunto'}">

    <label>Label Mensagem</label>
    <input id="contact-form-message-label" value="${campos.mensagem?.label || 'Mensagem'}">

    <label>Placeholder Mensagem</label>
    <input id="contact-form-message-placeholder" value="${campos.mensagem?.placeholder || 'Digite sua mensagem'}">

    <label>Texto do botão</label>
    <input id="contact-form-button" value="${mongo.link?.texto || 'Enviar mensagem'}">

    <div class="builder-actions">
      <button class="btn ghost" type="button" data-action="duplicate">
        Duplicar bloco
      </button>

      <button class="btn primary" type="button" data-action="save">
        Salvar bloco
      </button>
    </div>
  `;
}

function atualizarContatoFormularioNaPreview() {
  const doc = getPreviewDoc();
  if (!doc) return;

  const box =
  doc.querySelector('.contact-form-box');

if (!box) return;

box.setAttribute('data-cms-block-id', 'contato-form');

  if (!box) return;

  box.setAttribute('data-cms-block-id', 'contato-form');

  const span = box.querySelector('.contact-form-head span');
  const h2 = box.querySelector('.contact-form-head h2');
  const p = box.querySelector('.contact-form-head p');

  if (span) {
    span.textContent =
      getInput('contact-form-label')?.value ||
      'Fale conosco';
  }

  if (h2) {
    h2.textContent =
      getInput('contact-form-title')?.value ||
      '';
  }

  if (p) {
    p.textContent =
      getInput('contact-form-text')?.value ||
      '';
  }

  const labels = box.querySelectorAll('label');
  const inputs = box.querySelectorAll('input');
  const textarea = box.querySelector('textarea');
  const button = box.querySelector('button');

  if (labels[0]) labels[0].textContent = getInput('contact-form-name-label')?.value || 'Nome';
  if (labels[1]) labels[1].textContent = getInput('contact-form-email-label')?.value || 'Email';
  if (labels[2]) labels[2].textContent = getInput('contact-form-phone-label')?.value || 'Telefone';
  if (labels[3]) labels[3].textContent = getInput('contact-form-subject-label')?.value || 'Assunto';
  if (labels[4]) labels[4].textContent = getInput('contact-form-message-label')?.value || 'Mensagem';

  if (inputs[0]) inputs[0].placeholder = getInput('contact-form-name-placeholder')?.value || '';
  if (inputs[1]) inputs[1].placeholder = getInput('contact-form-email-placeholder')?.value || '';
  if (inputs[2]) inputs[2].placeholder = getInput('contact-form-phone-placeholder')?.value || '';
  if (inputs[3]) inputs[3].placeholder = getInput('contact-form-subject-placeholder')?.value || '';

  if (textarea) {
    textarea.placeholder =
      getInput('contact-form-message-placeholder')?.value || '';
  }

  if (button) {
    button.textContent =
      getInput('contact-form-button')?.value ||
      'Enviar mensagem';
  }
}

function montarCamposContatoMapa(nome) {
  const slugAtual =
    builderPageSelect?.value || 'contato';

  const blocoAtual =
    pageBlocksMap?.[slugAtual]?.find(b =>
      b.id === 'contato-mapa' ||
      b.mongo?.configuracao?.cmsBlockId === 'contato-mapa'
    );

  const mongo = blocoAtual?.mongo || {};

  return `
    <div class="properties-head">
      <h2>Localização</h2>
      <span>${nome}</span>
    </div>

    <label>Título</label>
    <input
      id="contact-map-title"
      value="${mongo.titulo || 'Localização'}"
    >

    <label>Texto / Local</label>
    <input
      id="contact-map-text"
      value="${mongo.texto || 'Cruzeiro do Sul - AC'}"
    >

    <label>Link do Google Maps</label>
    <input
      id="contact-map-link"
      value="${mongo.link?.url || '#'}"
    >

    <label>Imagem de fundo do mapa</label>

    <div class="upload-field">
      <input
        id="contact-map-image"
        value="${mongo.imagemUrl || ''}"
        placeholder="/uploads/site/mapa-contato.png"
      >

      <button
        class="btn upload btn-upload-contact-map"
        type="button"
        data-target="contact-map-image"
      >
        Enviar
      </button>
    </div>

    <input type="file" id="upload-file" hidden accept="image/*">

    <div class="builder-actions">
      <button class="btn ghost" type="button" data-action="duplicate">
        Duplicar bloco
      </button>

      <button class="btn primary" type="button" data-action="save">
        Salvar bloco
      </button>
    </div>
  `;
}

function atualizarContatoMapaNaPreview() {
  const doc = getPreviewDoc();
  if (!doc) return;

  const section =
    doc.querySelector('[data-cms-block-id="contato-mapa"]') ||
    doc.querySelector('.map-section');

  if (!section) return;

  section.setAttribute('data-cms-block-id', 'contato-mapa');

  const titulo = getInput('contact-map-title')?.value || 'Localização';
  const texto = getInput('contact-map-text')?.value || '';
  const link = getInput('contact-map-link')?.value || '#';
  const imagem = getInput('contact-map-image')?.value || '';

  const mapBox = section.querySelector('.map-box');
  const h2 = section.querySelector('h2');
  const p = section.querySelector('p');

  if (h2) h2.textContent = titulo;
  if (p) p.textContent = texto;

  if (mapBox) {
    if (imagem) {
      mapBox.style.background = `
        linear-gradient(
          135deg,
          rgba(6,26,53,.48),
          rgba(185,21,27,.24)
        ),
        url("${imagem}")
      `;
      mapBox.style.backgroundSize = 'cover';
      mapBox.style.backgroundPosition = 'center';
    }

    if (link && link !== '#') {
      mapBox.style.cursor = 'pointer';

      mapBox.onclick = () => {
        window.open(link, '_blank');
      };
    } else {
      mapBox.style.cursor = '';
      mapBox.onclick = null;
    }
  }
}

function atualizarProfessoresListaNaPreview() {
  const doc = getPreviewDoc();
  if (!doc) return;

  const section =
    doc.querySelector('[data-cms-block-id="professores-lista"]');

  if (!section) return;

  const titulo =
    getInput('professores-lista-titulo')?.value ||
    'Corpo Docente';

  const texto =
    getInput('professores-lista-texto')?.value || '';

  const professores =
    typeof coletarProfessoresLista === 'function'
      ? coletarProfessoresLista()
      : [];

  section.innerHTML = `
    <div class="section-head">
      <h2>${titulo}</h2>
    </div>

    ${
      texto
        ? `<div class="page-intro"><p>${texto}</p></div>`
        : ''
    }

    ${
      professores.length
        ? `
          <div class="professores-grid">
            ${professores.map(prof => `
              <article class="professor-card">
                <div class="professor-photo">
                  ${
                    prof.foto
                      ? `<img src="${prof.foto}" alt="${prof.nome || 'Professor'}">`
                      : '<span>👨‍🏫</span>'
                  }
                </div>

                <div class="professor-info">
                  ${prof.turno ? `<span>${prof.turno}</span>` : ''}
                  <h3>${prof.nome || 'Professor'}</h3>
                  ${prof.disciplina ? `<strong>${prof.disciplina}</strong>` : ''}
                  ${prof.formacao ? `<p>${prof.formacao}</p>` : ''}
                  ${prof.descricao ? `<small>${prof.descricao}</small>` : ''}
                </div>
              </article>
            `).join('')}
          </div>
        `
        : `
          <div class="single-news-loading">
            Em breve, a equipe de professores será cadastrada.
          </div>
        `
    }
  `;
}

function montarCamposHistoriaBanner(nome) {
  const blocoAtual =
    pageBlocksMap?.historia?.find(b => b.id === 'historia-banner');

  const mongo = blocoAtual?.mongo || {};
  const config = mongo.configuracao || {};

  return `
    <div class="properties-head">
      <h2>Banner da História</h2>
      <span>${nome}</span>
    </div>

    <label>Breadcrumb</label>
    <input
      id="hist-banner-breadcrumb"
      value="${config.breadcrumb || mongo.subtitulo || 'Início › História'}"
    >

    <label>Título</label>
    <input
      id="hist-banner-title"
      value="${mongo.titulo || 'Nossa História'}"
    >

    <label>Subtítulo</label>
    <textarea id="hist-banner-text">${mongo.texto || 'Tradição, disciplina e compromisso com a formação cidadã.'}</textarea>

    <label>Imagem de fundo</label>

    <div class="upload-field">

      <input
        id="hist-banner-image"
        value="${mongo.imagemUrl || ''}"
        placeholder="/uploads/site/banner-historia.png"
      >

      <button
        class="btn upload btn-upload-hist-banner"
        type="button"
        data-target="hist-banner-image"
      >
        Enviar
      </button>

      <button
        class="btn ghost btn-open-media-picker"
        type="button"
        data-target="hist-banner-image"
      >
        Biblioteca
      </button>
    </div>

    <label>Intensidade do overlay</label>

    <select id="hist-banner-overlay">
      <option value="0.94" ${String(config.overlay || '0.94') === '0.94' ? 'selected' : ''}>Forte</option>
      <option value="0.82" ${String(config.overlay || '') === '0.82' ? 'selected' : ''}>Médio</option>
      <option value="0.68" ${String(config.overlay || '') === '0.68' ? 'selected' : ''}>Leve</option>
    </select>

    <input
      type="file"
      id="upload-file"
      hidden
      accept="image/*"
    >

    <div class="builder-actions">

      <button
        class="btn ghost"
        type="button"
        data-action="duplicate"
      >
        Duplicar bloco
      </button>

      <button
        class="btn primary"
        type="button"
        data-action="save"
      >
        Salvar bloco
      </button>

    </div>
  `;
}

function montarCamposHistoriaLinha(nome) {
  const blocoAtual =
    pageBlocksMap?.historia?.find(b => b.id === 'historia-linha');

  const mongo = blocoAtual?.mongo || {};

  const itensSalvos =
    Array.isArray(mongo.itens)
      ? mongo.itens
      : [];

  const itens = itensSalvos.length
    ? itensSalvos.map(item => ({
        ano: item.ano || item.data || item.titulo || '',
        texto: item.texto || item.descricao || '',
        destaque: item.destaque || false
      }))
    : [
        {
          ano: '2026',
          texto: 'Adicione marcos históricos pelo CMS.',
          destaque: true
        }
      ];

  return `
    <div class="properties-head">
      <h2>Linha do Tempo</h2>
      <span>${nome}</span>
    </div>

    <label>Título da seção</label>
    <input
      id="timeline-section-title"
      value="${mongo.titulo || 'Linha do Tempo'}"
    >

    <div id="timeline-fields">
      ${itens.map((item, index) => `
        <div class="timeline-item-editor" data-timeline-index="${index + 1}">
          <div class="news-editor-top">
            <strong>Marco ${index + 1}</strong>

            <div class="quick-item-controls">
              <button type="button" class="btn-timeline-up">↑</button>
              <button type="button" class="btn-timeline-down">↓</button>

              <label style="display:flex;align-items:center;gap:6px;">
                <input
                  type="checkbox"
                  id="timeline-featured-${index + 1}"
                  ${item.destaque ? 'checked' : ''}
                >
                Destaque
              </label>
            </div>
          </div>

          <label>Ano</label>
          <input
            id="timeline-year-${index + 1}"
            value="${item.ano || ''}"
          >

          <label>Descrição</label>
          <textarea id="timeline-text-${index + 1}">${item.texto || ''}</textarea>

          <button class="btn ghost btn-remove-timeline" type="button">
            Remover marco
          </button>
        </div>
      `).join('')}
    </div>

    <button class="btn ghost full" id="btn-add-timeline-item" type="button">
      + Adicionar marco histórico
    </button>

    <div class="builder-actions">
      <button class="btn ghost" type="button" data-action="duplicate">Duplicar bloco</button>
      <button class="btn primary" type="button" data-action="save">Salvar bloco</button>
    </div>
  `;
}

function montarCamposProfessoresBanner(nome) {
  const blocoAtual =
    pageBlocksMap?.professores?.find(b => b.id === 'professores-banner');

  const mongo = blocoAtual?.mongo || {};

  return `
    <div class="properties-head">
      <h2>Banner Professores</h2>
      <span>${nome}</span>
    </div>

    <label>Título</label>
    <input
      id="professores-banner-titulo"
      value="${mongo.titulo || 'Nossos Professores'}"
    >

    <label>Subtítulo</label>
    <textarea id="professores-banner-texto">${mongo.texto || 'Conheça nossa equipe docente e acesse materiais disponibilizados pelos professores.'}</textarea>

    <label>Imagem de fundo</label>

    <div class="upload-field">
      <input
        id="professores-banner-imagem"
        value="${mongo.imagemUrl || ''}"
        placeholder="/uploads/site/banner-professores.png"
      >

      <button
        class="btn upload btn-upload-professores-banner"
        type="button"
        data-target="professores-banner-imagem"
      >
        Enviar
      </button>

      <button
        class="btn ghost btn-open-media-picker"
        type="button"
        data-target="professores-banner-imagem"
      >
        Biblioteca
      </button>
    </div>

    <input type="file" id="upload-file" hidden accept="image/*">

    <div class="builder-actions">
      <button class="btn primary" type="button" data-action="save">
        Salvar bloco
      </button>
    </div>
  `;
}

function montarItemProfessorLista(n, item = {}) {
  return `
    <div class="professor-editor" data-professor-index="${n}">
      <div class="news-editor-top">
        <strong>Professor ${n}</strong>

        <div class="quick-item-controls">
          <button type="button" class="btn-professor-up">↑</button>
          <button type="button" class="btn-professor-down">↓</button>
        </div>
      </div>

      <label>Foto</label>
      <div class="upload-field">
        <input
          id="professor-foto-${n}"
          value="${item.foto || item.imagem || ''}"
          placeholder="/uploads/site/professor.png"
        >

        <button
          class="btn upload btn-upload-professores-foto"
          type="button"
          data-target="professor-foto-${n}"
        >
          Enviar
        </button>

        <button
          class="btn ghost btn-open-media-picker"
          type="button"
          data-target="professor-foto-${n}"
        >
          Biblioteca
        </button>
      </div>

      <label>Nome</label>
      <input id="professor-nome-${n}" value="${item.nome || ''}">

      <label>Disciplina / Área</label>
      <input id="professor-disciplina-${n}" value="${item.disciplina || ''}">

      <label>Formação</label>
      <textarea id="professor-formacao-${n}">${item.formacao || ''}</textarea>

      <label>Turno</label>
      <select id="professor-turno-${n}">
        <option value="Matutino" ${item.turno === 'Matutino' ? 'selected' : ''}>Matutino</option>
        <option value="Vespertino" ${item.turno === 'Vespertino' ? 'selected' : ''}>Vespertino</option>
        <option value="Matutino e Vespertino" ${item.turno === 'Matutino e Vespertino' ? 'selected' : ''}>Matutino e Vespertino</option>
      </select>

      <label>Descrição</label>
      <textarea id="professor-descricao-${n}">${item.descricao || item.texto || ''}</textarea>

      <button class="btn ghost btn-remove-professor" type="button">
        Remover professor
      </button>
    </div>
  `;
}

function montarCamposProfessoresLista(nome) {
  const blocoAtual = getBlocoCmsAtual('professores-lista');

  const itensSalvos =
    Array.isArray(blocoAtual?.mongo?.itens)
      ? blocoAtual.mongo.itens
      : [];

  const professores = itensSalvos.length
    ? itensSalvos
    : [
        {
          foto: '',
          nome: '',
          disciplina: '',
          formacao: '',
          turno: 'Matutino',
          descricao: ''
        }
      ];

  return `
    <div class="properties-head">
      <h2>Lista de Professores</h2>
      <span>${nome}</span>
    </div>

    <label>Título da seção</label>
    <input
      id="professores-lista-titulo"
      value="${blocoAtual?.mongo?.titulo || 'Corpo Docente'}"
    >

    <label>Descrição da seção</label>
    <textarea id="professores-lista-texto">${blocoAtual?.mongo?.texto || 'Conheça os professores que compõem nossa equipe docente.'}</textarea>

    <div id="professores-lista-fields">
      ${professores.map((item, index) =>
        montarItemProfessorLista(index + 1, item)
      ).join('')}
    </div>

    <input type="file" id="upload-file" hidden accept="image/*">

    <button class="btn ghost full" id="btn-add-professor-lista" type="button">
      + Adicionar professor
    </button>

    <div class="builder-actions">
      <button class="btn ghost" type="button" data-action="duplicate">Duplicar bloco</button>
      <button class="btn primary" type="button" data-action="save">Salvar bloco</button>
    </div>
  `;
}

function coletarProfessoresLista() {
  const campos = [...document.querySelectorAll('.professor-editor')];

  return campos.map((box, index) => {
    const i = box.dataset.professorIndex;

    return {
      ordem: index,
      foto: getInput(`professor-foto-${i}`)?.value || '',
      nome: getInput(`professor-nome-${i}`)?.value || '',
      disciplina: getInput(`professor-disciplina-${i}`)?.value || '',
      formacao: getInput(`professor-formacao-${i}`)?.value || '',
      turno: getInput(`professor-turno-${i}`)?.value || '',
      descricao: getInput(`professor-descricao-${i}`)?.value || ''
    };
  }).filter(item =>
    item.nome.trim() ||
    item.disciplina.trim() ||
    item.foto.trim()
  );
}

function adicionarProfessorLista() {
  const container = document.getElementById('professores-lista-fields');
  if (!container) return;

  const novo = Date.now();
  const wrap = document.createElement('div');

  wrap.innerHTML = montarItemProfessorLista(novo, {
    foto: '',
    nome: 'Novo professor',
    disciplina: '',
    formacao: '',
    turno: 'Matutino',
    descricao: ''
  });

  container.appendChild(wrap.firstElementChild);

  ligarEventosCamposDinamicos();
  atualizarPreview();

  showToast('Professor adicionado.');
}

function montarItemMaterialProfessor(n, item = {}) {
  return `
    <div class="professor-material-editor" data-material-index="${n}">
      <div class="news-editor-top">
        <strong>Material ${n}</strong>

        <div class="quick-item-controls">
          <button type="button" class="btn-material-professor-up">↑</button>
          <button type="button" class="btn-material-professor-down">↓</button>
        </div>
      </div>

      <label>Título do material</label>
      <input id="professor-material-titulo-${n}" value="${item.titulo || ''}">

      <label>Professor / disciplina</label>
      <input id="professor-material-professor-${n}" value="${item.professor || item.disciplina || ''}">

      <label>Descrição</label>
      <textarea id="professor-material-texto-${n}">${item.texto || item.descricao || ''}</textarea>

      <label>Arquivo / link</label>
      <div class="upload-field">
        <input
          id="professor-material-url-${n}"
          value="${item.url || item.link || item.arquivo || ''}"
          placeholder="/uploads/site/material.pdf"
        >

        <button
          class="btn upload btn-upload-professores-material"
          type="button"
          data-target="professor-material-url-${n}">
          Enviar
        </button>

        <button
          class="btn ghost btn-open-media-picker"
          type="button"
          data-target="professor-material-url-${n}">
          Biblioteca
        </button>
      </div>

      <button class="btn ghost btn-remove-material-professor" type="button">
        Remover material
      </button>
    </div>
  `;
}

function montarCamposProfessoresMateriais(nome) {
  const blocoAtual =
    pageBlocksMap?.professores?.find(b => b.id === 'professores-materiais');

  const mongo = blocoAtual?.mongo || {};

  const materiais =
    Array.isArray(mongo.itens) && mongo.itens.length
      ? mongo.itens
      : [];

  return `
    <div class="properties-head">
      <h2>Materiais dos Professores</h2>
      <span>${nome}</span>
    </div>

    <label>Título da seção</label>
    <input
      id="professores-materiais-titulo"
      value="${mongo.titulo || 'Materiais dos Professores'}">

    <label>Descrição</label>
    <textarea id="professores-materiais-texto">${mongo.texto || ''}</textarea>

    <div id="materiais-professores-container">
      ${materiais.map((item, index) =>
        montarItemMaterialProfessor(index + 1, item)
      ).join('')}
    </div>

    <button
      class="btn ghost full"
      id="btn-add-material-professor"
      type="button">
      + Adicionar Material
    </button>

    <div class="builder-actions">
      <button class="btn primary" type="button" data-action="save">
        Salvar bloco
      </button>
    </div>
  `;
}

function coletarMateriaisProfessores() {
  const campos = [...document.querySelectorAll('.professor-material-editor')];

  return campos.map((box, index) => {
    const i = box.dataset.materialIndex;

    return {
      ordem: index,
      titulo: getInput(`professor-material-titulo-${i}`)?.value || '',
      professor: getInput(`professor-material-professor-${i}`)?.value || '',
      texto: getInput(`professor-material-texto-${i}`)?.value || '',
      url: getInput(`professor-material-url-${i}`)?.value || ''
    };
  }).filter(item =>
    item.titulo.trim() ||
    item.professor.trim() ||
    item.url.trim()
  );
}

function adicionarMaterialProfessor() {
  const container = document.getElementById('materiais-professores-container');
  if (!container) return;

  const novo = Date.now();
  const wrap = document.createElement('div');

  wrap.innerHTML = montarItemMaterialProfessor(novo, {
    titulo: 'Novo material',
    professor: '',
    texto: '',
    url: ''
  });

  container.appendChild(wrap.firstElementChild);

  ligarEventosCamposDinamicos();
  atualizarPreview();

  showToast('Material adicionado.');
}

function atualizarProfessoresMateriaisNaPreview() {
  const doc = getPreviewDoc();
  if (!doc) return;

  const section =
    doc.querySelector('[data-cms-block-id="professores-materiais"]');

  if (!section) return;

  const titulo =
    getInput('professores-materiais-titulo')?.value ||
    'Materiais dos Professores';

  const texto =
    getInput('professores-materiais-texto')?.value || '';

  const materiais = coletarMateriaisProfessores();

  section.innerHTML = `
    <div class="section-head">
      <h2>${titulo}</h2>
    </div>

    ${texto ? `<div class="page-intro"><p>${texto}</p></div>` : ''}

    ${
      materiais.length
        ? `
          <div class="materials-grid">
            ${materiais.map(item => `
              <article class="material-card">
                <div>
                  <span>📄</span>
                  <h3>${item.titulo || 'Material'}</h3>
                  ${item.professor ? `<strong>${item.professor}</strong>` : ''}
                  ${item.texto ? `<p>${item.texto}</p>` : ''}
                </div>

                ${
                  item.url
                    ? `<a class="btn primary" href="${item.url}" target="_blank">Acessar material</a>`
                    : ''
                }
              </article>
            `).join('')}
          </div>
        `
        : `
          <div class="single-news-loading">
            Nenhum material cadastrado ainda.
          </div>
        `
    }
  `;
}

function montarCamposDoBloco(id, nome) {
      if (id.includes('-dinamico')) {
    return montarCamposBlocoDinamico(id, nome);
  }

if (id === 'direcao-banner') {
  return montarCamposDirecaoBanner(nome);
}

if (id === 'direcao-intro') {
  return montarCamposDirecaoIntro(nome);
}

if (id === 'direcao-equipe') {
  return montarCamposDirecaoEquipe(nome);
}

if (id === 'direcao-chamada') {
  return montarCamposDirecaoChamada(nome);
}

if (id === 'alunos-banner') {
  return montarCamposAlunosBanner(nome);
}

if (id === 'alunos-intro') {
  return montarCamposAlunosIntro(nome);
}

if (id === 'alunos-destaque') {
  return montarCamposAlunosDestaque(nome);
}

if (id === 'alunos-numeros') {
  return montarCamposAlunosNumeros(nome);
}

if (id === 'alunos-projetos') {
  return montarCamposAlunosProjetos(nome);
}

if (id === 'alunos-chamada') {
  return montarCamposAlunosChamada(nome);
}

if (id === 'processo-banner') {
  return montarCamposProcessoBanner(nome);
}

if (id === 'processo-etapas') {
  return montarCamposProcessoEtapas(nome);
}

if (id === 'processo-cronograma') {
  return montarCamposProcessoCronograma(nome);
}

if (id === 'processo-certames') {
  return montarCamposProcessoCertames(nome);
}

if (id === 'processo-editais') {
  return montarCamposProcessoEditais(nome);
}

if (id === 'processo-chamada') {
  return montarCamposProcessoChamada(nome);
}

if (id === 'noticias-banner') {
  return montarCamposNoticiasBanner(nome);
}

if (id === 'noticias-lista') {
  return montarCamposNoticiasLista(nome);
}

if (id === 'noticias-categorias') {
  return montarCamposNoticiasCategorias(nome);
}

if (id === 'noticias-recentes') {
  return montarCamposNoticiasRecentes(nome);
}

if (id === 'noticias-suporte') {
  return montarCamposNoticiasSuporte(nome);
}

if (id === 'galeria-banner') {
  return montarCamposGaleriaBanner(nome);
}

if (id === 'galeria-filtros') {
  return montarCamposGaleriaFiltros(nome);
}

if (id === 'galeria-grid') {
  return montarCamposGaleriaGrid(nome);
}

if (id === 'galeria-video') {
  return montarCamposGaleriaVideo(nome);
}

if (id === 'contato-banner') {
  return montarCamposContatoBanner(nome);
}

if (id === 'contato-info') {
  return montarCamposContatoInfos(nome);
}

if (id === 'contato-form') {
  return montarCamposContatoFormulario(nome);
}

if (id === 'contato-mapa') {
  return montarCamposContatoMapa(nome);
}

if (id === 'professores-banner') {
  return montarCamposProfessoresBanner(nome);
}

if (id === 'professores-lista') {
  return montarCamposProfessoresLista(nome);
}

if (id === 'professores-materiais') {
  return montarCamposProfessoresMateriais(nome);
}

    /* =========================
   HOME
   ========================= */

  
if (
  id === 'home-banner' ||
  id === 'saber-honra-disciplina' ||
  nome?.toLowerCase().includes('saber') ||
  nome?.toLowerCase().includes('disciplina')
) {
  const blocoAtual =
  pageBlocksMap?.home?.find(b =>
    b.id === 'home-banner' ||
    b.id === id ||
    b.nome?.toLowerCase().includes('saber') ||
    b.nome?.toLowerCase().includes('disciplina')
  );

  const mongo = blocoAtual?.mongo || {};
  const link = mongo.link || {};

  const slidesSalvos =
    Array.isArray(mongo.itens) && mongo.itens.length
      ? mongo.itens
      : [
          {
            titulo: mongo.titulo || 'Disciplina, educação e valores para a vida.',
            texto: mongo.texto || 'Formando cidadãos conscientes, preparados para o futuro e comprometidos com a sociedade.',
            imagemUrl: mongo.imagemUrl || '',
            botaoTexto: link.texto || 'Conheça nossa história',
            botaoLink: link.url || './historia.html'
          }
        ];

  return `
    <div class="properties-head">
      <h2>Banner Principal</h2>
      <span>${nome}</span>
    </div>

    <div class="cms-alert-info">
      O primeiro slide será usado também como conteúdo principal do banner.
    </div>

    <div id="home-banner-slides">
      ${slidesSalvos.map((slide, index) => `
        <div class="home-banner-slide" data-slide-index="${index + 1}">
          <div class="news-editor-top">
            <strong>Slide ${index + 1}</strong>

            <div class="quick-item-controls">
              <button type="button" class="btn-remove-home-banner-slide">
                Remover
              </button>
            </div>
          </div>

          <label>Título do slide</label>
          <input
            class="slide-title"
            value="${slide.titulo || ''}"
            placeholder="Título do banner"
          >

          <label>Texto do slide</label>
          <textarea
            class="slide-text"
            placeholder="Texto de apoio do banner"
          >${slide.texto || ''}</textarea>

          <label>Texto do botão</label>
          <input
            class="slide-button-text"
            value="${slide.botaoTexto || 'Conheça nossa história'}"
            placeholder="Texto do botão"
          >

          <label>Link do botão</label>
          <input
            class="slide-button-link"
            value="${slide.botaoLink || './historia.html'}"
            placeholder="./historia.html"
          >

          <label>Imagem de fundo</label>
          <div class="upload-field">
            <input
              class="slide-image"
              id="home-banner-slide-image-${index + 1}"
              value="${slide.imagemUrl || slide.imagem || ''}"
              placeholder="/uploads/site/banner-home.png"
            >

            <button
              class="btn ghost btn-open-media-picker"
              type="button"
              data-target="home-banner-slide-image-${index + 1}"
            >
              Biblioteca
            </button>
          </div>
        </div>
      `).join('')}
    </div>

    <button class="btn ghost full" id="btn-add-home-banner-slide" type="button">
      + Adicionar slide
    </button>

    <input type="hidden" id="hero-title" value="${mongo.titulo || ''}">
    <input type="hidden" id="hero-text" value="${mongo.texto || ''}">
    <input type="hidden" id="button-text" value="${link.texto || ''}">
    <input type="hidden" id="button-link" value="${link.url || ''}">
    <input type="hidden" id="image-url" value="${mongo.imagemUrl || ''}">

    <input type="file" id="upload-file" hidden accept="image/*">

    <div class="builder-actions">
      <button class="btn ghost" type="button" data-action="duplicate">Duplicar bloco</button>
      <button class="btn primary" type="button" data-action="save">Salvar bloco</button>
    </div>
  `;
}

if (id === 'home-menu') {
  return `
    <div class="properties-head">
      <h2>Menu Rápido</h2>
      <span>${nome}</span>
    </div>

    <div id="home-menu-fields">
      ${[1,2,3,4,5,6,7].map((n) => `
        <div class="menu-item-editor" data-menu-index="${n}">
          <label>Atalho ${n}</label>

          <div class="cms-field-row">
            <input id="home-menu-icon-${n}" value="${['📝','🖼️','🏛️','📞','🎓','📚','📢'][n-1] || '🔗'}" placeholder="Ícone">
            <input id="home-menu-${n}" value="${['Processo Seletivo','Galeria','História','Contato','Direção','Corpo de Alunos','Notícias'][n-1] || ''}" placeholder="Texto do atalho">
          </div>

          <input id="home-menu-link-${n}" value="${['./processo-seletivo.html','./galeria.html','./historia.html','./contato.html','./direcao.html','./corpo-alunos.html','./noticias.html'][n-1] || '#'}" placeholder="Link do atalho">

<div class="quick-item-controls">
  <button type="button" class="btn-menu-up">↑</button>
  <button type="button" class="btn-menu-down">↓</button>

  <label style="display:flex;align-items:center;gap:6px;">
    <input type="checkbox" id="home-menu-featured-${n}">
    Destaque
  </label>
</div>
          <button class="btn ghost btn-remove-home-menu" type="button" data-remove="${n}">
            Remover este atalho
          </button>
        </div>
      `).join('')}
    </div>

    <button class="btn ghost full" id="btn-add-home-menu" type="button">
      + Adicionar atalho
    </button>

    <div class="builder-actions">
      <button class="btn ghost" type="button" data-action="duplicate">Duplicar bloco</button>
      <button class="btn primary" type="button" data-action="save">Salvar bloco</button>
    </div>
  `;
}

if (id === 'home-noticias') {
  return montarCamposHomeNoticias(nome);
}

if (id === 'home-estatisticas') {
  return montarCamposHomeEstatisticas(nome);
}

if (id === 'home-galeria') {
  return montarCamposHomeGaleria(nome);
}

if (id === 'home-patrocinadores') {
  return montarCamposHomePatrocinadores(nome);
}

if (id === 'home-associacao') {
  return montarCamposHomeAssociacao(nome);
}

if (id === 'home-documentos') {
  return montarCamposHomeDocumentos(nome);
}

if (id === 'home-video') {
  return montarCamposHomeVideo(nome);
}

if (id === 'historia-banner') {
  return montarCamposHistoriaBanner(nome);
}

  if (id === 'historia-menu') {
  return montarCamposMenuHistoria(nome);
}

  if (id === 'historia-linha') {
  return montarCamposHistoriaLinha(nome);
}

  if (id === 'historia-video') {
  return montarCamposHistoriaVideo(nome);
}

  if (id === 'historia-texto') {
  return montarCamposHistoriaTexto(nome);
}

  return `
    <div class="properties-head">
      <h2>Propriedades do bloco</h2>
      <span>${nome}</span>
    </div>

    <label>Título principal</label>
    <input id="hero-title" value="${nome}">
    

    <label>Texto</label>
    <textarea id="hero-text">Edite aqui o texto de apresentação deste bloco.</textarea>

    <label>Texto do botão</label>
    <input id="button-text" value="Saiba mais">

    <label>Link do botão</label>
    <input id="button-link" value="#">

    <label>Imagem de fundo</label>
    <input id="image-url">

    <input type="file" id="upload-file" hidden>

    <button class="btn upload" id="btn-upload" type="button">
      Enviar imagem / arquivo
    </button>

    <div class="builder-actions">
      <button class="btn ghost" type="button" data-action="duplicate">Duplicar bloco</button>
      <button class="btn primary" type="button" data-action="save">Salvar bloco</button>
    </div>
  `;
}

function coletarMenuGlobal() {
  const itens = [...document.querySelectorAll('.global-menu-item')];

  return itens.map((item, index) => {
    const texto =
      item.querySelector('.global-menu-text')?.value ||
      item.querySelectorAll('input')[0]?.value ||
      '';

    const link =
      item.querySelector('.global-menu-link')?.value ||
      item.querySelectorAll('input')[1]?.value ||
      '#';

    return {
      ordem: index,
      texto,
      link,
      destaque: item.querySelector('.global-menu-featured')?.checked || false,
      novaAba: item.querySelector('.global-menu-blank')?.checked || false
    };
  }).filter(item => item.texto.trim());
}

function coletarLinksFooterGlobal() {
  const itens = [...document.querySelectorAll('.global-footer-link-item')];

  const links = itens.map((item, index) => {
    return {
      ordem: index,
      texto: item.querySelector('.global-footer-link-text')?.value || '',
      link: item.querySelector('.global-footer-link-url')?.value || '#'
    };
  }).filter(item => item.texto.trim());

  if (links.length) return links;

  return coletarMenuGlobal().slice(0, 5);
}

function aplicarLayoutGlobalNaPreview() {
  const doc = getPreviewDoc();
  if (!doc) return;

  aplicarHeaderGlobalNaPreview(doc);
  aplicarFooterGlobalNaPreview(doc);
}

function aplicarHeaderGlobalNaPreview(doc) {
  const topbar = doc.querySelector('.topbar');
  if (!topbar) return;

  const title = getInput('global-header-title')?.value || 'COLÉGIO DOM PEDRO II';
  const subtitle = getInput('global-header-subtitle')?.value || 'CAMPUS CZS SUL';
  const small = getInput('global-header-small')?.value || 'Unidade de Ensino do CBMAC';
  const btnText = getInput('global-header-button-text')?.value || 'Acesso Axoriin';
  const btnLink = getInput('global-header-button-link')?.value || 'https://axoriin.com.br';
  const logo = getInput('global-header-logo')?.value || '';

  const brandSeal = topbar.querySelector('.brand-seal');
  const brandStrong = topbar.querySelector('.brand strong');
  const brandSpan = topbar.querySelector('.brand span');
  const brandSmall = topbar.querySelector('.brand small');
  const nav = topbar.querySelector('.nav');
  const axoriinBtn = topbar.querySelector('.btn-axoriin');

  if (brandSeal && logo) {
    brandSeal.innerHTML = `<img src="${logo}" alt="${title}">`;
    brandSeal.classList.add('cms-global-logo-preview');
  }

  if (brandStrong) brandStrong.textContent = title;
  if (brandSpan) brandSpan.textContent = subtitle;
  if (brandSmall) brandSmall.textContent = small;

  if (nav) {
    const itens = coletarMenuGlobal();

    nav.innerHTML = itens.map(item => `
  <a
    href="${item.link || '#'}"
    class="${item.destaque ? 'cms-global-menu-featured' : ''}"
    ${item.novaAba ? 'target="_blank" rel="noopener noreferrer"' : ''}
  >
    ${item.texto}
  </a>
`).join('');
  }

  if (axoriinBtn) {
    axoriinBtn.textContent = btnText;
    axoriinBtn.href = btnLink;
  }

  aplicarEstilosLayoutGlobalPreview(doc);
}

function aplicarFooterGlobalNaPreview(doc) {
  const footer = doc.querySelector('.footer');
  const copyright = doc.querySelector('.copyright');

  if (!footer) return;

  const title = getInput('global-footer-title')?.value || 'Colégio Dom Pedro II';
  const subtitle = getInput('global-footer-subtitle')?.value || 'Campus CZS Sul';
  const description = getInput('global-footer-description')?.value || '';
  const phone = getInput('global-footer-phone')?.value || '';
  const email = getInput('global-footer-email')?.value || '';
  const address = getInput('global-footer-address')?.value || '';
  const copyrightText = getInput('global-footer-copyright')?.value || '';

  const menu = coletarLinksFooterGlobal();

  footer.innerHTML = `
    <div>
      <h3>${title}</h3>
      <p>${subtitle}</p>
      <small>${description}</small>
    </div>

    <div>
      <h4>Links rápidos</h4>
      ${menu.map(item => `
  <a href="${item.link || '#'}">
    ${item.texto}
  </a>
`).join('')}
    </div>

    <div>
      <h4>Contato</h4>
      <p>📞 ${phone}</p>
      <p>✉️ ${email}</p>
      <p>📍 ${address}</p>
    </div>
  `;

  if (copyright) {
    copyright.textContent = copyrightText;
  }
}

function aplicarEstilosLayoutGlobalPreview(doc) {
  if (doc.getElementById('cms-global-layout-style')) return;

  const style = doc.createElement('style');
  style.id = 'cms-global-layout-style';

  style.textContent = `
  .cms-global-logo-preview {
    overflow: hidden;
    background: rgba(255,255,255,.08) !important;
    border: 1px solid rgba(255,255,255,.12);
    box-shadow: 0 8px 22px rgba(0,0,0,.16);
    backdrop-filter: blur(10px);
  }

  .cms-global-logo-preview img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    display: block;
  }

  .topbar .nav a {
    position: relative;
    padding: 10px 12px;
    border-radius: 999px;
    transition:
      background .22s ease,
      color .22s ease,
      transform .22s ease,
      box-shadow .22s ease;
  }

  .topbar .nav a:hover {
    background: rgba(255,255,255,.10);
    color: #f5b51b;
  }

  .topbar .nav a.cms-global-menu-featured {
    background:
      linear-gradient(
        135deg,
        #b9151b,
        #7f1015
      );

    color: #fff;
    padding: 11px 18px;

    border:
      1px solid rgba(255,255,255,.16);

    box-shadow:
      0 10px 24px rgba(185,21,27,.28);

    font-weight: 800;
  }

  .topbar .nav a.cms-global-menu-featured:hover {
    transform: translateY(-1px);

    color: #fff;

    box-shadow:
      0 14px 34px rgba(185,21,27,.38);
  }

  @media (max-width: 880px) {
    .topbar .nav {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      justify-content: center;
    }

    .topbar .nav a {
      font-size: 12px;
      padding: 8px 10px;
    }

    .topbar .nav a.cms-global-menu-featured {
      padding: 9px 14px;
    }
  }
`;


  doc.head.appendChild(style);
}

/* =========================
   EVENTOS DOS CAMPOS DINÂMICOS
   ========================= */

function ligarEventosCamposDinamicos() {
  document.querySelectorAll('.builder-properties input, .builder-properties textarea, .builder-properties select')
    .forEach(el => {
      el.addEventListener('input', atualizarPreview);
      el.addEventListener('change', atualizarPreview);
    });

  document.getElementById('btn-upload')?.addEventListener('click', () => {
    cmsUploadTarget = null;
    document.getElementById('upload-file')?.click();
  });

  document.querySelectorAll(
    ' .btn-upload-dynamic-image, .btn-upload-news-image, .btn-upload-gallery-image, .btn-upload-video-cover, .btn-upload-hist-video, .btn-upload-hist-banner, .btn-upload-direcao-banner, .btn-upload-team-photo, .btn-upload-direcao-chamada, .btn-upload-alunos-banner, .btn-upload-alunos-destaque, .btn-upload-alunos-chamada, .btn-upload-processo-banner, .btn-upload-process-edital, .btn-upload-processo-chamada, .btn-upload-noticias-banner, .btn-upload-news-list, .btn-upload-recent-news, .btn-upload-galeria-banner, .btn-upload-gallery-grid, .btn-upload-galeria-video, .btn-upload-contato-banner, .btn-upload-contact-map, .btn-upload-certame-doc, .btn-upload-professores-banner, .btn-upload-professores-foto, .btn-upload-professores-material'
  ).forEach(btn => {
    btn.addEventListener('click', () => {
      cmsUploadTarget = btn.dataset.target;
      document.getElementById('upload-file')?.click();
    });
  });

  document.getElementById('btn-add-home-news')?.addEventListener('click', adicionarCampoHomeNoticia);
document.getElementById('btn-add-home-stats')?.addEventListener('click', adicionarCampoHomeEstatistica);
document.getElementById('btn-add-home-gallery')?.addEventListener('click', adicionarCampoHomeGaleria);
/* =========================
   HOME BANNER SLIDES
   ========================= */

document
  .getElementById('btn-add-home-banner-slide')
  ?.addEventListener(
    'click',
    adicionarSlideHomeBanner
  );

document
  .querySelectorAll('.btn-remove-home-banner-slide')
  .forEach(btn => {

    btn.onclick = () => {

      const slide =
        btn.closest('.home-banner-slide');

      const total =
        document.querySelectorAll('.home-banner-slide').length;

      if (total <= 1) {

        showToast(
          'O banner precisa ter pelo menos um slide.'
        );

        return;
      }

      slide?.remove();

      atualizarPreview();

      showToast('Slide removido.');
    };

  });

document.getElementById('btn-add-home-doc')?.addEventListener('click', adicionarHomeDocumento);

document.querySelectorAll('.btn-add-home-doc-file').forEach(btn => {
  btn.addEventListener('click', () => {
    adicionarArquivoHomeDocumento(btn.dataset.cardIndex);
  });
});

document.querySelectorAll('.btn-remove-home-doc-file').forEach(btn => {
  btn.addEventListener('click', () => {
    const item = btn.closest('.home-doc-file-editor');
    if (!item) return;

    item.remove();
    atualizarPreview();

    showToast('Documento removido.');
  });
});

// ===== PROFESSORES =====

document.getElementById('btn-add-professor-lista')?.addEventListener(
  'click',
  adicionarProfessorLista
);

document.querySelectorAll('.btn-remove-professor').forEach(btn => {
  btn.addEventListener('click', () => {
    const item = btn.closest('.professor-editor');
    if (!item) return;

    item.remove();

    atualizarPreview();

    showToast('Professor removido.');
  });
});

document.getElementById('btn-add-material-professor')
  ?.addEventListener(
    'click',
    adicionarMaterialProfessor
  );

document.querySelectorAll('.btn-remove-material-professor').forEach(btn => {
  btn.addEventListener('click', () => {
    const item =
      btn.closest('.professor-material-editor');

    if (!item) return;

    item.remove();

    atualizarPreview();

    showToast('Material removido.');
  });
});

document.querySelectorAll('.btn-upload-home-doc-file').forEach(btn => {
  btn.addEventListener('click', () => {
    cmsUploadTarget = btn.dataset.target;
    document.getElementById('upload-file')?.click();
  });
});

document.getElementById('btn-add-home-assoc-project')?.addEventListener('click', adicionarProjetoAssociacaoHome);

document.querySelectorAll('.btn-remove-home-assoc-project').forEach(btn => {
  btn.addEventListener('click', () => {
    const item = btn.closest('.home-assoc-project-editor');
    if (!item) return;

    item.remove();
    atualizarPreview();

    showToast('Imagem/projeto removido.');
  });
});

document.querySelectorAll('.btn-home-assoc-project-up').forEach(btn => {
  btn.addEventListener('click', () => {
    const item = btn.closest('.home-assoc-project-editor');
    const prev = item?.previousElementSibling;

    if (item && prev) {
      item.parentNode.insertBefore(item, prev);
      atualizarPreview();
    }
  });
});

document.querySelectorAll('.btn-home-assoc-project-down').forEach(btn => {
  btn.addEventListener('click', () => {
    const item = btn.closest('.home-assoc-project-editor');
    const next = item?.nextElementSibling;

    if (item && next) {
      item.parentNode.insertBefore(next, item);
      atualizarPreview();
    }
  });
});

document.querySelectorAll('.btn-upload-home-assoc-project').forEach(btn => {
  btn.addEventListener('click', () => {
    cmsUploadTarget = btn.dataset.target;
    document.getElementById('upload-file')?.click();
  });
});

document.getElementById('btn-add-timeline-item')?.addEventListener('click', adicionarMarcoTimelineHistoria);
document.getElementById('btn-add-hist-menu-item')?.addEventListener('click', adicionarItemMenuHistoria);
document.getElementById('btn-add-hist-paragraph')?.addEventListener('click', adicionarParagrafoHistoria);
document.getElementById('btn-add-team-member')?.addEventListener('click', adicionarMembroEquipeDirecao);

document.querySelectorAll('.btn-remove-home-doc').forEach(btn => {
  btn.addEventListener('click', () => {
    const item = btn.closest('.home-doc-editor');
    if (!item) return;

    item.remove();

    atualizarPreview();

    showToast('Card removido.');
  });
});

document.querySelectorAll('.btn-home-doc-up').forEach(btn => {
  btn.addEventListener('click', () => {
    const item = btn.closest('.home-doc-editor');
    const prev = item?.previousElementSibling;

    if (item && prev) {
      item.parentNode.insertBefore(item, prev);

      atualizarPreview();
    }
  });
});

document.querySelectorAll('.btn-home-doc-down').forEach(btn => {
  btn.addEventListener('click', () => {
    const item = btn.closest('.home-doc-editor');
    const next = item?.nextElementSibling;

    if (item && next) {
      item.parentNode.insertBefore(next, item);

      atualizarPreview();
    }
  });
});

  document.querySelectorAll('.btn-remove-news').forEach(btn => {
    btn.addEventListener('click', () => {
      const item = btn.closest('.news-item-editor');
      if (!item) return;
      item.remove();
      atualizarPreview();
      showToast('Notícia removida.');
    });
  });

  document.querySelectorAll('.btn-remove-stats').forEach(btn => {
    btn.addEventListener('click', () => {
      const item = btn.closest('.stats-item-editor');
      if (!item) return;
      item.remove();
      atualizarPreview();
      showToast('Estatística removida.');
    });
  });

  document.querySelectorAll('.btn-remove-gallery').forEach(btn => {
    btn.addEventListener('click', () => {
      const item = btn.closest('.gallery-item-editor');
      if (!item) return;
      item.remove();
      atualizarPreview();
      showToast('Imagem removida.');
    });
  });

  document.querySelectorAll('.btn-remove-timeline').forEach(btn => {
    btn.addEventListener('click', () => {
      const item = btn.closest('.timeline-item-editor');
      if (!item) return;
      item.remove();
      atualizarPreview();
      showToast('Marco histórico removido.');
    });
  });

  document.querySelectorAll('.btn-remove-hist-menu').forEach(btn => {
    btn.addEventListener('click', () => {
      const item = btn.closest('.hist-menu-item-editor');
      if (!item) return;
      item.remove();
      atualizarPreview();
      showToast('Item do menu removido.');
    });
  });

  document.querySelectorAll('.btn-remove-hist-paragraph').forEach(btn => {
    btn.addEventListener('click', () => {
      const item = btn.closest('.hist-paragraph-editor');
      if (!item) return;
      item.remove();
      atualizarPreview();
      showToast('Parágrafo removido.');
    });
  });

  document.querySelectorAll('.btn-remove-team').forEach(btn => {
    btn.addEventListener('click', () => {
      const item = btn.closest('.team-item-editor');
      if (!item) return;
      item.remove();
      atualizarPreview();
      showToast('Membro removido.');
    });
  });

  document.querySelectorAll(
    '.btn-news-up, .btn-stats-up, .btn-gallery-up, .btn-timeline-up, .btn-hist-menu-up, .btn-hist-paragraph-up, .btn-team-up'
  ).forEach(btn => {
    btn.addEventListener('click', () => {
      const item = btn.closest(
        '.news-item-editor, .stats-item-editor, .gallery-item-editor, .timeline-item-editor, .hist-menu-item-editor, .hist-paragraph-editor, .team-item-editor'
      );

      const prev = item?.previousElementSibling;

      if (item && prev) {
        item.parentNode.insertBefore(item, prev);
        atualizarPreview();
      }
    });
  });

  document.querySelectorAll(
    '.btn-news-down, .btn-stats-down, .btn-gallery-down, .btn-timeline-down, .btn-hist-menu-down, .btn-hist-paragraph-down, .btn-team-down'
  ).forEach(btn => {
    btn.addEventListener('click', () => {
      const item = btn.closest(
        '.news-item-editor, .stats-item-editor, .gallery-item-editor, .timeline-item-editor, .hist-menu-item-editor, .hist-paragraph-editor, .team-item-editor'
      );

      const next = item?.nextElementSibling;

      if (item && next) {
        item.parentNode.insertBefore(next, item);
        atualizarPreview();
      }
    });
  });
document.getElementById('btn-add-student-tag')?.addEventListener('click', adicionarTagAlunos);

document.querySelectorAll('.btn-remove-student-tag').forEach(btn => {
  btn.addEventListener('click', () => {
    const item = btn.closest('.student-tag-editor');
    if (!item) return;

    item.remove();
    atualizarPreview();
    showToast('Marcador removido.');
  });
});

document.getElementById('btn-add-student-number')?.addEventListener('click', adicionarNumeroAlunos);

document.querySelectorAll('.btn-remove-student-number').forEach(btn => {
  btn.addEventListener('click', () => {
    const item = btn.closest('.student-number-editor');
    if (!item) return;

    item.remove();
    atualizarPreview();
    showToast('Número removido.');
  });
});

document.querySelectorAll('.btn-student-number-up').forEach(btn => {
  btn.addEventListener('click', () => {
    const item = btn.closest('.student-number-editor');
    const prev = item?.previousElementSibling;

    if (item && prev) {
      item.parentNode.insertBefore(item, prev);
      atualizarPreview();
    }
  });
});

document.querySelectorAll('.btn-student-number-down').forEach(btn => {
  btn.addEventListener('click', () => {
    const item = btn.closest('.student-number-editor');
    const next = item?.nextElementSibling;

    if (item && next) {
      item.parentNode.insertBefore(next, item);
      atualizarPreview();
    }
  });
});
document.getElementById('btn-add-student-project')?.addEventListener('click', adicionarProjetoAlunos);

document.querySelectorAll('.btn-remove-student-project').forEach(btn => {
  btn.addEventListener('click', () => {
    const item = btn.closest('.student-project-editor');
    if (!item) return;

    item.remove();
    atualizarPreview();
    showToast('Projeto removido.');
  });
});

document.querySelectorAll('.btn-student-project-up').forEach(btn => {
  btn.addEventListener('click', () => {
    const item = btn.closest('.student-project-editor');
    const prev = item?.previousElementSibling;

    if (item && prev) {
      item.parentNode.insertBefore(item, prev);
      atualizarPreview();
    }
  });
});

document.querySelectorAll('.btn-student-project-down').forEach(btn => {
  btn.addEventListener('click', () => {
    const item = btn.closest('.student-project-editor');
    const next = item?.nextElementSibling;

    if (item && next) {
      item.parentNode.insertBefore(next, item);
      atualizarPreview();
    }
  });
});
document.getElementById('btn-add-process-step')?.addEventListener('click', adicionarEtapaProcesso);

document.querySelectorAll('.btn-remove-process-step').forEach(btn => {
  btn.addEventListener('click', () => {
    const item = btn.closest('.process-step-editor');
    if (!item) return;

    item.remove();
    atualizarPreview();
    showToast('Etapa removida.');
  });
});

document.querySelectorAll('.btn-process-step-up').forEach(btn => {
  btn.addEventListener('click', () => {
    const item = btn.closest('.process-step-editor');
    const prev = item?.previousElementSibling;

    if (item && prev) {
      item.parentNode.insertBefore(item, prev);
      atualizarPreview();
    }
  });
});

document.querySelectorAll('.btn-process-step-down').forEach(btn => {
  btn.addEventListener('click', () => {
    const item = btn.closest('.process-step-editor');
    const next = item?.nextElementSibling;

    if (item && next) {
      item.parentNode.insertBefore(next, item);
      atualizarPreview();
    }
  });
});
document.getElementById('btn-add-process-schedule')?.addEventListener('click', adicionarCronogramaProcesso);

document.querySelectorAll('.btn-remove-process-schedule').forEach(btn => {
  btn.addEventListener('click', () => {
    const item = btn.closest('.process-schedule-editor');
    if (!item) return;

    item.remove();
    atualizarPreview();
    showToast('Item do cronograma removido.');
  });
});

document.querySelectorAll('.btn-process-schedule-up').forEach(btn => {
  btn.addEventListener('click', () => {
    const item = btn.closest('.process-schedule-editor');
    const prev = item?.previousElementSibling;

    if (item && prev) {
      item.parentNode.insertBefore(item, prev);
      atualizarPreview();
    }
  });
});

document.querySelectorAll('.btn-process-schedule-down').forEach(btn => {
  btn.addEventListener('click', () => {
    const item = btn.closest('.process-schedule-editor');
    const next = item?.nextElementSibling;

    if (item && next) {
      item.parentNode.insertBefore(next, item);
      atualizarPreview();
    }
  });
});
document.getElementById('btn-add-process-edital')?.addEventListener('click', adicionarEditalProcesso);

document.querySelectorAll('.btn-remove-process-edital').forEach(btn => {
  btn.addEventListener('click', () => {
    const item = btn.closest('.process-edital-editor');
    if (!item) return;

    item.remove();
    atualizarPreview();
    showToast('Edital removido.');
  });
});

document.querySelectorAll('.btn-process-edital-up').forEach(btn => {
  btn.addEventListener('click', () => {
    const item = btn.closest('.process-edital-editor');
    const prev = item?.previousElementSibling;

    if (item && prev) {
      item.parentNode.insertBefore(item, prev);
      atualizarPreview();
    }
  });
});

document.querySelectorAll('.btn-process-edital-down').forEach(btn => {
  btn.addEventListener('click', () => {
    const item = btn.closest('.process-edital-editor');
    const next = item?.nextElementSibling;

    if (item && next) {
      item.parentNode.insertBefore(next, item);
      atualizarPreview();
    }
  });
});
document.getElementById('btn-add-news-list')?.addEventListener('click', adicionarNoticiaLista);

document.querySelectorAll('.btn-remove-news-list').forEach(btn => {
  btn.addEventListener('click', () => {
    const item = btn.closest('.news-list-editor');
    if (!item) return;

    item.remove();
    atualizarPreview();
    showToast('Notícia removida.');
  });
});

document.querySelectorAll('.btn-news-list-up').forEach(btn => {
  btn.addEventListener('click', () => {
    const item = btn.closest('.news-list-editor');
    const prev = item?.previousElementSibling;

    if (item && prev) {
      item.parentNode.insertBefore(item, prev);
      atualizarPreview();
    }
  });
});

document.querySelectorAll('.btn-news-list-down').forEach(btn => {
  btn.addEventListener('click', () => {
    const item = btn.closest('.news-list-editor');
    const next = item?.nextElementSibling;

    if (item && next) {
      item.parentNode.insertBefore(next, item);
      atualizarPreview();
    }
  });
});
document.getElementById('btn-add-news-category')?.addEventListener('click', adicionarCategoriaNoticias);

document.querySelectorAll('.btn-remove-news-category').forEach(btn => {
  btn.addEventListener('click', () => {
    const item = btn.closest('.news-category-editor');
    if (!item) return;

    item.remove();
    atualizarPreview();

    showToast('Categoria removida.');
  });
});

document.querySelectorAll('.btn-news-category-up').forEach(btn => {
  btn.addEventListener('click', () => {
    const item = btn.closest('.news-category-editor');
    const prev = item?.previousElementSibling;

    if (item && prev) {
      item.parentNode.insertBefore(item, prev);
      atualizarPreview();
    }
  });
});

document.querySelectorAll('.btn-news-category-down').forEach(btn => {
  btn.addEventListener('click', () => {
    const item = btn.closest('.news-category-editor');
    const next = item?.nextElementSibling;

    if (item && next) {
      item.parentNode.insertBefore(next, item);
      atualizarPreview();
    }
  });
});
document.getElementById('btn-add-recent-news')?.addEventListener('click', adicionarNoticiaRecente);

document.querySelectorAll('.btn-remove-recent-news').forEach(btn => {
  btn.addEventListener('click', () => {
    const item = btn.closest('.recent-news-editor');
    if (!item) return;

    item.remove();
    atualizarPreview();

    showToast('Notícia recente removida.');
  });
});

document.querySelectorAll('.btn-recent-news-up').forEach(btn => {
  btn.addEventListener('click', () => {
    const item = btn.closest('.recent-news-editor');
    const prev = item?.previousElementSibling;

    if (item && prev) {
      item.parentNode.insertBefore(item, prev);
      atualizarPreview();
    }
  });
});

document.querySelectorAll('.btn-recent-news-down').forEach(btn => {
  btn.addEventListener('click', () => {
    const item = btn.closest('.recent-news-editor');
    const next = item?.nextElementSibling;

    if (item && next) {
      item.parentNode.insertBefore(next, item);
      atualizarPreview();
    }
  });
});
document.getElementById('btn-add-gallery-filter')?.addEventListener('click', adicionarFiltroGaleria);

document.querySelectorAll('.btn-remove-gallery-filter').forEach(btn => {
  btn.addEventListener('click', () => {
    const item = btn.closest('.gallery-filter-editor');
    if (!item) return;

    item.remove();

    atualizarPreview();

    showToast('Filtro removido.');
  });
});

document.querySelectorAll('.btn-gallery-filter-up').forEach(btn => {
  btn.addEventListener('click', () => {
    const item = btn.closest('.gallery-filter-editor');
    const prev = item?.previousElementSibling;

    if (item && prev) {
      item.parentNode.insertBefore(item, prev);

      atualizarPreview();
    }
  });
});

document.querySelectorAll('.btn-gallery-filter-down').forEach(btn => {
  btn.addEventListener('click', () => {
    const item = btn.closest('.gallery-filter-editor');
    const next = item?.nextElementSibling;

    if (item && next) {
      item.parentNode.insertBefore(next, item);
      atualizarPreview();
    }
  });
});

document.getElementById('btn-add-gallery-grid')
  ?.addEventListener('click', adicionarImagemGridGaleria);

/* =========================
   GALERIA - FOTOS DOS EVENTOS
   ========================= */

document.addEventListener('click', event => {

  const addPhotoBtn =
    event.target.closest('.btn-add-gallery-event-photo');

  if (addPhotoBtn) {

    const eventIndex =
      Number(addPhotoBtn.dataset.eventIndex);

    const lista = document.querySelector(
      `.gallery-event-photos-list[data-event-index="${eventIndex}"]`
    );

    if (!lista) return;

    const vazio = lista.querySelector('.gallery-event-empty');

    if (vazio) {
      vazio.remove();
    }

    const quantidadeAtual =
      lista.querySelectorAll('.gallery-event-photo-editor').length;

    lista.insertAdjacentHTML(
      'beforeend',
      montarFotoEventoGaleria(
        eventIndex,
        quantidadeAtual + 1,
        {}
      )
    );

    atualizarPreview?.();
    return;
  }

  const removePhotoBtn =
    event.target.closest('.btn-remove-gallery-event-photo');

  if (removePhotoBtn) {

    const foto =
      removePhotoBtn.closest('.gallery-event-photo-editor');

    if (!foto) return;

    foto.remove();

    atualizarPreview?.();
    return;
  }

  const uploadBtn =
    event.target.closest('.btn-upload-gallery-event-photos');

  if (uploadBtn) {

    const eventIndex =
      uploadBtn.dataset.eventIndex;

    const input = document.getElementById(
      `gallery-event-files-${eventIndex}`
    );

    input?.click();
    return;
  }

});

document.addEventListener('change', event => {

  const input =
    event.target.closest('.gallery-event-files-input');

  if (!input) return;

  const eventIndex =
    input.id.replace('gallery-event-files-', '');

  const files =
    Array.from(input.files || []);

  enviarVariasFotosEventoGaleria(
    eventIndex,
    files
  );

  input.value = '';
});

/* =========================
   GRID GALERIA
   ========================= */

document.querySelectorAll('.btn-remove-gallery-grid').forEach(btn => {
  btn.addEventListener('click', () => {
    const item = btn.closest('.gallery-grid-editor');

    if (!item) return;

    item.remove();

    atualizarPreview();

    showToast('Imagem removida.');
  });
});

document.querySelectorAll('.btn-gallery-grid-up').forEach(btn => {
  btn.addEventListener('click', () => {
    const item = btn.closest('.gallery-grid-editor');
    const prev = item?.previousElementSibling;

    if (item && prev) {
      item.parentNode.insertBefore(item, prev);

      atualizarPreview();
    }
  });
});

document.querySelectorAll('.btn-gallery-grid-down').forEach(btn => {
  btn.addEventListener('click', () => {
    const item = btn.closest('.gallery-grid-editor');
    const next = item?.nextElementSibling;

    if (item && next) {
      item.parentNode.insertBefore(next, item);
      atualizarPreview();
    }
  });
});
document.getElementById('btn-add-contact-info')?.addEventListener('click', adicionarInfoContato);

document.querySelectorAll('.btn-remove-contact-info').forEach(btn => {
  btn.addEventListener('click', () => {
    const item = btn.closest('.contact-info-editor');
    if (!item) return;

    item.remove();

    atualizarPreview();

    showToast('Card removido.');
  });
});

document.querySelectorAll('.btn-contact-info-up').forEach(btn => {
  btn.addEventListener('click', () => {
    const item = btn.closest('.contact-info-editor');
    const prev = item?.previousElementSibling;

    if (item && prev) {
      item.parentNode.insertBefore(item, prev);

      atualizarPreview();
    }
  });
});

document.querySelectorAll('.btn-contact-info-down').forEach(btn => {
  btn.addEventListener('click', () => {
    const item = btn.closest('.contact-info-editor');
    const next = item?.nextElementSibling;

    if (item && next) {
      item.parentNode.insertBefore(next, item);

      atualizarPreview();
    }
  });
});
document.getElementById('btn-add-certame')?.addEventListener('click', () => {
  const container = document.getElementById('certames-fields');

  if (!container) return;

  const novo = Date.now();

  const wrap = document.createElement('div');

  wrap.innerHTML = montarItemCertame(novo, {
    titulo: 'Novo Processo Seletivo',
    status: 'Em andamento',
    destaque: false,
    documentos: []
  });

  container.appendChild(wrap.firstElementChild);

  ligarEventosCamposDinamicos();
  atualizarPreview();

  showToast('Certame adicionado.');
});

document.querySelectorAll('.btn-add-certame-doc').forEach(btn => {
  btn.addEventListener('click', () => {
    adicionarDocumentoCertame(btn.dataset.certameIndex);
  });
});

document.querySelectorAll('.btn-remove-certame').forEach(btn => {
  btn.addEventListener('click', () => {
    const item = btn.closest('.certame-editor');

    if (!item) return;

    item.remove();

    atualizarPreview();

    showToast('Certame removido.');
  });
});

document.querySelectorAll('.btn-remove-certame-doc').forEach(btn => {
  btn.addEventListener('click', () => {
    const item = btn.closest('.certame-doc-editor');

    if (!item) return;

    item.remove();

    atualizarPreview();

    showToast('Documento removido.');
  });
});

document.querySelectorAll('.btn-certame-up').forEach(btn => {
  btn.addEventListener('click', () => {
    const item = btn.closest('.certame-editor');

    const prev = item?.previousElementSibling;

    if (item && prev) {
      item.parentNode.insertBefore(item, prev);

      atualizarPreview();
    }
  });
});

document.querySelectorAll('.btn-certame-down').forEach(btn => {
  btn.addEventListener('click', () => {
    const item = btn.closest('.certame-editor');

    const next = item?.nextElementSibling;

    if (item && next) {
      item.parentNode.insertBefore(next, item);

      atualizarPreview();
    }
  });
});
}

function adicionarProjetoAssociacaoHome() {
  const container = document.getElementById('home-assoc-projects-fields');
  if (!container) return;

  const novo = Date.now();

  const wrap = document.createElement('div');

  wrap.innerHTML = montarItemProjetoAssociacao(novo, {
    imagem: '',
    titulo: 'Novo projeto',
    texto: 'Descrição da ação realizada com apoio da Associação.'
  });

  const novoItem = wrap.firstElementChild;

  container.appendChild(novoItem);

  novoItem.querySelectorAll('input, textarea, select').forEach(el => {
    el.addEventListener('input', atualizarPreview);
    el.addEventListener('change', atualizarPreview);
  });

  novoItem.querySelector('.btn-remove-home-assoc-project')?.addEventListener('click', () => {
    novoItem.remove();
    atualizarPreview();
    showToast('Imagem/projeto removido.');
  });

  novoItem.querySelector('.btn-home-assoc-project-up')?.addEventListener('click', () => {
    const prev = novoItem.previousElementSibling;
    if (prev) {
      novoItem.parentNode.insertBefore(novoItem, prev);
      atualizarPreview();
    }
  });

  novoItem.querySelector('.btn-home-assoc-project-down')?.addEventListener('click', () => {
    const next = novoItem.nextElementSibling;
    if (next) {
      novoItem.parentNode.insertBefore(next, novoItem);
      atualizarPreview();
    }
  });

  novoItem.querySelector('.btn-upload-home-assoc-project')?.addEventListener('click', () => {
    cmsUploadTarget = novoItem.querySelector('.btn-upload-home-assoc-project')?.dataset.target;
    document.getElementById('upload-file')?.click();
  });

  atualizarPreview();

  showToast('Imagem/projeto adicionado.');
}

function adicionarHomeDocumento() {
  const container = document.getElementById('home-docs-fields');
  if (!container) return;

  const novo = Date.now();

  const wrap = document.createElement('div');

  wrap.innerHTML = montarItemHomeDocumento(novo, {
    icone: '📄',
    titulo: 'Novo documento',
    texto: 'Descrição do card.',
    link: '#'
  });

  const novoItem = wrap.firstElementChild;

  container.appendChild(novoItem);

  novoItem.querySelectorAll('input, textarea, select').forEach(el => {
    el.addEventListener('input', atualizarPreview);
    el.addEventListener('change', atualizarPreview);
  });

  novoItem.querySelector('.btn-remove-home-doc')?.addEventListener('click', () => {
    novoItem.remove();
    atualizarPreview();
    showToast('Card removido.');
  });

  novoItem.querySelector('.btn-home-doc-up')?.addEventListener('click', () => {
    const prev = novoItem.previousElementSibling;

    if (prev) {
      novoItem.parentNode.insertBefore(novoItem, prev);
      atualizarPreview();
    }
  });

  novoItem.querySelector('.btn-home-doc-down')?.addEventListener('click', () => {
    const next = novoItem.nextElementSibling;

    if (next) {
      novoItem.parentNode.insertBefore(next, novoItem);
      atualizarPreview();
    }
  });

  atualizarPreview();

  showToast('Card adicionado.');
}

function adicionarArquivoHomeDocumento(cardIndex) {
  const container = document.getElementById(`home-doc-files-${cardIndex}`);
  if (!container) return;

  const novo = Date.now();

  const wrap = document.createElement('div');

  wrap.innerHTML = montarArquivoHomeDocumento(cardIndex, novo, {
    titulo: 'Novo documento',
    texto: 'Baixar arquivo',
    url: '#'
  });

  const novoItem = wrap.firstElementChild;

  container.appendChild(novoItem);

  novoItem.querySelectorAll('input, textarea, select').forEach(el => {
    el.addEventListener('input', atualizarPreview);
    el.addEventListener('change', atualizarPreview);
  });

  novoItem.querySelector('.btn-remove-home-doc-file')?.addEventListener('click', () => {
    novoItem.remove();
    atualizarPreview();
    showToast('Documento removido.');
  });

  novoItem.querySelector('.btn-upload-home-doc-file')?.addEventListener('click', () => {
    cmsUploadTarget = novoItem.querySelector('.btn-upload-home-doc-file')?.dataset.target;
    document.getElementById('upload-file')?.click();
  });

  atualizarPreview();

  showToast('Documento adicionado ao card.');
}

/* =========================
   PREVIEW
   ========================= */
function garantirEstilosCmsPreview() {
  const doc = getPreviewDoc();
  if (!doc || doc.getElementById('cms-dynamic-style')) return;

  const style = doc.createElement('style');
  style.id = 'cms-dynamic-style';

  style.textContent = `
    .cms-dynamic-section {
      padding: clamp(28px, 5vw, 70px) 24px;
    }

    .cms-dynamic-inner {
      width: 100%;
      margin-inline: auto;
    }

    .cms-width-small { max-width: 520px; }
    .cms-width-medium { max-width: 760px; }
    .cms-width-large { max-width: 980px; }
    .cms-width-container { max-width: 1180px; }
    .cms-width-full { max-width: none; }

    .cms-align-left { text-align: left; }
    .cms-align-center { text-align: center; }
    .cms-align-right { text-align: right; }
    .cms-align-full { text-align: center; }

    .cms-spacing-compact { padding-block: 28px; }
    .cms-spacing-comfortable { padding-block: clamp(38px, 5vw, 64px); }
    .cms-spacing-wide { padding-block: clamp(60px, 7vw, 100px); }

    .cms-dynamic-card,
    .cms-dynamic-banner,
    .cms-dynamic-video,
    .cms-dynamic-gallery,
    .cms-dynamic-doc,
    .cms-dynamic-form,
    .cms-dynamic-sponsor {
      background: #fff;
      border-radius: 24px;
      padding: clamp(24px, 4vw, 46px);
      box-shadow: 0 14px 35px rgba(0,0,0,.08);
    }

    .cms-dynamic-banner {
      background: linear-gradient(135deg, #061a35, #08244a);
      color: white;
    }

    .cms-dynamic-video-frame {
      width: min(900px, 100%);
      aspect-ratio: 16 / 9;
      margin: 24px auto 0;
      border-radius: 22px;
      background: #061a35;
      display: grid;
      place-items: center;
      color: white;
      font-size: clamp(42px, 8vw, 82px);
      overflow: hidden;
    }

    .cms-dynamic-img {
      width: 100%;
      max-height: 360px;
      object-fit: cover;
      border-radius: 20px;
      margin-top: 20px;
    }

    .cms-dynamic-button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: auto;
      max-width: 100%;
      padding: 14px 24px;
      border-radius: 12px;
      background: var(--vermelho, #b9151b);
      color: white;
      text-decoration: none;
      font-weight: 900;
      margin-top: 18px;
      white-space: normal;
    }

    @media (max-width: 700px) {
      .cms-hide-mobile { display: none !important; }
      .cms-dynamic-section { padding-inline: 18px; }
      .cms-dynamic-card,
      .cms-dynamic-banner,
      .cms-dynamic-video,
      .cms-dynamic-gallery,
      .cms-dynamic-doc,
      .cms-dynamic-form,
      .cms-dynamic-sponsor {
        padding: 24px;
      }
    }

    @media (min-width: 701px) {
      .cms-hide-desktop { display: none !important; }
    }
  `;

  doc.head.appendChild(style);
}

function atualizarBlocoDinamicoNaPreview(id) {
  const doc = getPreviewDoc();
  if (!doc) return;

  garantirEstilosCmsPreview();

  const section = doc.querySelector(`[data-cms-block-id="${id}"]`);
  if (!section) return;

  const title = getInput('dynamic-title')?.value || '';
  const text = getInput('dynamic-text')?.value || '';
  const btnText = getInput('dynamic-button-text')?.value || '';
  const link = getInput('dynamic-link')?.value || '#';
  const image = getInput('dynamic-image')?.value?.trim() || '';

  const width = getInput('dynamic-width')?.value || 'container';
  const align = getInput('dynamic-align')?.value || 'center';
  const spacing = getInput('dynamic-spacing')?.value || 'comfortable';

  section.classList.remove(
    'cms-spacing-compact',
    'cms-spacing-comfortable',
    'cms-spacing-wide',
    'cms-hide-mobile',
    'cms-hide-desktop'
  );

  section.classList.add(`cms-spacing-${spacing}`);

  if (getInput('dynamic-hide-mobile')?.checked) {
    section.classList.add('cms-hide-mobile');
  }

  if (getInput('dynamic-hide-desktop')?.checked) {
    section.classList.add('cms-hide-desktop');
  }

  const inner = section.querySelector('.cms-dynamic-inner');
  if (inner) {
    inner.className = `cms-dynamic-inner cms-width-${width} cms-align-${align}`;
  }

  section.querySelectorAll('[data-dynamic-title]').forEach(el => {
    el.textContent = title;
  });

  section.querySelectorAll('[data-dynamic-text]').forEach(el => {
    el.textContent = text;
  });

  section.querySelectorAll('[data-dynamic-button]').forEach(el => {
    el.textContent = btnText || 'Saiba mais';
    el.href = link;
  });

  const img = section.querySelector('[data-dynamic-image]');
  if (img && image) {
    img.src = image;
    img.style.display = '';
  }
  const banner = section.querySelector('.cms-dynamic-banner');

if (banner && image) {
  banner.style.background = `
    linear-gradient(135deg, rgba(6,26,53,.88), rgba(8,36,74,.74)),
    url("${image}")
  `;
  banner.style.backgroundSize = 'cover';
  banner.style.backgroundPosition = 'center';
}
}

function coletarAtalhosHomeMenu() {
  const campos = [...document.querySelectorAll('.menu-item-editor')];

  return campos.map((box, index) => {
    const i = box.dataset.menuIndex;

    return {
      id: i,
      ordem: index,
      icon: getInput(`home-menu-icon-${i}`)?.value || '🔗',
      texto: getInput(`home-menu-${i}`)?.value || '',
      link: getInput(`home-menu-link-${i}`)?.value || '#',
      destaque: getInput(`home-menu-featured-${i}`)?.checked || false
    };
  }).filter(item => item.texto.trim());
}

function atualizarPreviewPelaEnginePublica() {
  const doc = getPreviewDoc();
  if (!doc) return false;

  const iframe = document.getElementById('live-preview');
  const renderer = iframe?.contentWindow?.AxoriinCmsRenderer;

  if (!renderer?.renderizarBlocoCms) {
    return false;
  }

  const slugAtual = builderPageSelect?.value || 'home';

  if (slugAtual === 'home') {
    return false;
  }

  if (blocoAtivoId.startsWith('home-')) {
    return false;
  }

  const conteudo = coletarConteudoBlocoCms(blocoAtivoId);

  const blocoCms = {
    ...conteudo,
    tipo: 'html-livre',
    subtitulo: getBlocoCmsAtual(blocoAtivoId)?.tipo || '',
    configuracao: {
      ...(conteudo.configuracao || {}),
      cmsBlockId: blocoAtivoId,
      cmsTipo: getBlocoCmsAtual(blocoAtivoId)?.tipo || '',
      tipoRender: getTipoRenderPorBloco(blocoAtivoId),
      origem: 'cms-builder-preview'
    },
    ativo: true
  };

  const html = renderer.renderizarBlocoCms(blocoCms);

  const antigo =
    doc.querySelector(`[data-cms-block-id="${blocoAtivoId}"]`);

  if (antigo) {
    antigo.outerHTML = html;
    return true;
  }

  const main = doc.querySelector('main') || doc.body;

  if (!main) return false;

  main.insertAdjacentHTML('beforeend', html);

  return true;
}

function atualizarPreview() {
  const doc = getPreviewDoc();
  if (!doc) return;

  if (blocoAtivoId === 'contato-banner') {
    atualizarContatoBannerNaPreview();
    return;
  }

  if (blocoAtivoId === 'noticias-lista') {
    return;
  }

  if (blocoAtivoId === 'noticias-categorias') {
    atualizarNoticiasCategoriasNaPreview();
    return;
  }

  if (blocoAtivoId === 'noticias-recentes') {
    atualizarNoticiasRecentesNaPreview();
    return;
  }

  if (blocoAtivoId === 'professores-lista') {
    atualizarProfessoresListaNaPreview();
    return;
  }

  if (blocoAtivoId === 'professores-materiais') {
    atualizarProfessoresMateriaisNaPreview();
    return;
  }

  aplicarLayoutGlobalNaPreview();

  if (atualizarPreviewPelaEnginePublica()) {
    return;
  }

  if (blocoAtivoId.includes('-dinamico')) {
    atualizarBlocoDinamicoNaPreview(blocoAtivoId);
    return;
  }

  /* =========================
     HOME
     ========================= */

if (blocoAtivoId === 'historia-banner') {
  atualizarHistoriaBannerNaPreview();
  return;
}

if (blocoAtivoId === 'direcao-banner') {
  atualizarDirecaoBannerNaPreview();
  return;
}

if (blocoAtivoId === 'direcao-intro') {
  atualizarDirecaoIntroNaPreview();
  return;
}

if (blocoAtivoId === 'direcao-equipe') {
  atualizarEquipeDirecaoNaPreview();
  return;
}

if (blocoAtivoId === 'direcao-chamada') {
  atualizarDirecaoChamadaNaPreview();
  return;
}

if (blocoAtivoId === 'alunos-banner') {
  atualizarAlunosBannerNaPreview();
  return;
}

if (blocoAtivoId === 'alunos-intro') {
  atualizarAlunosIntroNaPreview();
  return;
}

if (blocoAtivoId === 'alunos-numeros') {
  atualizarAlunosNumerosNaPreview();
  return;
}

if (blocoAtivoId === 'alunos-projetos') {
  atualizarAlunosProjetosNaPreview();
  return;
}

if (blocoAtivoId === 'alunos-chamada') {
  atualizarAlunosChamadaNaPreview();
  return;
}

if (blocoAtivoId === 'processo-banner') {
  atualizarProcessoBannerNaPreview();
  return;
}

if (blocoAtivoId === 'processo-etapas') {
  atualizarProcessoEtapasNaPreview();
  return;
}

if (blocoAtivoId === 'processo-cronograma') {
  atualizarProcessoCronogramaNaPreview();
  return;
}

if (blocoAtivoId === 'processo-editais') {
  atualizarProcessoEditaisNaPreview();
  return;
}

if (blocoAtivoId === 'processo-chamada') {
  atualizarProcessoChamadaNaPreview();
  return;
}

if (blocoAtivoId === 'noticias-banner') {
  atualizarNoticiasBannerNaPreview();
  return;
}

if (blocoAtivoId === 'noticias-categorias') {
  atualizarNoticiasCategoriasNaPreview();
  return;
}

if (blocoAtivoId === 'noticias-suporte') {
  atualizarNoticiasSuporteNaPreview();
  return;
}

if (blocoAtivoId === 'galeria-banner') {
  atualizarGaleriaBannerNaPreview();
  return;
}

if (blocoAtivoId === 'galeria-filtros') {
  atualizarGaleriaFiltrosNaPreview();
  return;
}

if (blocoAtivoId === 'galeria-grid') {
  atualizarGaleriaGridNaPreview();
  return;
}

if (blocoAtivoId === 'galeria-video') {
  atualizarGaleriaVideoNaPreview();
  return;
}

if (blocoAtivoId === 'contato-banner') {
  atualizarContatoBannerNaPreview();
  return;
}

if (blocoAtivoId === 'contato-info') {
  atualizarContatoInfosNaPreview();
  return;
}

if (blocoAtivoId === 'contato-form') {
  atualizarContatoFormularioNaPreview();
  return;
}

if (blocoAtivoId === 'contato-mapa') {
  atualizarContatoMapaNaPreview();
  return;
}

if (blocoAtivoId === 'home-menu') {
  const quickMenu =
    doc.querySelector('.quick-menu') ||
    doc.querySelector('.quick-links') ||
    doc.querySelector('.quick-grid');

  if (!quickMenu) return;

  const atalhos = coletarAtalhosHomeMenu();

quickMenu.innerHTML = atalhos.map(item => `
  <a href="${item.link || '#'}"
     class="quick-item ${item.destaque ? 'featured' : ''}">
    <span>${item.icon || '🔗'}</span>
    <strong>${item.texto || 'Novo atalho'}</strong>
  </a>
`).join('');

  return;
}

if (blocoAtivoId === 'home-noticias') {
  atualizarNoticiasHomeNaPreview();
  return;
}

if (blocoAtivoId === 'home-estatisticas') {
  atualizarEstatisticasHomeNaPreview();
  return;
}

if (blocoAtivoId === 'home-galeria') {
  atualizarGaleriaHomeNaPreview();
  return;
}

if (blocoAtivoId === 'home-patrocinadores') {
  atualizarPatrocinadoresHomeNaPreview();
  return;
}

if (blocoAtivoId === 'home-associacao') {
  atualizarAssociacaoHomeNaPreview();
  return;
}

if (blocoAtivoId === 'home-documentos') {
  atualizarDocumentosHomeNaPreview();
  return;
}

if (blocoAtivoId === 'home-video') {
  atualizarVideoHomeNaPreview();
  return;
}

  if (blocoAtivoId === 'historia-texto') {
  atualizarTextoHistoriaNaPreview();
  return;
}

  if (blocoAtivoId === 'historia-menu') {
  atualizarMenuHistoriaNaPreview();
  return;
}

if (blocoAtivoId === 'alunos-destaque') {
  atualizarAlunosDestaqueNaPreview();
  return;
}

  if (blocoAtivoId === 'historia-linha') {
  atualizarTimelineHistoriaNaPreview();
  return;
}

if (blocoAtivoId === 'historia-video') {
  atualizarHistoriaVideoNaPreview();
  return;
}

  if (blocoAtivoId === 'historia-video') {
    const title = doc.querySelector('.video-call h2');
    const text = doc.querySelector('.video-call p');
    const button = doc.querySelector('.video-call .btn');

    if (title) title.textContent = getInput('hero-title')?.value || '';
    if (text) text.textContent = getInput('hero-text')?.value || '';

    if (button) {
      button.textContent = getInput('button-text')?.value || 'Assistir';
      button.href = getInput('button-link')?.value || '#';
    }

    return;
  }

  const heroTitle =
    doc.querySelector('.hero h1') ||
    doc.querySelector('.page-hero h1') ||
    doc.querySelector('.selection-hero h1');

  const heroText =
    doc.querySelector('.hero p') ||
    doc.querySelector('.page-hero p') ||
    doc.querySelector('.selection-hero p');

  const heroButton =
    doc.querySelector('.hero-actions .btn.primary') ||
    doc.querySelector('.selection-buttons .btn.primary') ||
    doc.querySelector('.video-call .btn.primary') ||
    doc.querySelector('.selection-banner .btn.primary');

  const hero =
    doc.querySelector('.hero') ||
    doc.querySelector('.page-hero') ||
    doc.querySelector('.selection-hero');

  if (heroTitle) {
    heroTitle.innerHTML = (getInput('hero-title')?.value || '').replace(/\n/g, '<br>');
  }

  if (heroText) {
    heroText.textContent = getInput('hero-text')?.value || '';
  }

  if (heroButton) {
    heroButton.textContent = getInput('button-text')?.value || 'Saiba mais';
    heroButton.href = getInput('button-link')?.value || '#';
  }

  const imagem = getInput('image-url')?.value?.trim();

  if (hero && imagem) {
    hero.style.background = `
      linear-gradient(
        90deg,
        rgba(6,26,53,.95),
        rgba(6,26,53,.68),
        rgba(185,21,27,.25)
      ),
      url("${imagem}")
    `;

    hero.style.backgroundSize = 'cover';
    hero.style.backgroundPosition = 'center';
  }
}

function atualizarAssociacaoHomeNaPreview() {
  const doc = getPreviewDoc();
  if (!doc) return;

  let section = doc.querySelector('[data-cms-block-id="home-associacao"]');

  if (!section) {
    const main = doc.querySelector('main') || doc.body;
    section = doc.createElement('section');
    section.setAttribute('data-cms-block-id', 'home-associacao');
    main.appendChild(section);
  }

  section.outerHTML = `
    <section class="section home-assoc-section" data-cms-block-id="home-associacao">
      <article class="home-assoc-card">
        <div class="home-assoc-icon">🤝</div>

        <div class="home-assoc-content">
          <span>Comunidade escolar</span>
          <h2>${getInput('home-assoc-title')?.value || 'Associação de Pais'}</h2>
          <p>${getInput('home-assoc-text')?.value || ''}</p>
        </div>

        <button type="button" class="home-assoc-open">
          Saiba mais
        </button>
      </article>
    </section>
  `;
}

function atualizarDocumentosHomeNaPreview() {
  const doc = getPreviewDoc();
  if (!doc) return;

  let section = doc.querySelector('[data-cms-block-id="home-documentos"]');

  if (!section) {
    const main = doc.querySelector('main') || doc.body;
    section = doc.createElement('section');
    section.setAttribute('data-cms-block-id', 'home-documentos');
    main.appendChild(section);
  }

  const itens =
    typeof coletarHomeDocumentos === 'function'
      ? coletarHomeDocumentos()
      : [];

  section.outerHTML = `
    <section class="section home-docs-section" data-cms-block-id="home-documentos">
      <div class="section-head">
        <h2>${getInput('home-docs-title')?.value || 'Documentos e Informações'}</h2>
      </div>

      ${
        getInput('home-docs-text')?.value
          ? `<div class="page-intro"><p>${getInput('home-docs-text')?.value}</p></div>`
          : ''
      }

      <div class="home-docs-grid">
        ${itens.map(item => `
          <button
  type="button"
  class="home-doc-card"
>
  <span>${item.icone || '📄'}</span>

  <div>
    <h3>${item.titulo || 'Documento'}</h3>
    <p>${item.texto || ''}</p>
  </div>

  <strong>Ver arquivos →</strong>
</button>
        `).join('')}
      </div>
    </section>
  `;
}

function encontrarElementoDoBlocoNaPreview(id) {
  const doc = getPreviewDoc();
  if (!doc) return null;

  if (id?.includes('-dinamico')) {
    return doc.querySelector(`[data-cms-block-id="${id}"]`);
  }

  if (id === 'home-banner') return doc.querySelector('.hero');
  if (id === 'home-menu') return doc.querySelector('.quick-menu');
  if (id === 'home-noticias') return doc.querySelector('.news-section') || doc.querySelector('.noticias');
  if (id === 'home-estatisticas') return doc.querySelector('.stats')?.closest('section') || doc.querySelector('.stats');
  if (id === 'home-galeria') return doc.querySelector('.gallery-section') || doc.querySelector('.galeria');
  if (id === 'home-video') return doc.querySelector('.video-call');
  

  if (id === 'historia-banner') return doc.querySelector('.page-hero');
  if (id === 'historia-texto' || id === 'historia-menu') return doc.querySelector('.page-layout');
  if (id === 'historia-linha') return doc.querySelector('.timeline')?.closest('.section');
  if (id === 'historia-video') return doc.querySelector('.video-call');

  return null;
}

function aplicarVisibilidadeDoBlocoNaPreview(block) {
  const id = block.dataset.blockId;
  const el = encontrarElementoDoBlocoNaPreview(id);

  if (!el) return;

  el.style.display = block.classList.contains('hidden-block') ? 'none' : '';
}

/* =========================
   AÇÕES DOS BLOCOS
   ========================= */

function ligarAcoesDosBlocos() {
  document.querySelectorAll('.builder-block').forEach(block => {
    const buttons = block.querySelectorAll('.block-actions-mini button');

    const btnConfig = buttons[0];
    const btnUp = buttons[1];
    const btnDown = buttons[2];
    const btnEye = buttons[3];
    const btnDelete = buttons[4];

    btnConfig?.addEventListener('click', (e) => {
      e.stopPropagation();

      document.querySelectorAll('.builder-block').forEach(b => b.classList.remove('active'));
      block.classList.add('active');

      const id = block.dataset.blockId;
      const nome = block.querySelector('strong')?.textContent || 'Bloco';

      carregarDadosDoBloco(id, nome);

      document.querySelector('.builder-properties')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      });

      showToast('Configurações do bloco abertas.');
    });

    btnUp?.addEventListener('click', (e) => {
      e.stopPropagation();

      if (!block.dataset.blockId?.includes('-dinamico')) {
        showToast('Por segurança, apenas blocos adicionados podem ser reordenados nesta fase.');
        return;
      }

      const prev = block.previousElementSibling;

      if (prev) {
        block.parentNode.insertBefore(block, prev);
        aplicarEstruturaAtualNaPreview();
        showToast('Bloco movido para cima.');
      }
    });

    btnDown?.addEventListener('click', (e) => {
      e.stopPropagation();

      if (!block.dataset.blockId?.includes('-dinamico')) {
        showToast('Por segurança, apenas blocos adicionados podem ser reordenados nesta fase.');
        return;
      }

      const next = block.nextElementSibling;

      if (next) {
        block.parentNode.insertBefore(next, block);
        aplicarEstruturaAtualNaPreview();
        showToast('Bloco movido para baixo.');
      }
    });

    btnEye?.addEventListener('click', (e) => {
      e.stopPropagation();

      block.classList.toggle('hidden-block');
      aplicarVisibilidadeDoBlocoNaPreview(block);

      showToast(
        block.classList.contains('hidden-block')
          ? 'Bloco ocultado.'
          : 'Bloco exibido.'
      );
    });

    btnDelete?.addEventListener('click', (e) => {
  e.stopPropagation();

  const blockId = block.dataset.blockId;

  if (!blockId?.includes('-dinamico')) {
    showToast('Blocos originais não podem ser excluídos nesta fase.');
    return;
  }

  if (!confirm('Deseja excluir este bloco?')) return;

  const slug = builderPageSelect?.value || 'home';

  if (Array.isArray(pageBlocksMap[slug])) {
    pageBlocksMap[slug] = pageBlocksMap[slug].filter(b =>
      b.id !== blockId &&
      b.mongoId !== blockId &&
      b.mongo?._id !== blockId &&
      b.mongo?.configuracao?.cmsBlockId !== blockId
    );
  }

  const doc = getPreviewDoc();
  const el = doc?.querySelector(`[data-cms-block-id="${blockId}"]`);
  if (el) el.remove();

  block.remove();

  if (blocoAtivoId === blockId) {
    blocoAtivoId = pageBlocksMap[slug]?.[0]?.id || 'home-banner';
  }

  showToast('Bloco removido do rascunho. Publique para aplicar no site.');
});
  });
}

function salvarBlocoAtualNoEstado() {
  const blocoSelecionado = document.querySelector('.builder-block.active');
  const idAtual = blocoAtivoId || blocoSelecionado?.dataset.blockId;

  if (!idAtual) {
    showToast('Nenhum bloco selecionado.');
    return;
  }

  blocoAtivoId = idAtual;

  const slug = builderPageSelect?.value || 'home';

  if (!Array.isArray(pageBlocksMap[slug])) {
    pageBlocksMap[slug] = [];
  }

  const blocos = pageBlocksMap[slug];

  let index = blocos.findIndex(b =>
    b.id === idAtual ||
    b.mongoId === idAtual ||
    b.mongo?._id === idAtual ||
    b.mongo?.configuracao?.cmsBlockId === idAtual
  );

  if (index < 0) {
    const nome = blocoSelecionado?.querySelector('strong')?.textContent || 'Bloco';
    const tipo = blocoSelecionado?.querySelector('small')?.textContent || 'Bloco';

    blocos.push({
      id: idAtual,
      nome,
      tipo,
      ativo: true,
      mongo: {
        configuracao: {
          cmsBlockId: idAtual,
          cmsTipo: tipo,
          origem: 'cms-builder'
        }
      }
    });

    index = blocos.length - 1;
  }

  const conteudo = coletarConteudoBlocoCms(idAtual);

  blocos[index].mongo = {
    ...(blocos[index].mongo || {}),
    titulo: conteudo.titulo || blocos[index].nome || '',
    texto: conteudo.texto || '',
    imagemUrl: conteudo.imagemUrl || '',
    videoUrl: conteudo.videoUrl || '',
    arquivoUrl: conteudo.arquivoUrl || '',
    link: conteudo.link || {},
    itens: conteudo.itens || [],
    configuracao: {
      ...(blocos[index].mongo?.configuracao || {}),
      ...(conteudo.configuracao || {}),
      cmsBlockId: idAtual,
      cmsTipo: blocos[index].tipo,
      origem: 'cms-builder'
    }
  };

  pageBlocksMap[slug] = blocos;

  atualizarPreview();
  showToast('Bloco salvo no rascunho do CMS.');
}

/* =========================
   AÇÕES DE PROPRIEDADES
   ========================= */

document.addEventListener('click', (e) => {
    if (
  e.target.matches('input[type="checkbox"]')
) {
  setTimeout(atualizarPreview, 80);
}
    const btnMenuUp = e.target.closest('.btn-menu-up');
const btnMenuDown = e.target.closest('.btn-menu-down');

if (btnMenuUp) {
  const box = btnMenuUp.closest('.menu-item-editor');
  const prev = box?.previousElementSibling;

  if (box && prev && prev.classList.contains('menu-item-editor')) {
    box.parentNode.insertBefore(box, prev);
    atualizarPreview();
    showToast('Atalho movido para cima.');
  }

  return;
}

if (btnMenuDown) {
  const box = btnMenuDown.closest('.menu-item-editor');
  const next = box?.nextElementSibling;

  if (box && next && next.classList.contains('menu-item-editor')) {
    box.parentNode.insertBefore(next, box);
    atualizarPreview();
    showToast('Atalho movido para baixo.');
  }

  return;
}

if (btnMenuDown) {
  const box = btnMenuDown.closest('.menu-item-editor');
  const next = box?.nextElementSibling;

  if (box && next) {
    box.parentNode.insertBefore(next, box);
    atualizarPreview();
    showToast('Atalho movido para baixo.');
  }

  return;
}
    const btnRemoveHomeMenu = e.target.closest('.btn-remove-home-menu');

if (btnRemoveHomeMenu) {
  const box = btnRemoveHomeMenu.closest('.menu-item-editor');

  if (box) {
    box.remove();
    atualizarPreview();
    showToast('Atalho removido.');
  }

  return;
}
  const btnMenu = e.target.closest('#btn-add-menu-item');
  const btnHomeMenu =
  e.target.closest('#btn-add-home-menu');

if (btnHomeMenu) {
  adicionarCampoHomeMenu();
  atualizarPreview();
  return;
}

  if (btnMenu) {
    adicionarCampoMenu();
    atualizarPreview();
    return;
  }

  const btnTimeline = e.target.closest('#btn-add-timeline-item');

  if (btnTimeline) {
    adicionarCampoTimeline();
    atualizarPreview();
    return;
  }

  const btnDuplicate = e.target.closest('[data-action="duplicate"]');

  if (btnDuplicate) {
    duplicarBlocoAtivo();
    return;
  }

  const btnSave = e.target.closest('[data-action="save"]');

  if (btnSave) {
  salvarBlocoAtualNoEstado();
  return;
}
});

function adicionarCampoHomeMenu() {
  const container = document.getElementById('home-menu-fields');
  if (!container) return;

  const total = container.querySelectorAll('.menu-item-editor').length;
  const novo = total + 1;

  const div = document.createElement('div');
  div.className = 'menu-item-editor';
  div.dataset.menuIndex = novo;

  div.innerHTML = `
    <label>Atalho ${novo}</label>

    <div class="cms-field-row">
      <input id="home-menu-icon-${novo}" value="🔗" placeholder="Ícone">
      <input id="home-menu-${novo}" value="Novo Atalho ${novo}" placeholder="Texto do atalho">
    </div>

    <input id="home-menu-link-${novo}" value="#" placeholder="Link do atalho">

<div class="quick-item-controls">
  <button type="button" class="btn-menu-up">↑</button>
  <button type="button" class="btn-menu-down">↓</button>

  <label style="display:flex;align-items:center;gap:6px;">
    <input type="checkbox" id="home-menu-featured-${novo}">
    Destaque
  </label>
</div>

    <button class="btn ghost btn-remove-home-menu" type="button" data-remove="${novo}">
      Remover este atalho
    </button>
  `;

  container.appendChild(div);

  div.querySelectorAll('input').forEach(input => {
    input.addEventListener('input', atualizarPreview);
  });

  atualizarPreview();
  showToast('Novo atalho criado.');
}

function adicionarCampoMenu() {
  const container = document.querySelector('.builder-properties');
  const btn = document.getElementById('btn-add-menu-item');

  if (!container || !btn) return;

  const total = container.querySelectorAll('input[id^="menu-item-"]').length;
  const novo = total + 1;

  const label = document.createElement('label');
  label.textContent = `Item ${novo}`;

  const input = document.createElement('input');
  input.id = `menu-item-${novo}`;
  input.value = `Novo Item ${novo}`;

  container.insertBefore(label, btn);
  container.insertBefore(input, btn);

  input.addEventListener('input', atualizarPreview);

  showToast('Novo item criado.');
}
function adicionarCampoTimeline() {
  const container = document.querySelector('.builder-properties');
  const btn = document.getElementById('btn-add-timeline-item');

  if (!container || !btn) return;

  const total = container.querySelectorAll('input[id^="timeline-year-"]').length;
  const novo = total + 1;

  const labelAno = document.createElement('label');
  labelAno.textContent = `Ano ${novo}`;

  const inputAno = document.createElement('input');
  inputAno.id = `timeline-year-${novo}`;
  inputAno.value = '2030';

  const labelTexto = document.createElement('label');
  labelTexto.textContent = `Descrição ${novo}`;

  const textarea = document.createElement('textarea');
  textarea.id = `timeline-text-${novo}`;
  textarea.value = 'Novo marco histórico.';

  container.insertBefore(labelAno, btn);
  container.insertBefore(inputAno, btn);
  container.insertBefore(labelTexto, btn);
  container.insertBefore(textarea, btn);

  inputAno.addEventListener('input', atualizarPreview);
  textarea.addEventListener('input', atualizarPreview);

  showToast('Novo marco histórico criado.');
}

function duplicarBlocoAtivo() {
  const ativo = document.querySelector('.builder-block.active');

  if (!ativo) return;

  const clone = ativo.cloneNode(true);
  clone.classList.remove('active');

  ativo.parentNode.insertBefore(clone, ativo.nextSibling);

  ativarCliqueNosBlocos();
  ligarAcoesDosBlocos();
  aplicarEstruturaAtualNaPreview();

  showToast('Bloco duplicado.');
}

function aplicarEstruturaAtualNaPreview() {
  const slug = builderPageSelect?.value;

  if (slug === 'historia') {
    aplicarEstruturaHistoriaNaPreview();
    return;
  }

  aplicarEstruturaDinamicaNaPreview();
}

function aplicarEstruturaDinamicaNaPreview() {
  const doc = getPreviewDoc();
  if (!doc) return;

  const main = doc.querySelector('main');
  if (!main) return;

  const blocos = [...document.querySelectorAll('.builder-block')];

  /*
==========================
REMOVE DUPLICADOS FIXOS
==========================
*/

if (builderPageSelect?.value === 'noticias') {
  [...doc.querySelectorAll('.hero, .page-hero, .news-hero, .internal-page-hero')]
    .filter(el => {
      const h1 = el.querySelector('h1')?.textContent?.toLowerCase() || '';

      return (
        h1.includes('saber') ||
        h1.includes('honra') ||
        h1.includes('disciplina')
      );
    })
    .forEach(el => el.remove());
}

blocos.forEach(block => {
  const id = block.dataset.blockId;
  if (id === 'contato-form') {
  return;
}

  let elemento =
    doc.querySelector(`[data-cms-block-id="${id}"]`);

  if (!elemento) {

    /*
    ==========================
    HOME
    ==========================
    */

    if (id === 'home-banner') {
      elemento = doc.querySelector('.hero');
    }

    if (id === 'home-menu') {
      elemento =
        doc.querySelector('.quick-menu')?.closest('section') ||
        doc.querySelector('.quick-menu');
    }

    if (id === 'home-noticias') {
      elemento =
        doc.querySelector('.news-section') ||
        doc.querySelector('.noticias') ||
        null;
    }

    if (id === 'home-estatisticas') {
      elemento =
        doc.querySelector('.stats')?.closest('section') ||
        doc.querySelector('.stats');
    }

    if (id === 'home-galeria') {
      elemento =
        doc.querySelector('.gallery-section') ||
        doc.querySelector('.galeria') ||
        null;
    }

    if (id === 'home-video') {
      elemento = doc.querySelector('.video-call');
    }

    /*
    ==========================
    NOTÍCIAS
    ==========================
    */

    if (id === 'noticias-banner') {
  elemento =
    doc.querySelector('[data-cms-block-id="noticias-banner"]') ||
    doc.querySelector('.news-hero') ||
    doc.querySelector('.page-hero.red-hero') ||
    doc.querySelector('.page-hero') ||
    doc.querySelector('.internal-page-hero');

  if (elemento) {
    elemento.setAttribute('data-cms-block-id', 'noticias-banner');
  }
}

    /*
    ==========================
    CORPO DE ALUNOS
    ==========================
    */

    if (id === 'alunos-destaque') {
      elemento =
        doc.querySelector('[data-cms-block-id="alunos-destaque"]') ||
        doc.querySelector('.destaque-institucional-section') ||
        doc.querySelector('.feature-card')?.closest('section');
    }

    /*
    ==========================
    HISTÓRIA
    ==========================
    */

    if (id === 'historia-banner') {
      elemento = doc.querySelector('.internal-page-hero');
    }

    if (id === 'historia-texto' || id === 'historia-menu') {
      elemento = doc.querySelector('.history-layout');
    }

    if (id === 'historia-linha') {
      elemento =
        doc.querySelector('.timeline-section') ||
        doc.querySelector('.timeline-grid')?.closest('section');
    }

    if (id === 'historia-video') {
      elemento = doc.querySelector('.video-call');
    }
  }

  if (!elemento) return;

  elemento.style.display =
    block.classList.contains('hidden-block') ? 'none' : '';

  main.appendChild(elemento);
});
}

/* =========================
   APLICAR ESTRUTURA HISTÓRIA
   ========================= */

function aplicarEstruturaHistoriaNaPreview() {
  const doc = getPreviewDoc();
  if (!doc) return;

  const main = doc.querySelector('main');
  if (!main) return;

  const blocos = [...document.querySelectorAll('.builder-block')];

  blocos.forEach(block => {
    const id = block.dataset.blockId;

if (id === 'noticias-recentes') {
    return;
  }

    let elemento = null;

if (id === 'noticias-lista') {
  elemento =
    doc.querySelector('[data-cms-block-id="noticias-lista"]') ||
    doc.querySelector('.news-page');

  if (elemento) {
    elemento.setAttribute('data-cms-block-id', 'noticias-lista');
  }
}

if (id === 'historia-banner') {
  elemento = doc.querySelector('.page-hero');
}

    if (id === 'historia-texto' || id === 'historia-menu') {
      elemento = doc.querySelector('.page-layout');
    }

    if (id === 'historia-linha') {
      elemento = doc.querySelector('.timeline')?.closest('.section');
    }

    if (id === 'historia-video') {
      elemento = doc.querySelector('.video-call');
    }

    if (!elemento) return;

    elemento.style.display = block.classList.contains('hidden-block') ? 'none' : '';

    main.appendChild(elemento);
  });
}

/* =========================
   SALVAR RASCUNHO LOCAL
   ========================= */

function salvarRascunhoLocalHistoria() {
  const doc = getPreviewDoc();
  if (!doc) return;

  const htmlAtual = doc.documentElement.outerHTML;

  localStorage.setItem('site_cms_historia_preview_html', htmlAtual);

  showToast('Rascunho local salvo.');
}

/* =========================
   CONFIGURAÇÕES
   ========================= */

async function carregarConfig() {
  try {
    const res = await fetch(`${API_PUBLICA}/config`);
    const data = await res.json();

    if (!data.ok) return;

    const config = data.config || {};

    const dashVisitas = document.getElementById('dash-visitas');
    const visitasTotal = document.getElementById('visitas-total');
    const visitasHoje = document.getElementById('visitas-hoje');

    if (dashVisitas) dashVisitas.textContent = config.analytics?.visitasTotais || 0;
    if (visitasTotal) visitasTotal.textContent = config.analytics?.visitasTotais || 0;
    if (visitasHoje) visitasHoje.textContent = config.analytics?.visitasHoje || 0;

    if (getInput('config-nome')) getInput('config-nome').value = config.nomeSite || '';
    if (getInput('config-sigla')) getInput('config-sigla').value = config.sigla || '';
    if (getInput('config-descricao')) getInput('config-descricao').value = config.descricao || '';

    if (getInput('config-email')) getInput('config-email').value = config.email || '';
    if (getInput('config-telefone')) getInput('config-telefone').value = config.telefone || '';
    if (getInput('config-whatsapp')) getInput('config-whatsapp').value = config.redesSociais?.whatsapp || '';
    if (getInput('config-endereco')) getInput('config-endereco').value = config.endereco || '';

    if (getInput('config-facebook')) getInput('config-facebook').value = config.redesSociais?.facebook || '';
    if (getInput('config-instagram')) getInput('config-instagram').value = config.redesSociais?.instagram || '';
    if (getInput('config-youtube')) getInput('config-youtube').value = config.redesSociais?.youtube || '';

    if (getInput('config-seo-title')) getInput('config-seo-title').value = config.seoTitulo || config.nomeSite || '';
    if (getInput('config-seo-description')) getInput('config-seo-description').value = config.seoDescricao || config.descricao || '';
    if (getInput('ident-logo-header')) {
  getInput('ident-logo-header').value = config.logoUrl || '';
}

if (getInput('ident-brasao')) {
  getInput('ident-brasao').value = config.brasaoUrl || '';
}

if (getInput('ident-favicon')) {
  getInput('ident-favicon').value = config.faviconUrl || '';
}

if (getInput('ident-cor-primaria')) {
  getInput('ident-cor-primaria').value = config.corPrimaria || '#061a35';
}

if (getInput('ident-cor-secundaria')) {
  getInput('ident-cor-secundaria').value = config.corSecundaria || '#b9151b';
}

if (getInput('ident-cor-destaque')) {
  getInput('ident-cor-destaque').value = config.corDestaque || '#f5b51b';
}

if (getInput('global-header-title')) {
  getInput('global-header-title').value =
    config.layoutGlobal?.header?.titulo || 'COLÉGIO DOM PEDRO II';
}

if (getInput('global-header-subtitle')) {
  getInput('global-header-subtitle').value =
    config.layoutGlobal?.header?.subtitulo || 'CAMPUS CZS SUL';
}

if (getInput('global-header-small')) {
  getInput('global-header-small').value =
    config.layoutGlobal?.header?.descricaoPequena || 'Unidade de Ensino do CBMAC';
}

if (getInput('global-header-logo')) {
  getInput('global-header-logo').value =
    config.layoutGlobal?.header?.logo || '';
}

if (getInput('global-header-button-text')) {
  getInput('global-header-button-text').value =
    config.layoutGlobal?.header?.botaoTexto || 'Acesso Axoriin';
}

if (getInput('global-header-button-link')) {
  getInput('global-header-button-link').value =
    config.layoutGlobal?.header?.botaoLink || 'https://axoriin.com.br';
}

aplicarIdentidadeNaPreview();
  } catch (err) {
    console.error(err);
  }
}

document.getElementById('btn-save-config')?.addEventListener('click', async () => {
  const payload = {
    nomeSite: getInput('config-nome')?.value || '',
    sigla: getInput('config-sigla')?.value || '',
    descricao: getInput('config-descricao')?.value || '',

    email: getInput('config-email')?.value || '',
    telefone: getInput('config-telefone')?.value || '',
    endereco: getInput('config-endereco')?.value || '',

    redesSociais: {
      facebook: getInput('config-facebook')?.value || '',
      instagram: getInput('config-instagram')?.value || '',
      youtube: getInput('config-youtube')?.value || '',
      whatsapp: getInput('config-whatsapp')?.value || ''
    },

    seoTitulo: getInput('config-seo-title')?.value || '',
    seoDescricao: getInput('config-seo-description')?.value || ''
  };

  try {
    const res = await fetch(`${API_ADMIN}/config`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${localStorage.getItem('site_cms_token')}`
      },
      body: JSON.stringify(payload)
    });

    const data = await res.json();

    if (!data.ok) {
      showToast(data.erro || 'Erro ao salvar configurações.');
      return;
    }

    showToast('Configurações salvas com sucesso.');
    carregarConfig();
    aplicarLayoutGlobalNaPreview();
    const doc = getPreviewDoc();

if (doc) {
  const footer = doc.querySelector('.footer');
  const copyright = doc.querySelector('.copyright');

  const redes = payload.redesSociais || {};

  if (footer) {
    footer.innerHTML = `
      <div>
        <h3>${payload.nomeSite}</h3>
        <p>${payload.sigla}</p>
        <small>${payload.descricao}</small>

        <div class="footer-socials">

  ${redes.facebook ? `
    <a href="${redes.facebook}" target="_blank" rel="noopener noreferrer" class="footer-social-btn" aria-label="Facebook">
      <span>f</span>
    </a>
  ` : ''}

  ${redes.instagram ? `
    <a href="${redes.instagram}" target="_blank" rel="noopener noreferrer" class="footer-social-btn" aria-label="Instagram">
      <span>◎</span>
    </a>
  ` : ''}

  ${redes.youtube ? `
    <a href="${redes.youtube}" target="_blank" rel="noopener noreferrer" class="footer-social-btn" aria-label="YouTube">
      <span>▶</span>
    </a>
  ` : ''}

  ${redes.whatsapp ? `
    <a href="https://wa.me/${redes.whatsapp.replace(/\D/g, '')}" target="_blank" rel="noopener noreferrer" class="footer-social-btn" aria-label="WhatsApp">
      <span>☎</span>
    </a>
  ` : ''}

</div>
      </div>

      <div>
        <h4>Links rápidos</h4>
        <a href="./index.html">Início</a>
        <a href="./historia.html">História</a>
        <a href="./noticias.html">Notícias</a>
        <a href="./contato.html">Contato</a>
      </div>

      <div>
        <h4>Contato</h4>
        ${payload.telefone ? `<p>📞 ${payload.telefone}</p>` : ''}
        ${payload.email ? `<p>✉️ ${payload.email}</p>` : ''}
        ${payload.endereco ? `<p>📍 ${payload.endereco}</p>` : ''}
        ${redes.whatsapp ? `<p>💬 WhatsApp: ${redes.whatsapp}</p>` : ''}
      </div>
    `;
  }

  if (copyright) {
    copyright.textContent =
      `© ${new Date().getFullYear()} ${payload.nomeSite}. Todos os direitos reservados.`;
  }
}
  } catch (err) {
    console.error(err);
    showToast('Falha ao salvar. Verifique se está logado.');
  }
});

/* =========================
   MÍDIAS / UPLOAD
   ========================= */

const uploadFile = document.getElementById('upload-file');

document.getElementById('btn-upload-midia')?.addEventListener('click', () => {
  document.getElementById('upload-file')?.click();
});

document.addEventListener('change', async (e) => {
  if (e.target?.id !== 'upload-file') return;

  const file = e.target.files?.[0];

  if (!file) return;

  const formData = new FormData();
  formData.append('arquivo', file);

  try {
    showToast('Enviando arquivo...');

    const res = await fetch(`${API_ADMIN}/midias/upload`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${localStorage.getItem('site_cms_token')}`
      },
      body: formData
    });

    const data = await res.json();

    if (!data.ok) {
      showToast(data.erro || 'Erro ao enviar arquivo.');
      return;
    }

    
   const url = data.midia?.url || data.url;

if (url) {
  if (cmsUploadTarget && getInput(cmsUploadTarget)) {
    getInput(cmsUploadTarget).value = url;
    cmsUploadTarget = null;
    atualizarPreview();
  } else if (
    blocoAtivoId &&
    blocoAtivoId.includes('-dinamico') &&
    getInput('dynamic-image')
  ) {
    getInput('dynamic-image').value = url;
    atualizarPreview();
  } else {
    console.warn(
      'Upload concluído, mas nenhum campo alvo válido foi definido.',
      { url, cmsUploadTarget, blocoAtivoId }
    );

    showToast(
      'Arquivo enviado para a biblioteca. Selecione o campo correto antes de inserir.'
    );
  }
}

    showToast('Arquivo enviado com sucesso.');
    carregarMidias();
  } catch (err) {
    console.error(err);
    showToast('Falha ao enviar. Verifique se está logado.');
  } finally {
    e.target.value = '';
  }
});

async function carregarMidias() {
  const grid = document.getElementById('media-grid');
  if (!grid) return;

  grid.innerHTML = '<div class="empty-state">Carregando mídias...</div>';

  try {
    const res = await fetch(`${API_PUBLICA}/midias`);
    const data = await res.json();

    if (!data.ok || !Array.isArray(data.midias) || data.midias.length === 0) {
      grid.innerHTML = '<div class="empty-state">Nenhuma mídia carregada ainda.</div>';

      const dashMidias = document.getElementById('dash-midias');
      if (dashMidias) dashMidias.textContent = 0;

      return;
    }

    const dashMidias = document.getElementById('dash-midias');
    if (dashMidias) dashMidias.textContent = data.midias.length;

    grid.innerHTML = data.midias.map(midia => {
      const isImagem =
        midia.tipo === 'imagem' ||
        midia.mimeType?.startsWith?.('image/') ||
        /\.(png|jpe?g|webp|gif|svg)$/i.test(midia.url || '');

      const nome =
        midia.nomeOriginal ||
        midia.nome ||
        'Arquivo';

      const tipo =
        midia.tipo ||
        midia.mimeType ||
        'mídia';

      const url =
        midia.url ||
        '';

      return `
        <article class="media-item premium-media-item">
          <div
            class="media-thumb premium-media-thumb"
            style="${
              isImagem && url
                ? `background-image:url('${url}');`
                : ''
            }"
          >
            ${isImagem ? '' : '<span>📄</span>'}
          </div>

          <div class="premium-media-body">
            <strong title="${nome}">
              ${nome}
            </strong>

            <small>
              ${tipo}
            </small>

            <div class="premium-media-actions">

  <button
    type="button"
    class="btn-copy-media-url"
    data-url="${url}"
  >
    Copiar URL
  </button>

  <a
    href="${url}"
    target="_blank"
    rel="noopener noreferrer"
  >
    Abrir
  </a>

  <button
    type="button"
    class="btn-delete-media danger"
    data-id="${midia._id}"
  >
    Excluir
  </button>

</div>
          </div>
        </article>
      `;
    }).join('');
  } catch (err) {
    console.error(err);
    grid.innerHTML = '<div class="empty-state">Erro ao carregar mídias.</div>';
  }
}

document.addEventListener('click', async (e) => {
  const btnCopy = e.target.closest('.btn-copy-media-url');

  if (!btnCopy) return;

  const url = btnCopy.dataset.url;

  if (!url) {
    showToast('URL não encontrada.');
    return;
  }

  try {
    await navigator.clipboard.writeText(url);
    showToast('URL copiada.');
  } catch (err) {
    console.error(err);
    showToast('Não foi possível copiar a URL.');
  }
});

document.addEventListener('click', async (e) => {

  const btnDelete = e.target.closest('.btn-delete-media');

  if (!btnDelete) return;

  const id = btnDelete.dataset.id;

  if (!id) {
    showToast('Mídia inválida.');
    return;
  }

  const confirmar = confirm(
    'Deseja realmente excluir esta mídia?'
  );

  if (!confirmar) return;

  try {

    const res = await fetch(
      `${API_ADMIN}/midias/${id}`,
      {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('site_cms_token')}`
        }
      }
    );

    const data = await res.json();

    if (!data.ok) {
      throw new Error(
        data.erro || 'Erro ao excluir mídia.'
      );
    }

    showToast('Mídia excluída.');

    carregarMidias();

  } catch (err) {
    console.error(err);

    showToast(
      err.message || 'Erro ao excluir mídia.'
    );
  }

});

let mediaPickerTarget = null;

function abrirMediaPicker(targetId) {
  mediaPickerTarget = targetId;

  const overlay = document.getElementById('media-picker-overlay');
  const grid = document.getElementById('media-picker-grid');

  if (!overlay || !grid) {
    showToast('Modal da biblioteca não encontrado.');
    return;
  }

  overlay.classList.add('show');

  carregarMidiasNoPicker();
}

function fecharMediaPicker() {
  const overlay = document.getElementById('media-picker-overlay');

  if (overlay) {
    overlay.classList.remove('show');
  }

  mediaPickerTarget = null;
}

async function carregarMidiasNoPicker() {
  const grid = document.getElementById('media-picker-grid');

  if (!grid) return;

  grid.innerHTML = '<div class="empty-state">Carregando mídias...</div>';

  try {
    const res = await fetch(`${API_PUBLICA}/midias?tipo=imagem`);
    const data = await res.json();

    if (!data.ok || !Array.isArray(data.midias) || data.midias.length === 0) {
      grid.innerHTML = '<div class="empty-state">Nenhuma imagem encontrada.</div>';
      return;
    }

    grid.innerHTML = data.midias.map(midia => {
      const nome = midia.nomeOriginal || midia.nome || 'Imagem';
      const url = midia.url || '';

      return `
        <article
          class="media-picker-card"
          data-url="${url}"
        >
          <div
            class="media-picker-thumb"
            style="background-image:url('${url}')"
          ></div>

          <div class="media-picker-body">
            <strong title="${nome}">
              ${nome}
            </strong>

            <small>
              Selecionar imagem
            </small>
          </div>
        </article>
      `;
    }).join('');
  } catch (err) {
    console.error(err);
    grid.innerHTML = '<div class="empty-state">Erro ao carregar biblioteca.</div>';
  }
}

document.addEventListener('click', (e) => {
  const btnPicker = e.target.closest('.btn-open-media-picker');

  if (!btnPicker) return;

  const target = btnPicker.dataset.target;

  if (!target) {
    showToast('Campo de destino não encontrado.');
    return;
  }

  abrirMediaPicker(target);
});

document.addEventListener('click', (e) => {
  const card = e.target.closest('.media-picker-card');

  if (!card) return;

  const url = card.dataset.url;

  if (!url || !mediaPickerTarget) {
    showToast('Não foi possível selecionar a mídia.');
    return;
  }

  const input = document.getElementById(mediaPickerTarget);

  if (!input) {
    showToast('Campo não encontrado.');
    return;
  }

  input.value = url;

  input.dispatchEvent(new Event('input', { bubbles: true }));

  atualizarPreview();

  fecharMediaPicker();

  showToast('Imagem aplicada ao bloco.');
});

document.getElementById('btn-close-media-picker')?.addEventListener('click', fecharMediaPicker);

document.getElementById('media-picker-overlay')?.addEventListener('click', (e) => {
  if (e.target.id === 'media-picker-overlay') {
    fecharMediaPicker();
  }
});

let noticiasCmsCache = [];

function gerarSlugNoticia(texto = '') {
  return String(texto)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function limparFormularioNoticia() {
  getInput('cms-news-id').value = '';
  getInput('cms-news-title').value = '';
  getInput('cms-news-slug').value = '';

  aplicarCategoriaNoticia('Comunicado');

  getInput('cms-news-author').value = 'Comunicação CMDPII';
  getInput('cms-news-summary').value = '';
  getInput('cms-news-content').value = '';
  getInput('cms-news-image').value = '';

  getInput('cms-news-featured').checked = false;
  getInput('cms-news-published').checked = false;

  getInput('cms-news-seo-title').value = '';
  getInput('cms-news-seo-description').value = '';

  renderizarImagensNoticia([]);

  const title = document.getElementById('cms-news-form-title');

  if (title) {
    title.textContent = 'Nova notícia';
  }
}

async function carregarNoticiasCms() {
  const list = document.getElementById('cms-news-list');
  if (!list) return;

  list.innerHTML = '<div class="empty-state">Carregando notícias...</div>';

  try {
    const res = await fetch(`${API_ADMIN}/noticias`, {
      headers: {
        Authorization: `Bearer ${localStorage.getItem('site_cms_token')}`
      }
    });

    const data = await res.json();

    if (!data.ok) {
      throw new Error(data.erro || 'Erro ao carregar notícias.');
    }

    noticiasCmsCache = data.noticias || [];

    if (!noticiasCmsCache.length) {
      list.innerHTML = '<div class="empty-state">Nenhuma notícia cadastrada ainda.</div>';
      return;
    }

    list.innerHTML = noticiasCmsCache.map(noticia => `
      <article class="cms-news-card" data-id="${noticia._id}">
        <div
          class="cms-news-thumb"
          style="${noticia.imagem ? `background-image:url('${noticia.imagem}')` : ''}"
        >
          ${noticia.imagem ? '' : '📰'}
        </div>

        <div class="cms-news-info">
          <strong>${noticia.titulo || 'Sem título'}</strong>
          <small>
            ${noticia.categoria || 'Sem categoria'} ·
            ${noticia.status === 'publicada' ? 'Publicada' : 'Rascunho'}
            ${noticia.destaque ? ' · Destaque' : ''}
          </small>

          <div class="cms-news-actions">
            <button type="button" class="btn-edit-cms-news" data-id="${noticia._id}">
              Editar
            </button>

            <button type="button" class="btn-delete-cms-news danger" data-id="${noticia._id}">
              Excluir
            </button>
          </div>
        </div>
      </article>
    `).join('');

  } catch (err) {
    console.error(err);
    list.innerHTML = '<div class="empty-state">Erro ao carregar notícias.</div>';
  }
}

function preencherFormularioNoticia(noticia) {
  if (!noticia) return;

  getInput('cms-news-id').value = noticia._id || '';
  getInput('cms-news-title').value = noticia.titulo || '';
  getInput('cms-news-slug').value = noticia.slug || '';

  aplicarCategoriaNoticia(noticia.categoria || 'Comunicado');

  getInput('cms-news-author').value = noticia.autor || 'Comunicação CMDPII';
  getInput('cms-news-summary').value = noticia.resumo || '';
  getInput('cms-news-content').value = noticia.conteudo || '';
  getInput('cms-news-image').value = noticia.imagem || '';

  renderizarImagensNoticia(noticia.imagens || []);

  getInput('cms-news-featured').checked = !!noticia.destaque;
  getInput('cms-news-published').checked = noticia.status === 'publicada';
  getInput('cms-news-seo-title').value = noticia.seoTitulo || '';
  getInput('cms-news-seo-description').value = noticia.seoDescricao || '';

  const title = document.getElementById('cms-news-form-title');
  if (title) title.textContent = 'Editar notícia';
}

async function salvarNoticiaCms(e) {
  e.preventDefault();

  const id = getInput('cms-news-id')?.value || '';
  const titulo = getInput('cms-news-title')?.value?.trim() || '';

  if (!titulo) {
    showToast('Informe o título da notícia.');
    return;
  }

  const payload = {
    titulo,
    slug: getInput('cms-news-slug')?.value?.trim() || gerarSlugNoticia(titulo),
    categoria: obterCategoriaNoticia(),
    autor: getInput('cms-news-author')?.value || 'Comunicação CMDPII',
    resumo: getInput('cms-news-summary')?.value || '',
    conteudo: getInput('cms-news-content')?.value || '',
    imagem: getInput('cms-news-image')?.value || '',
    imagens: coletarImagensNoticia(),
    destaque: getInput('cms-news-featured')?.checked || false,
    status: getInput('cms-news-published')?.checked ? 'publicada' : 'rascunho',
    seoTitulo: getInput('cms-news-seo-title')?.value || '',
    seoDescricao: getInput('cms-news-seo-description')?.value || ''
  };

  try {
    const url = id
      ? `${API_ADMIN}/noticias/${id}`
      : `${API_ADMIN}/noticias`;

    const res = await fetch(url, {
      method: id ? 'PUT' : 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${localStorage.getItem('site_cms_token')}`
      },
      body: JSON.stringify(payload)
    });

    const data = await res.json();

    if (!data.ok) {
      throw new Error(data.erro || 'Erro ao salvar notícia.');
    }

    showToast('Notícia salva com sucesso.');
    limparFormularioNoticia();
    carregarNoticiasCms();

  } catch (err) {
    console.error(err);
    showToast(err.message || 'Erro ao salvar notícia.');
  }
}

document.getElementById('cms-news-form')?.addEventListener('submit', salvarNoticiaCms);

document.getElementById('btn-add-news')?.addEventListener('click', () => {
  limparFormularioNoticia();
  showToast('Nova notícia iniciada.');
});

document.getElementById('cms-news-category')?.addEventListener('change', () => {
  const custom = getInput('cms-news-category-custom');
  if (!custom) return;

  custom.style.display =
    getInput('cms-news-category')?.value === 'Outro'
      ? 'block'
      : 'none';
});

document.getElementById('btn-upload-news-images')?.addEventListener('click', () => {
  document.getElementById('cms-news-images-upload')?.click();
});

document.getElementById('cms-news-images-upload')?.addEventListener('change', async e => {
  try {
    await enviarMultiplasImagensNoticia(e.target.files);
    e.target.value = '';
  } catch (err) {
    console.error(err);
    showToast(err.message || 'Erro ao enviar imagens.');
  }
});

document.addEventListener('click', e => {
  if (e.target.classList.contains('btn-remove-news-image')) {
    e.target.closest('.cms-news-image-item')?.remove();
  }

  if (e.target.classList.contains('btn-news-image-cover')) {
    const i = e.target.dataset.imageIndex;
    const url = getInput(`cms-news-gallery-url-${i}`)?.value || '';

    if (url) {
      getInput('cms-news-image').value = url;
      showToast('Imagem de capa definida.');
    }
  }
});

document.getElementById('btn-clear-news-form')?.addEventListener('click', () => {
  limparFormularioNoticia();
});

getInput('cms-news-title')?.addEventListener('input', () => {
  const slug = getInput('cms-news-slug');
  if (slug && !slug.value.trim()) {
    slug.value = gerarSlugNoticia(getInput('cms-news-title').value);
  }
});

document.addEventListener('click', async (e) => {
  const btnEdit = e.target.closest('.btn-edit-cms-news');

  if (btnEdit) {
    const noticia = noticiasCmsCache.find(item => item._id === btnEdit.dataset.id);
    preencherFormularioNoticia(noticia);
    return;
  }

  const btnDelete = e.target.closest('.btn-delete-cms-news');

  if (btnDelete) {
    if (!confirm('Deseja realmente excluir esta notícia?')) return;

    try {
      const res = await fetch(`${API_ADMIN}/noticias/${btnDelete.dataset.id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('site_cms_token')}`
        }
      });

      const data = await res.json();

      if (!data.ok) {
        throw new Error(data.erro || 'Erro ao excluir notícia.');
      }

      showToast('Notícia excluída.');
      carregarNoticiasCms();

    } catch (err) {
      console.error(err);
      showToast(err.message || 'Erro ao excluir notícia.');
    }
  }
});

/* =========================
   OUTROS BOTÕES
   ========================= */

document.getElementById('btn-preview')?.addEventListener('click', () => {
  atualizarPreview();
  showToast('Prévia atualizada.');
});

function getTituloPaginaCms(slug) {
  const map = {
    home: 'Página Inicial',
    historia: 'História',
    direcao: 'Direção',
    'corpo-alunos': 'Corpo de Alunos',
    'processo-seletivo': 'Processo Seletivo',
    noticias: 'Notícias',
    galeria: 'Galeria',
    contato: 'Contato',
    professores: 'Professores'
  };

  return map[slug] || slug;
}

function getTipoPaginaCms(slug) {
  const map = {
    home: 'home',
    noticias: 'noticias',
    galeria: 'galeria',
    contato: 'contato',
    'processo-seletivo': 'processo-seletivo'
  };

  return map[slug] || 'pagina';
}
const certamesPadrao = [
  {
    titulo: 'Processo Seletivo 2025/2026',
    status: 'Em andamento',
    destaque: true,
    documentos: [
      {
        fase: 'Edital',
        titulo: 'Edital de abertura',
        texto: 'Documento oficial do certame',
        url: '#'
      }
    ]
  }
];

function montarDocumentoCertame(certameIndex, docIndex, item = {}) {
  return `
    <div
      class="certame-doc-editor"
      data-certame-index="${certameIndex}"
      data-doc-index="${docIndex}"
    >
      <label>Fase</label>
      <select id="certame-${certameIndex}-doc-fase-${docIndex}">
        ${[
          'Edital',
          'Retificação',
          'Inscrições',
          'Homologação',
          'Locais de Prova',
          'Gabarito',
          'Recurso',
          'Resultado Preliminar',
          'Resultado Final',
          'Convocação',
          'Matrícula',
          'Documento'
        ].map(fase => `
          <option value="${fase}" ${item.fase === fase ? 'selected' : ''}>
            ${fase}
          </option>
        `).join('')}
      </select>

      <label>Título do documento</label>
      <input
        id="certame-${certameIndex}-doc-titulo-${docIndex}"
        value="${item.titulo || ''}"
        placeholder="Ex: Edital nº 001/2026"
      >

      <label>Texto menor</label>
      <input
        id="certame-${certameIndex}-doc-texto-${docIndex}"
        value="${item.texto || 'Baixar PDF'}"
      >

      <label>Link / arquivo</label>
      <div class="upload-field">
        <input
  id="certame-${certameIndex}-doc-url-${docIndex}"
  value="${item.url || item.link || '#'}"
  placeholder="/uploads/site/edital.pdf"
>

        <button
          class="btn upload btn-upload-certame-doc"
          type="button"
          data-target="certame-${certameIndex}-doc-url-${docIndex}"
        >
          Enviar
        </button>
      </div>

      <button class="btn ghost btn-remove-certame-doc" type="button">
        Remover documento
      </button>
    </div>
  `;
}

function montarItemCertame(n, item = {}) {
  const documentos = Array.isArray(item.documentos) && item.documentos.length
    ? item.documentos
    : [
        {
          fase: 'Edital',
          titulo: 'Edital de abertura',
          texto: 'Baixar PDF',
          url: '#'
        }
      ];

  return `
    <div class="certame-editor" data-certame-index="${n}">
      <div class="news-editor-top">
        <strong>Certame ${n}</strong>

        <div class="quick-item-controls">
          <button type="button" class="btn-certame-up">↑</button>
          <button type="button" class="btn-certame-down">↓</button>
        </div>
      </div>

      <label>Título do certame</label>
      <input
        id="certame-title-${n}"
        value="${item.titulo || 'Processo Seletivo 2025/2026'}"
      >

      <label>Status / fase atual</label>
      <input
        id="certame-status-${n}"
        value="${item.status || 'Em andamento'}"
        placeholder="Ex: Inscrições abertas"
      >

      <label>
        <input
          type="checkbox"
          id="certame-featured-${n}"
          ${item.destaque ? 'checked' : ''}
        >
        Destacar este certame
      </label>

      <div class="cms-alert-info">
        Documentos e fases deste certame
      </div>

      <div id="certame-docs-${n}">
        ${documentos.map((doc, index) =>
          montarDocumentoCertame(n, index + 1, doc)
        ).join('')}
      </div>

      <button
        class="btn ghost full btn-add-certame-doc"
        type="button"
        data-certame-index="${n}"
      >
        + Adicionar fase/documento
      </button>

      <button class="btn ghost btn-remove-certame" type="button">
        Remover certame
      </button>
    </div>
  `;
}

function coletarDocumentosCertame(certameIndex) {
  const documentos = [
    ...document.querySelectorAll(
      `.certame-doc-editor[data-certame-index="${certameIndex}"]`
    )
  ];

  return documentos.map((box, index) => {
    const docIndex = box.dataset.docIndex;

    return {
      ordem: index,
      fase: getInput(`certame-${certameIndex}-doc-fase-${docIndex}`)?.value || 'Edital',
      titulo: getInput(`certame-${certameIndex}-doc-titulo-${docIndex}`)?.value || '',
      texto: getInput(`certame-${certameIndex}-doc-texto-${docIndex}`)?.value || 'Baixar PDF',
      url: getInput(`certame-${certameIndex}-doc-url-${docIndex}`)?.value || '#'
    };
  }).filter(item => item.titulo.trim() || item.url !== '#');
}

function coletarCertamesProcesso() {
  const campos = [...document.querySelectorAll('.certame-editor')];

  return campos.map((box, index) => {
    const certameIndex = box.dataset.certameIndex;

    return {
      ordem: index,
      titulo: getInput(`certame-title-${certameIndex}`)?.value || '',
      status: getInput(`certame-status-${certameIndex}`)?.value || '',
      destaque: getInput(`certame-featured-${certameIndex}`)?.checked || false,
      documentos: coletarDocumentosCertame(certameIndex)
    };
  }).filter(item => item.titulo.trim());
}

function adicionarDocumentoCertame(certameIndex) {
  const container =
    document.getElementById(`certame-docs-${certameIndex}`);

  if (!container) return;

  const novo = Date.now();

  const wrap = document.createElement('div');

  wrap.innerHTML = montarDocumentoCertame(certameIndex, novo, {
    fase: 'Documento',
    titulo: 'Novo documento',
    texto: 'Baixar PDF',
    url: '#'
  });

  const novoItem = wrap.firstElementChild;

  container.appendChild(novoItem);

  ligarEventosDocumentoCertame(novoItem);

  atualizarPreview();

  showToast('Documento adicionado.');
}

function ligarEventosDocumentoCertame(item) {
  if (!item) return;

  item
    .querySelectorAll('input, textarea, select')
    .forEach(el => {
      el.addEventListener('input', atualizarPreview);
      el.addEventListener('change', atualizarPreview);
    });

  item.querySelector('.btn-upload-certame-doc')?.addEventListener('click', () => {
    cmsUploadTarget =
      item.querySelector('.btn-upload-certame-doc')?.dataset.target;

    document.getElementById('upload-file')?.click();
  });

  item.querySelector('.btn-remove-certame-doc')?.addEventListener('click', () => {
    item.remove();

    atualizarPreview();

    showToast('Documento removido.');
  });
}

function montarCamposProcessoCertames(nome) {
  const blocoAtual =
    pageBlocksMap?.['processo-seletivo']
      ?.find(b => b.id === 'processo-certames');

  const certamesSalvos =
    Array.isArray(blocoAtual?.mongo?.itens)
      ? blocoAtual.mongo.itens
      : [];

  const certames =
    certamesSalvos.length
      ? certamesSalvos
      : certamesPadrao;

  return `
    <div class="properties-head">
      <h2>Certames / Processos</h2>
      <span>${nome}</span>
    </div>

    <label>Título da seção</label>
    <input
      id="certames-section-title"
      value="${blocoAtual?.mongo?.titulo || 'Processos Seletivos'}"
    >

    <div id="certames-fields">
      ${certames.map((item, index) =>
        montarItemCertame(index + 1, item)
      ).join('')}
    </div>

    <button class="btn ghost full" id="btn-add-certame" type="button">
      + Adicionar certame
    </button>

    <div class="builder-actions">
      <button class="btn ghost" type="button" data-action="duplicate">
        Duplicar bloco
      </button>

      <button class="btn primary" type="button" data-action="save">
        Salvar bloco
      </button>
    </div>
  `;
}

function coletarConteudoBlocoCms(blocoId) {
  const base = {
    texto: '',
    imagemUrl: '',
    videoUrl: '',
    arquivoUrl: '',
    link: {},
    itens: [],
    configuracao: {
      cmsBlockId: blocoId,
      origem: 'cms-builder'
    }
  };

  if (blocoId.includes('-dinamico')) {
    return {
      ...base,
      titulo: getInput('dynamic-title')?.value || '',
      texto: getInput('dynamic-text')?.value || '',
      imagemUrl: getInput('dynamic-image')?.value || '',
      videoUrl: getInput('dynamic-video')?.value || '',
      arquivoUrl: getInput('dynamic-file')?.value || '',
      link: {
        texto: getInput('dynamic-button-text')?.value || '',
        url: getInput('dynamic-button-link')?.value || ''
      },
      configuracao: {
        ...base.configuracao,
        tipoDinamico: blocoId
      }
    };
  }

  if (blocoId === 'home-menu') {
  return {
    ...base,
    titulo: 'Menu Rápido',
    itens: typeof coletarAtalhosHomeMenu === 'function'
      ? coletarAtalhosHomeMenu()
      : [],
    configuracao: {
      ...base.configuracao,
      tipoRender: 'home-menu'
    }
  };
}

  if (blocoId === 'home-noticias') {
  return {
    ...base,
    titulo: getInput('news-section-title')?.value || 'Notícias em Destaque',
    texto: getInput('news-section-subtitle')?.value || '',
    configuracao: {
      ...base.configuracao,
      tipoRender: 'home-noticias',
      limite: Number(getInput('home-news-limit')?.value || 4),
      categoria: getInput('home-news-category-filter')?.value || '',
      somentePublicadas: getInput('home-news-only-published')?.checked ?? true,
      destaquesPrimeiro: getInput('home-news-featured-first')?.checked ?? true,
      textoLinkGeral: getInput('home-news-all-text')?.value || 'VER TODAS AS NOTÍCIAS →',
      textoBotao: getInput('home-news-button-text')?.value || 'Leia mais →'
    }
  };
}

if (blocoId === 'home-associacao') {
  return {
    ...base,

    titulo:
      getInput('home-assoc-title')?.value ||
      'Associação de Pais',

    texto:
      getInput('home-assoc-text')?.value || '',

    link: {
      texto:
        getInput('home-assoc-button-text')?.value ||
        'Quero participar',

      url:
        getInput('home-assoc-button-link')?.value ||
        '#'
    },

    configuracao: {
  ...base.configuracao,
  tipoRender: 'home-associacao',

  modalTitulo:
    getInput('home-assoc-modal-title')?.value ||
    'Associação de Pais do Colégio',

  modalTexto:
    getInput('home-assoc-modal-text')?.value || '',

  projetos:
    typeof coletarProjetosAssociacaoHome === 'function'
      ? coletarProjetosAssociacaoHome()
      : []
}
  };
}

if (blocoId === 'home-documentos') {
  return {
    ...base,

    titulo:
      getInput('home-docs-title')?.value ||
      'Documentos e Informações',

    texto:
      getInput('home-docs-text')?.value || '',

    itens:
      typeof coletarHomeDocumentos === 'function'
        ? coletarHomeDocumentos()
        : [],

    configuracao: {
      ...base.configuracao,
      tipoRender: 'home-documentos'
    }
  };
}

  if (blocoId === 'home-estatisticas') {
  return {
    ...base,
    titulo: 'Estatísticas',
    itens: typeof coletarEstatisticasHome === 'function'
      ? coletarEstatisticasHome()
      : [],
    configuracao: {
      ...base.configuracao,
      tipoRender: 'home-estatisticas'
    }
  };
}

  if (blocoId === 'home-galeria') {
  return {
    ...base,
    titulo: getInput('gallery-section-title')?.value || 'Galeria de fotos',
    texto: getInput('gallery-section-subtitle')?.value || '',
    itens: typeof coletarGaleriaHome === 'function'
      ? coletarGaleriaHome()
      : [],
    link: {
      texto: getInput('gallery-link-text')?.value || 'Ver galeria completa',
      url: getInput('gallery-link-url')?.value || './galeria.html'
    },
    configuracao: {
      ...base.configuracao,
      tipoRender: 'home-galeria'
    }
  };
}

  if (blocoId === 'home-patrocinadores') {
    return {
      ...base,
      titulo: getInput('home-sponsor-section-title')?.value || 'Patrocinadores e Parceiros',
      texto: getInput('home-sponsor-section-text')?.value || '',
      configuracao: {
        ...base.configuracao,
        limite: Number(getInput('home-sponsor-limit')?.value || 6),
        tipo: getInput('home-sponsor-type-filter')?.value || '',
        somenteAtivos: getInput('home-sponsor-only-active')?.checked ?? true,
        destaquesPrimeiro: getInput('home-sponsor-featured-first')?.checked ?? true,
        layout: getInput('home-sponsor-layout')?.value || 'grid'
      }
    };
  }

  if (blocoId === 'home-video') {
  return {
    ...base,
    titulo: getInput('video-section-title')?.value || '',
    texto: getInput('video-section-text')?.value || '',
    imagemUrl: getInput('video-cover-image')?.value || '',
    videoUrl: getInput('video-link')?.value || '',
    link: {
      texto: getInput('video-button-text')?.value || 'Assistir vídeo',
      url: getInput('video-link')?.value || ''
    }
  };
}

if (blocoId === 'historia-linha') {
  return {
    ...base,
    titulo: getInput('timeline-section-title')?.value || 'Linha do Tempo',
    itens: typeof coletarTimelineHistoria === 'function'
      ? coletarTimelineHistoria()
      : [],
    configuracao: {
      ...base.configuracao,
      tipoRender: 'timeline'
    }
  };
}

if (blocoId === 'direcao-equipe') {
  return {
    ...base,
    titulo: getInput('team-section-title')?.value || 'Equipe Gestora',
    texto: getInput('team-section-text')?.value || '',
    itens: typeof coletarEquipeDirecao === 'function'
      ? coletarEquipeDirecao()
      : [],
    configuracao: {
      ...base.configuracao,
      tipoRender: 'equipe'
    }
  };
}

if (blocoId === 'processo-cronograma') {
  return {
    ...base,
    titulo: getInput('schedule-section-title')?.value || 'Cronograma',
    texto: getInput('schedule-section-text')?.value || '',
    itens: typeof coletarCronogramaProcesso === 'function'
      ? coletarCronogramaProcesso()
      : [],
    configuracao: {
      ...base.configuracao,
      tipoRender: 'cronograma'
    }
  };
}

if (blocoId === 'processo-editais') {
  return {
    ...base,
    titulo: getInput('process-edital-section-title')?.value || 'Editais e Documentos',
    texto: '',
    itens: typeof coletarEditaisProcesso === 'function'
      ? coletarEditaisProcesso().map(item => ({
          ordem: item.ordem,
          icon: item.icon || '📄',
          categoria: item.categoria || 'Editais',
          titulo: item.titulo || '',
          texto: item.texto || '',
          url: item.link || '#'
        }))
      : [],
    configuracao: {
      ...base.configuracao,
      tipoRender: 'downloads-expansivel'
    }
  };
}

if (blocoId === 'processo-banner') {
  const breadcrumb =
    getInput('processo-banner-tag')?.value ||
    'Processo de admissão de alunos';

  const overlay =
    getInput('processo-banner-overlay')?.value ||
    '0.90';

  return {
    ...base,

    titulo:
      getInput('processo-banner-title')?.value ||
      'Ingresso com disciplina, organização e excelência educacional.',

    subtitulo: breadcrumb,

    texto:
      getInput('processo-banner-text')?.value || '',

    imagemUrl:
      getInput('processo-banner-image')?.value || '',

    link: {
      texto:
        getInput('processo-banner-btn1-text')?.value ||
        'Baixar edital',

      url:
        getInput('processo-banner-btn1-link')?.value ||
        '#'
    },

    itens: [
      {
        texto:
          getInput('processo-banner-badge-1')?.value ||
          'CBMAC'
      },
      {
        texto:
          getInput('processo-banner-badge-2')?.value ||
          'CMDPII'
      },
      {
        texto:
          getInput('processo-banner-btn2-text')?.value ||
          'Inscrição online',

        link:
          getInput('processo-banner-btn2-link')?.value ||
          '#',

        tipo: 'botao-secundario'
      }
    ],

    configuracao: {
      ...base.configuracao,
      tipoRender: 'hero-interno',
      breadcrumb,
      overlay
    }
  };
}

if (blocoId === 'processo-etapas') {
  return {
    ...base,
    titulo: getInput('process-steps-section-title')?.value || 'Etapas do Processo',
    texto: '',
    itens: typeof coletarEtapasProcesso === 'function'
      ? coletarEtapasProcesso().map(item => ({
          ordem: item.ordem,
          numero: item.numero || '★',
          icon: item.numero || '★',
          titulo: item.titulo || '',
          texto: item.texto || ''
        }))
      : [],
    configuracao: {
      ...base.configuracao,
      tipoRender: 'cards'
    }
  };
}

if (blocoId === 'processo-chamada') {
  return {
    ...base,
    titulo:
      getInput('processo-chamada-title')?.value ||
      'Chamada de Inscrição',

    texto:
      getInput('processo-chamada-text')?.value ||
      '',

    imagemUrl:
      getInput('processo-chamada-bg')?.value ||
      '',

    link: {
      texto:
        getInput('processo-chamada-button')?.value ||
        'Acessar',

      url:
        getInput('processo-chamada-link')?.value ||
        ''
    },

    configuracao: {
      ...base.configuracao,
      tipoRender: 'cta',
      icone:
        getInput('processo-chamada-icon')?.value ||
        '🎖️'
    }
  };
}

if (blocoId === 'processo-certames') {
  return {
    ...base,
    titulo: getInput('certames-section-title')?.value || 'Processos Seletivos',
    itens: typeof coletarCertamesProcesso === 'function'
      ? coletarCertamesProcesso()
      : [],
    configuracao: {
      ...base.configuracao,
      tipoRender: 'certames'
    }
  };
}

if (blocoId === 'galeria-banner') {
  const breadcrumb =
    getInput('galeria-banner-breadcrumb')?.value ||
    'Início › Galeria';

  const overlay =
    getInput('galeria-banner-overlay')?.value ||
    '0.92';

  return {
    ...base,

    titulo:
      getInput('galeria-banner-title')?.value ||
      'Galeria Institucional',

    subtitulo: breadcrumb,

    texto:
      getInput('galeria-banner-text')?.value || '',

    imagemUrl:
      getInput('galeria-banner-image')?.value || '',

    configuracao: {
      ...base.configuracao,
      tipoRender: 'hero-interno',
      breadcrumb,
      overlay
    }
  };
}

if (blocoId === 'galeria-filtros') {
  return {
    ...base,
    titulo: 'Filtros da Galeria',
    itens: typeof coletarFiltrosGaleria === 'function'
      ? coletarFiltrosGaleria()
      : [],
    configuracao: {
      ...base.configuracao,
      tipoRender: 'galeria-filtros'
    }
  };
}

if (blocoId === 'galeria-grid') {
  return {
    ...base,
    titulo: getInput('gallery-grid-section-title')?.value || 'Galeria de Imagens',
    itens: typeof coletarGridGaleria === 'function'
      ? coletarGridGaleria().map(item => ({
          ordem: item.ordem,
          destaque: item.grande,
          imagem: item.imagem,
          categoria: item.etiqueta || 'Galeria',
          titulo: item.titulo,
          legenda: item.etiqueta || '',
          imagens: coletarFotosEventoGaleria(item.eventIndex)
        }))
      : [],
    configuracao: {
      ...base.configuracao,
      tipoRender: 'galeria-premium'
    }
  };
}

if (blocoId === 'galeria-video') {
  return {
    ...base,
    titulo: getInput('galeria-video-title')?.value || 'Vídeo Institucional',
    subtitulo: getInput('galeria-video-label')?.value || 'Vídeo institucional',
    texto: getInput('galeria-video-text')?.value || '',
    imagemUrl: getInput('galeria-video-cover')?.value || '',
    videoUrl: getInput('galeria-video-link')?.value || '',
    link: {
      texto: getInput('galeria-video-button')?.value || 'Assistir vídeo',
      url: getInput('galeria-video-link')?.value || ''
    },
    configuracao: {
      ...base.configuracao,
      tipoRender: 'video'
    }
  };
}

if (
  blocoId === 'home-banner' ||
  blocoId === 'saber-honra-disciplina' ||
  blocoId.includes('saber') ||
  blocoId.includes('disciplina')
) {

  const slides =
    typeof coletarSlidesHomeBanner === 'function'
      ? coletarSlidesHomeBanner()
      : [];

  return {
    ...base,

    titulo:
      getInput('hero-title')?.value || '',

    texto:
      getInput('hero-text')?.value || '',

    imagemUrl:
      getInput('image-url')?.value || '',

    itens: slides,

    link: {
      texto:
        getInput('button-text')?.value || '',

      url:
        getInput('button-link')?.value || ''
    },

    configuracao: {
      ...base.configuracao,
      tipoRender: 'home-banner',
      autoplay: true,
      intervalo: 4000
    }
  };
}

if (blocoId === 'historia-banner') {
  const breadcrumb = getInput('hist-banner-breadcrumb')?.value || 'Início › História';
  const overlay = getInput('hist-banner-overlay')?.value || '0.94';

  return {
    ...base,
    titulo: getInput('hist-banner-title')?.value || 'Nossa História',
    subtitulo: breadcrumb,
    texto: getInput('hist-banner-text')?.value || '',
    imagemUrl: getInput('hist-banner-image')?.value || '',
    configuracao: {
      ...base.configuracao,
      tipoRender: 'hero-interno',
      breadcrumb,
      overlay
    }
  };
}

if (blocoId === 'historia-texto') {
  const itens = typeof coletarParagrafosHistoria === 'function'
    ? coletarParagrafosHistoria()
    : [];

  return {
    ...base,
    titulo: getInput('hist-text-title')?.value || 'Nossa História',
    subtitulo: getInput('hist-text-subtitle')?.value || '',
    texto: itens.map(item => item.texto || '').join('\n\n'),
    itens,
    configuracao: {
      ...base.configuracao,
      tipoRender: 'padrao'
    }
  };
}

if (blocoId === 'historia-menu') {
  return {
    ...base,
    titulo: 'Menu Lateral',
    itens: typeof coletarMenuHistoria === 'function'
      ? coletarMenuHistoria()
      : [],
    configuracao: {
      ...base.configuracao,
      tipoRender: 'lista'
    }
  };
}

if (blocoId === 'historia-video') {
  return {
    ...base,
    titulo: getInput('hist-video-title')?.value || '',
    texto: getInput('hist-video-text')?.value || '',
    imagemUrl: getInput('hist-video-bg')?.value || '',
    videoUrl: getInput('hist-video-link')?.value || '',
    link: {
      texto: getInput('hist-video-button')?.value || 'Assistir vídeo',
      url: getInput('hist-video-link')?.value || ''
    },
    configuracao: {
      ...base.configuracao,
      tipoRender: 'video'
    }
  };
}

if (blocoId === 'direcao-banner') {
  const breadcrumb = getInput('direcao-banner-breadcrumb')?.value || 'Início › Direção';
  const overlay = getInput('direcao-banner-overlay')?.value || '0.94';

  return {
    ...base,
    titulo: getInput('direcao-banner-title')?.value || 'Direção',
    subtitulo: breadcrumb,
    texto: getInput('direcao-banner-text')?.value || '',
    imagemUrl: getInput('direcao-banner-image')?.value || '',
    configuracao: {
      ...base.configuracao,
      tipoRender: 'hero-interno',
      breadcrumb,
      overlay
    }
  };
}

if (blocoId === 'direcao-intro') {
  return {
    ...base,
    titulo: getInput('direcao-intro-title')?.value || 'Equipe Gestora',
    texto: getInput('direcao-intro-text')?.value || '',
    configuracao: {
      ...base.configuracao,
      tipoRender: 'padrao'
    }
  };
}

if (blocoId === 'direcao-chamada') {
  return {
    ...base,
    titulo: getInput('direcao-chamada-title')?.value || '',
    texto: getInput('direcao-chamada-text')?.value || '',
    imagemUrl: getInput('direcao-chamada-bg')?.value || '',
    link: {
      texto: getInput('direcao-chamada-button')?.value || '',
      url: getInput('direcao-chamada-link')?.value || ''
    },
    configuracao: {
      ...base.configuracao,
      tipoRender: 'cta',
      icone: getInput('direcao-chamada-icon')?.value || '🎖️'
    }
  };
}

if (blocoId === 'alunos-banner') {

  const breadcrumb =
    getInput('alunos-banner-breadcrumb')?.value ||
    'Início › Corpo de Alunos';

  const overlay =
    getInput('alunos-banner-overlay')?.value || '0.94';

  return {
    ...base,

    titulo:
      getInput('alunos-banner-title')?.value ||
      'Corpo de Alunos',

    subtitulo: breadcrumb,

    texto:
      getInput('alunos-banner-text')?.value || '',

    imagemUrl:
      getInput('alunos-banner-image')?.value || '',

    configuracao: {
      ...base.configuracao,
      tipoRender: 'hero-interno',
      breadcrumb,
      overlay
    }
  };
}

if (blocoId === 'alunos-intro') {

  return {
    ...base,

    titulo:
      getInput('alunos-intro-title')?.value ||
      'Formação Integral',

    paragrafos: [
      getInput('alunos-intro-p1')?.value || '',
      getInput('alunos-intro-p2')?.value || ''
    ],

    texto: [
      getInput('alunos-intro-p1')?.value || '',
      getInput('alunos-intro-p2')?.value || ''
    ].filter(Boolean).join('\n\n'),

    configuracao: {
      ...base.configuracao,
      tipoRender: 'texto'
    }
  };
}

if (blocoId === 'alunos-destaque') {
  const tags = typeof coletarTagsAlunos === 'function'
    ? coletarTagsAlunos()
    : [];

  return {
    ...base,
    titulo: getInput('alunos-destaque-title')?.value || 'Destaque Institucional',
    texto: getInput('alunos-destaque-text')?.value || '',
    imagemUrl: getInput('alunos-destaque-image')?.value || '',
    itens: tags.map(tag => ({
      texto: tag.texto
    })),
    configuracao: {
      ...base.configuracao,
     tipoRender: 'destaque',
      label: getInput('alunos-destaque-label')?.value || 'Destaque institucional'
    }
  };
}

if (blocoId === 'alunos-numeros') {
  return {
    ...base,
    titulo: getInput('student-numbers-title')?.value || 'Números Institucionais',
    itens: typeof coletarNumerosAlunos === 'function'
      ? coletarNumerosAlunos()
      : [],
    configuracao: {
      ...base.configuracao,
      tipoRender: 'numeros'
    }
  };
}

if (blocoId === 'alunos-projetos') {
  return {
    ...base,
    titulo: getInput('student-projects-section-title')?.value || 'Projetos e Desenvolvimento',
    itens: typeof coletarProjetosAlunos === 'function'
      ? coletarProjetosAlunos()
      : [],
    configuracao: {
      ...base.configuracao,
      tipoRender: 'cards'
    }
  };
}

if (blocoId === 'alunos-chamada') {

  return {
    ...base,

    titulo:
      getInput('alunos-chamada-title')?.value ||
      'Alunos preparados para o presente e o futuro.',

    texto:
      getInput('alunos-chamada-text')?.value || '',

    imagemUrl:
      getInput('alunos-chamada-bg')?.value || '',

    configuracao: {
      ...base.configuracao,
      tipoRender: 'cta',
      icone:
        getInput('alunos-chamada-icon')?.value || '👥'
    },

    link: {
      texto:
        getInput('alunos-chamada-button')?.value ||
        'Ver galeria estudantil',

      url:
        getInput('alunos-chamada-link')?.value ||
        './galeria.html'
    }
  };
}

if (blocoId === 'noticias-banner') {
  const breadcrumb =
    getInput('noticias-banner-breadcrumb')?.value ||
    'Início › Notícias';

  const overlay =
    getInput('noticias-banner-overlay')?.value || '0.92';

  return {
    ...base,

    titulo:
      getInput('noticias-banner-title')?.value ||
      'Notícias',

    subtitulo: breadcrumb,

    texto:
      getInput('noticias-banner-text')?.value || '',

    imagemUrl:
      getInput('noticias-banner-image')?.value || '',

    configuracao: {
      ...base.configuracao,
      tipoRender: 'hero-interno',
      breadcrumb,
      overlay
    }
  };
}

if (blocoId === 'noticias-lista') {
  return {
    ...base,

    titulo:
      getInput('news-list-section-title')?.value ||
      'Notícias',

    texto:
      getInput('news-list-section-text')?.value || '',

    configuracao: {
      ...base.configuracao,
      tipoRender: 'lista-noticias',

      limite:
        Number(getInput('news-list-limit')?.value || 6),

      categoria:
        getInput('news-list-category-filter')?.value || '',

      somentePublicadas:
        getInput('news-list-only-published')?.checked ?? true,

      destaquesPrimeiro:
        getInput('news-list-featured-first')?.checked ?? true,

      textoBotao:
        getInput('news-list-button-text')?.value ||
        'Ler notícia →'
    }
  };
}

if (blocoId === 'noticias-categorias') {
  return {
    ...base,

    titulo:
      getInput('news-category-section-title')?.value ||
      'Categorias',

    itens:
      typeof coletarCategoriasNoticias === 'function'
        ? coletarCategoriasNoticias()
        : [],

    configuracao: {
      ...base.configuracao,
      tipoRender: 'noticias-categorias'
    }
  };
}

if (blocoId === 'noticias-recentes') {
  return {
    ...base,

    titulo:
      getInput('recent-news-section-title')?.value ||
      'Recentes',

    itens:
      typeof coletarNoticiasRecentes === 'function'
        ? coletarNoticiasRecentes()
        : [],

    configuracao: {
      ...base.configuracao,
      tipoRender: 'noticias-recentes'
    }
  };
}

if (blocoId === 'contato-banner') {
  return {
    ...base,

    titulo:
      getInput('contato-banner-title')?.value ||
      'Contato',

    texto:
      getInput('contato-banner-text')?.value || '',

    imagemUrl:
      getInput('contato-banner-image')?.value || '',

    configuracao: {
      ...base.configuracao,

      cmsBlockId: 'contato-banner',

      tipoRender: 'hero-interno',

      breadcrumb:
        getInput('contato-banner-breadcrumb')?.value ||
        'Início › Contato',

      overlay:
        getInput('contato-banner-overlay')?.value ||
        '0.92'
    }
  };
}

if (blocoId === 'contato-info') {
  return {
    ...base,

    titulo:
      'Informações de Contato',

    itens:
      typeof coletarContatoInfos === 'function'
        ? coletarContatoInfos()
        : [],

    configuracao: {
      ...base.configuracao,
      tipoRender: 'contato-cards'
    }
  };
}

if (blocoId === 'contato-form') {
  return {
    ...base,

    titulo:
      getInput('contact-form-title')?.value ||
      'Envie uma mensagem',

    texto:
      getInput('contact-form-text')?.value || '',

    link: {
      texto:
        getInput('contact-form-button')?.value ||
        'Enviar mensagem',
      url: ''
    },

    configuracao: {
      ...base.configuracao,
      tipoRender: 'formulario-contato',

      label:
        getInput('contact-form-label')?.value ||
        'Fale conosco',

      campos: {
        nome: {
          label: getInput('contact-form-name-label')?.value || 'Nome',
          placeholder: getInput('contact-form-name-placeholder')?.value || 'Seu nome'
        },
        email: {
          label: getInput('contact-form-email-label')?.value || 'Email',
          placeholder: getInput('contact-form-email-placeholder')?.value || 'Seu email'
        },
        telefone: {
          label: getInput('contact-form-phone-label')?.value || 'Telefone',
          placeholder: getInput('contact-form-phone-placeholder')?.value || '(00) 00000-0000'
        },
        assunto: {
          label: getInput('contact-form-subject-label')?.value || 'Assunto',
          placeholder: getInput('contact-form-subject-placeholder')?.value || 'Assunto'
        },
        mensagem: {
          label: getInput('contact-form-message-label')?.value || 'Mensagem',
          placeholder: getInput('contact-form-message-placeholder')?.value || 'Digite sua mensagem'
        }
      }
    }
  };
}

if (blocoId === 'contato-mapa') {
  return {
    ...base,

    titulo:
      getInput('contact-map-title')?.value ||
      'Localização',

    texto:
      getInput('contact-map-text')?.value || '',

    imagemUrl:
      getInput('contact-map-image')?.value || '',

    link: {
      texto: 'Abrir mapa',
      url:
        getInput('contact-map-link')?.value || '#'
    },

    configuracao: {
      ...base.configuracao,
      cmsBlockId: 'contato-mapa',
      tipoRender: 'mapa'
    }
  };
}

if (blocoId === 'professores-banner') {
  return {
    ...base,

    titulo:
      getInput('professores-banner-titulo')?.value ||
      'Nossos Professores',

    texto:
      getInput('professores-banner-texto')?.value ||
      '',

    imagemUrl:
      getInput('professores-banner-imagem')?.value ||
      '',

    configuracao: {
      ...base.configuracao,
      tipoRender: 'professores-banner',
      cmsBlockId: 'professores-banner',
      cmsTipo: 'Hero da página'
    }
  };
}

if (blocoId === 'professores-lista') {
  return {
    ...base,

    titulo:
      getInput('professores-lista-titulo')?.value ||
      'Corpo Docente',

    texto:
      getInput('professores-lista-texto')?.value ||
      '',

    itens:
      typeof coletarProfessoresLista === 'function'
        ? coletarProfessoresLista()
        : [],

    configuracao: {
      ...base.configuracao,
      tipoRender: 'professores-lista',
      cmsBlockId: 'professores-lista',
      cmsTipo: 'Cards de professores'
    }
  };
}

if (blocoId === 'professores-materiais') {
  return {
    ...base,

    titulo:
      getInput('professores-materiais-titulo')?.value ||
      'Materiais dos Professores',

    texto:
      getInput('professores-materiais-texto')?.value ||
      '',

    itens:
      typeof coletarMateriaisProfessores === 'function'
        ? coletarMateriaisProfessores()
        : [],

    configuracao: {
      ...base.configuracao,
      tipoRender: 'professores-materiais',
      cmsBlockId: 'professores-materiais',
      cmsTipo: 'Arquivos e links'
    }
  };
}

return {
  ...base,
  titulo: getInput('hero-title')?.value || '',
  texto: getInput('hero-text')?.value || '',
  imagemUrl: getInput('image-url')?.value || '',
  link: {
    texto: getInput('button-text')?.value || '',
    url: getInput('button-link')?.value || ''
  }
};
}

function getTipoRenderPorBloco(blocoId = '') {
    if (blocoId.includes('banner')) return 'hero-interno';
  if (blocoId === 'historia-menu') return 'lista';
  if (blocoId.includes('linha')) return 'timeline';
  if (blocoId.includes('equipe')) return 'equipe';
  if (blocoId === 'galeria-filtros') return 'galeria-filtros';
  if (blocoId === 'galeria-grid') return 'galeria-premium';
  if (blocoId === 'galeria-video') return 'video';
  if (blocoId.includes('galeria-grid')) return 'galeria';
  if (blocoId.includes('galeria')) return 'galeria';
  if (blocoId.includes('cronograma')) return 'cronograma';
  if (blocoId.includes('certames')) return 'certames';
  if (blocoId.includes('editais')) return 'downloads';
  if (blocoId.includes('download')) return 'downloads';
  if (blocoId.includes('faq')) return 'faq';
  if (blocoId.includes('contato-info')) return 'contato-cards';
  if (blocoId.includes('contato-mapa')) return 'mapa';
  if (blocoId.includes('mapa')) return 'mapa';
  if (blocoId.includes('form')) return 'formulario';
  if (blocoId.includes('chamada')) return 'cta';
  if (blocoId.includes('video')) return 'video';
  if (blocoId.includes('numeros')) return 'numeros';
  if (blocoId.includes('projetos')) return 'cards';
  if (blocoId.includes('etapas')) return 'cards';
  if (blocoId.includes('lista')) return 'lista';
  if (blocoId.includes('categorias')) return 'categorias';
  if (blocoId.includes('recentes')) return 'recentes';

  return 'padrao';
}

async function publicarPaginaCms(slug) {
  if (blocoAtivoId && (pageBlocksMap[slug] || []).some(b => b.id === blocoAtivoId)) {
    salvarBlocoAtualNoEstado();
  }

  let blocos = pageBlocksMap[slug] || [];

  const mapaBlocos = new Map();

  for (const bloco of blocos) {
    const id =
      bloco.id ||
      bloco.mongo?.configuracao?.cmsBlockId ||
      bloco.mongoId ||
      bloco.mongo?._id;

    const titulo =
      bloco.mongo?.titulo ||
      bloco.nome ||
      '';

    const chave = titulo
      ? `${slug}-${titulo.trim().toLowerCase()}`
      : id;

    if (!chave) continue;

    mapaBlocos.set(chave, bloco);
  }

  blocos = Array.from(mapaBlocos.values());
  pageBlocksMap[slug] = blocos;

  const paginaPayload = {
    titulo: getTituloPaginaCms(slug),
    slug,
    descricao: '',
    tipo: getTipoPaginaCms(slug),
    status: 'publicada',
    ordem: Object.keys(pageBlocksMap).indexOf(slug)
  };

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${localStorage.getItem('site_cms_token')}`
  };

  let paginaId = null;

  const paginasRes = await fetch(`${API_ADMIN}/paginas`, {
    headers
  });

  const paginasData = await paginasRes.json();

  if (paginasData.ok && Array.isArray(paginasData.paginas)) {
    const existente = paginasData.paginas.find(p => p.slug === slug);

    if (existente) {
      paginaId = existente._id;

      await fetch(`${API_ADMIN}/paginas/${paginaId}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(paginaPayload)
      });
    }
  }

  if (!paginaId) {
    const criarRes = await fetch(`${API_ADMIN}/paginas`, {
      method: 'POST',
      headers,
      body: JSON.stringify(paginaPayload)
    });

    const criarData = await criarRes.json();

    if (!criarData.ok || !criarData.pagina) {
      throw new Error(criarData.erro || `Erro ao criar página ${slug}.`);
    }

    paginaId = criarData.pagina._id;
  }

  const blocosExistentesRes =
    await fetch(`${API_ADMIN}/paginas/${paginaId}/blocos`, {
      headers
    });

  const blocosExistentesData =
    await blocosExistentesRes.json();

  const blocosExistentes =
    blocosExistentesData.ok && Array.isArray(blocosExistentesData.blocos)
      ? blocosExistentesData.blocos
      : [];

      // Remove blocos que existem no Mongo,
// mas não existem mais no CMS

const idsAtuais = new Set(
  blocos.map(b => b.id)
);

for (const blocoExistente of blocosExistentes) {

  const cmsId =
    blocoExistente.configuracao?.cmsBlockId;

  if (!idsAtuais.has(cmsId)) {

    await fetch(
      `${API_ADMIN}/blocos/${blocoExistente._id}`,
      {
        method: 'DELETE',
        headers
      }
    );

    console.log(
      '[CMS] Bloco removido do Mongo:',
      cmsId
    );
  }
}

  for (const [index, bloco] of blocos.entries()) {
    const existente = blocosExistentes.find(b =>
      b.configuracao?.cmsBlockId === bloco.id
    );

    const salvo =
  bloco.mongo && bloco.mongo.configuracao?.cmsBlockId === bloco.id
    ? bloco.mongo
    : null;

const conteudo =
  bloco.id === blocoAtivoId
    ? coletarConteudoBlocoCms(bloco.id)
    : null;

const fonte = conteudo || bloco.mongo || salvo || {};

const blocoPayload = {
  tipo: 'html-livre',
  titulo: fonte.titulo || bloco.nome,
  subtitulo: bloco.tipo || fonte.subtitulo || '',
  texto: fonte.texto || '',
  imagemUrl: fonte.imagemUrl || '',
  videoUrl: fonte.videoUrl || '',
  arquivoUrl: fonte.arquivoUrl || '',
  link: fonte.link || {},
  itens: fonte.itens || [],
  configuracao: {
  ...(fonte.configuracao || {}),
  cmsBlockId: bloco.id,
  cmsTipo: bloco.tipo,
  tipoRender: getTipoRenderPorBloco(bloco.id),
  origem: 'cms-builder'
},
  ordem: index,
  ativo: bloco.ativo !== false
};

    if (existente) {
      await fetch(`${API_ADMIN}/blocos/${existente._id}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(blocoPayload)
      });
    } else {
      await fetch(`${API_ADMIN}/paginas/${paginaId}/blocos`, {
        method: 'POST',
        headers,
        body: JSON.stringify(blocoPayload)
      });
    }
  }

  return {
    slug,
    paginaId,
    blocos: blocos.length
  };
}

async function publicarTudoCms() {
  const slugAtual = builderPageSelect?.value || 'home';

  const resultado = await publicarPaginaCms(slugAtual);

  return [resultado];
}

document.getElementById('btn-publicar')?.addEventListener('click', async () => {
  try {
    showToast('Publicando páginas e blocos...');

    const resultados = await publicarTudoCms();

    const totalBlocos = resultados.reduce(
      (acc, item) => acc + item.blocos,
      0
    );

    showToast(
      `Publicação concluída: ${resultados.length} página(s), ${totalBlocos} bloco(s).`
    );

    carregarConfig();

  } catch (err) {
    console.error(err);

    showToast(
      err.message || 'Erro ao publicar no Mongo.'
    );
  }
});

document.getElementById('btn-add-sponsor')?.addEventListener('click', () => {
  showToast('Preencha os dados do patrocinador/link abaixo.');
});

viewDesktop?.addEventListener('click', () => {
  previewFrame?.classList.remove('mobile');
  previewFrame?.classList.add('desktop');
  viewDesktop.classList.add('active');
  viewMobile?.classList.remove('active');
});

viewMobile?.addEventListener('click', () => {
  previewFrame?.classList.remove('desktop');
  previewFrame?.classList.add('mobile');
  viewMobile.classList.add('active');
  viewDesktop?.classList.remove('active');
});

document.getElementById('live-preview')?.addEventListener('load', () => {
  setTimeout(() => {
    atualizarPreview();

    const slug = builderPageSelect?.value;
    if (slug === 'historia') {
      aplicarEstruturaAtualNaPreview();
    }
  }, 300);
});

/* =========================
   IDENTIDADE VISUAL
   ========================= */

function aplicarIdentidadeNaPreview() {
  const doc = getPreviewDoc();
  if (!doc) return;

  const corPrimaria = getInput('ident-cor-primaria')?.value || '#061a35';
  const corSecundaria = getInput('ident-cor-secundaria')?.value || '#b9151b';
  const corDestaque = getInput('ident-cor-destaque')?.value || '#f5b51b';

  doc.documentElement.style.setProperty('--azul', corPrimaria);
  doc.documentElement.style.setProperty('--vermelho', corSecundaria);
  doc.documentElement.style.setProperty('--dourado', corDestaque);

  const logoHeader = getInput('ident-logo-header')?.value?.trim();
  const brasao = getInput('ident-brasao')?.value?.trim();

  const brandSeal = doc.querySelector('.brand-seal');

  if (brandSeal && brasao) {
    brandSeal.innerHTML = `<img src="${brasao}" style="width:100%;height:100%;object-fit:contain;border-radius:50%;">`;
  }

  const brand = doc.querySelector('.brand');

  if (brand && logoHeader) {
    const existing = brand.querySelector('.cms-logo-header');

    if (existing) existing.remove();

    const img = doc.createElement('img');
    img.src = logoHeader;
    img.className = 'cms-logo-header';
    img.style.height = '46px';
    img.style.objectFit = 'contain';

    brand.prepend(img);
  }
}

[
  'ident-logo-header',
  'ident-brasao',
  'ident-logo-footer',
  'ident-favicon',
  'ident-cor-primaria',
  'ident-cor-secundaria',
  'ident-cor-destaque'
].forEach(id => {
  document.getElementById(id)?.addEventListener('input', aplicarIdentidadeNaPreview);
});

let identityUploadTarget = null;

document.querySelectorAll('.identity-upload-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    identityUploadTarget = btn.dataset.target;
    document.getElementById('upload-identidade-file')?.click();
  });
});

document.getElementById('upload-identidade-file')?.addEventListener('change', async (e) => {
  const file = e.target.files?.[0];

  if (!file || !identityUploadTarget) return;

  const formData = new FormData();
  formData.append('arquivo', file);

  try {
    showToast('Enviando imagem institucional...');

    const res = await fetch(`${API_ADMIN}/midias/upload`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${localStorage.getItem('site_cms_token')}`
      },
      body: formData
    });

    const data = await res.json();

    if (!data.ok) {
      showToast(data.erro || 'Erro ao enviar.');
      return;
    }

    const campo = document.getElementById(identityUploadTarget);

    if (campo) {
      campo.value = data.midia.url;
    }

    aplicarIdentidadeNaPreview();

    showToast('Imagem aplicada ao campo selecionado.');
  } catch (err) {
    console.error(err);
    showToast('Falha ao enviar imagem.');
  } finally {
    e.target.value = '';
    identityUploadTarget = null;
  }
});

document.getElementById('btn-save-identidade')?.addEventListener('click', async () => {

  aplicarIdentidadeNaPreview();


  const payload = {
  logoUrl:
    getInput('ident-logo-header')?.value || '',

  brasaoUrl:
    getInput('ident-brasao')?.value || '',

  faviconUrl:
    getInput('ident-favicon')?.value || '',

  corPrimaria:
    getInput('ident-cor-primaria')?.value || '#061a35',

  corSecundaria:
    getInput('ident-cor-secundaria')?.value || '#b9151b',

  corDestaque:
    getInput('ident-cor-destaque')?.value || '#f5b51b',

  layoutGlobal: {
      header: {
        titulo:
          getInput('global-header-title')?.value || '',

        subtitulo:
          getInput('global-header-subtitle')?.value || '',

        descricaoPequena:
          getInput('global-header-small')?.value || '',

        logo:
          getInput('global-header-logo')?.value || '',

        botaoTexto:
          getInput('global-header-button-text')?.value || '',

        botaoLink:
          getInput('global-header-button-link')?.value || ''
      },

      menu: coletarMenuGlobal(),

      footerLinks: coletarLinksFooterGlobal()
    }
  };

  try {

    const res = await fetch(`${API_ADMIN}/config`, {
      method: 'PUT',

      headers: {
        'Content-Type': 'application/json',

        Authorization:
          `Bearer ${localStorage.getItem('site_cms_token')}`
      },

      body: JSON.stringify(payload)
    });

    const data = await res.json();

    if (!data.ok) {
      throw new Error(
        data.erro ||
        'Erro ao salvar identidade visual.'
      );
    }

    showToast(
      'Identidade visual salva com sucesso.'
    );

  } catch (err) {

    console.error(err);

    showToast(
      err.message ||
      'Erro ao salvar identidade visual.'
    );
  }
});
document.getElementById('btn-logout')?.addEventListener('click', () => {

  localStorage.removeItem('site_cms_token');
  localStorage.removeItem('site_cms_usuario');

  window.location.href =
    '/admin-site/login.html';

});

/* =========================
   ADICIONAR NOVO BLOCO
   ========================= */

document.getElementById('btn-new-block')?.addEventListener('click', () => {
  document.getElementById('block-picker')?.classList.toggle('show');
});

document.querySelectorAll('#block-picker button').forEach(btn => {
  btn.addEventListener('click', () => {
    const tipo = btn.dataset.type;
    criarBlocoDinamico(tipo);
    document.getElementById('block-picker')?.classList.remove('show');
  });
});

function criarBlocoDinamico(tipo) {
  const container = document.getElementById('builder-blocks');
  if (!container) return;

  const mapa = {
    botao: ['botao-dinamico', 'Botão / Link', 'CTA personalizado'],
    card: ['card-dinamico', 'Card Informativo', 'Card editável'],
    banner: ['banner-dinamico', 'Banner Personalizado', 'Imagem + texto'],
    video: ['video-dinamico', 'Vídeo', 'YouTube ou arquivo'],
    galeria: ['galeria-dinamica', 'Galeria', 'Imagens'],
    documento: ['documento-dinamico', 'Documento / Edital', 'PDF ou arquivo'],
    formulario: ['formulario-dinamico', 'Formulário', 'Link externo'],
    patrocinador: ['patrocinador-dinamico', 'Patrocinador', 'Imagem clicável']
  };

  const item = mapa[tipo] || mapa.card;
  const id = `${item[0]}-${Date.now()}`;

  const artigo = document.createElement('article');
  artigo.className = 'builder-block active';
  artigo.dataset.blockId = id;
  artigo.dataset.dynamicType = tipo;

  artigo.innerHTML = `
    <div>
      <strong>${item[1]}</strong>
      <small>${item[2]}</small>
    </div>

    <div class="block-actions-mini">
      <button type="button" title="Editar">⚙</button>
      <button type="button" title="Mover para cima">↑</button>
      <button type="button" title="Mover para baixo">↓</button>
      <button type="button" title="Mostrar/Ocultar">👁</button>
      <button type="button" title="Excluir">🗑</button>
    </div>
  `;

  document.querySelectorAll('.builder-block').forEach(b => b.classList.remove('active'));

  container.appendChild(artigo);

  ativarCliqueNosBlocos();
  ligarAcoesDosBlocos();

  carregarDadosDoBloco(id, item[1]);
  criarBlocoNaPreview(tipo, id);

  showToast('Novo bloco criado.');
}

function criarBlocoNaPreview(tipo, id) {
  const doc = getPreviewDoc();
  if (!doc) return;

  garantirEstilosCmsPreview();

  const main = doc.querySelector('main');
  if (!main) return;

  const section = doc.createElement('section');
  section.className = 'cms-dynamic-section cms-spacing-comfortable';
  section.dataset.cmsBlockId = id;

  const wrapper = `
    <div class="cms-dynamic-inner cms-width-container cms-align-center">
      {{content}}
    </div>
  `;

  let content = '';

  if (tipo === 'botao') {
    content = `
      <a href="#" class="cms-dynamic-button" data-dynamic-button>
        Novo botão
      </a>
    `;
  }

  if (tipo === 'card') {
    content = `
      <article class="cms-dynamic-card">
        <h2 data-dynamic-title>Novo card</h2>
        <p data-dynamic-text>Texto do card editável.</p>
        <a href="#" class="cms-dynamic-button" data-dynamic-button>Saiba mais</a>
      </article>
    `;
  }

  if (tipo === 'banner') {
    content = `
      <div class="cms-dynamic-banner">
        <h2 data-dynamic-title>Novo banner</h2>
        <p data-dynamic-text>Texto de apoio do banner.</p>
        <a href="#" class="cms-dynamic-button" data-dynamic-button>Saiba mais</a>
      </div>
    `;
  }

  if (tipo === 'video') {
    content = `
      <div class="cms-dynamic-video">
        <h2 data-dynamic-title>Novo vídeo</h2>
        <p data-dynamic-text>Insira o link do vídeo.</p>
        <div class="cms-dynamic-video-frame">▶</div>
        <a href="#" class="cms-dynamic-button" data-dynamic-button>Assistir</a>
      </div>
    `;
  }

  if (tipo === 'galeria') {
    content = `
      <div class="cms-dynamic-gallery">
        <h2 data-dynamic-title>Nova galeria</h2>
        <p data-dynamic-text>Adicione imagens para este bloco.</p>
        <img data-dynamic-image class="cms-dynamic-img" style="display:none;">
      </div>
    `;
  }

  if (tipo === 'documento') {
    content = `
      <div class="cms-dynamic-doc">
        <h2 data-dynamic-title>Documento / Edital</h2>
        <p data-dynamic-text>Disponibilize arquivos, editais ou comunicados.</p>
        <a href="#" class="cms-dynamic-button" data-dynamic-button>Abrir documento</a>
      </div>
    `;
  }

  if (tipo === 'formulario') {
    content = `
      <div class="cms-dynamic-form">
        <h2 data-dynamic-title>Formulário</h2>
        <p data-dynamic-text>Acesse o formulário pelo botão abaixo.</p>
        <a href="#" class="cms-dynamic-button" data-dynamic-button>Abrir formulário</a>
      </div>
    `;
  }

  if (tipo === 'patrocinador') {
    content = `
      <div class="cms-dynamic-sponsor">
        <h2 data-dynamic-title>Patrocinador</h2>
        <p data-dynamic-text>Banner clicável do parceiro.</p>
        <img data-dynamic-image class="cms-dynamic-img" style="display:none;">
        <a href="#" class="cms-dynamic-button" data-dynamic-button>Acessar parceiro</a>
      </div>
    `;
  }

  section.innerHTML = wrapper.replace('{{content}}', content);

  main.appendChild(section);
}

function montarItemMenuGlobal(item = {}) {
  const texto = item.texto || 'Novo item';
  const link = item.link || '#';

  return `
    <div class="global-menu-item">
      <div class="news-editor-top">
        <strong>Item do menu</strong>

        <div class="quick-item-controls">
          <button type="button" class="btn-global-menu-up">↑</button>
          <button type="button" class="btn-global-menu-down">↓</button>
        </div>
      </div>

      <label>Texto</label>
      <input class="global-menu-text" value="${texto}">

      <label>Link</label>
      <input class="global-menu-link" value="${link}">

      <div class="cms-field-row">
        <label>
          <input type="checkbox" class="global-menu-featured" ${item.destaque ? 'checked' : ''}>
          Botão destaque
        </label>

        <label>
          <input type="checkbox" class="global-menu-blank" ${item.novaAba ? 'checked' : ''}>
          Abrir em nova aba
        </label>
      </div>

      <button class="btn ghost btn-remove-global-menu" type="button">
        Remover item
      </button>
    </div>
  `;
}

function adicionarItemMenuGlobal() {
  const container = document.getElementById('global-menu-items');
  if (!container) return;

  const wrap = document.createElement('div');

  wrap.innerHTML = montarItemMenuGlobal({
    texto: 'Novo item',
    link: '#',
    destaque: false,
    novaAba: false
  });

  container.appendChild(wrap.firstElementChild);

  aplicarLayoutGlobalNaPreview();
  showToast('Item adicionado ao menu superior.');
}

function ligarHeaderBuilderGlobal() {
  document.addEventListener('click', (e) => {
    const btnAdd = e.target.closest('#btn-add-global-menu-item');

    if (btnAdd) {
      adicionarItemMenuGlobal();
      return;
    }

    const btnRemove = e.target.closest('.btn-remove-global-menu');

    if (btnRemove) {
      const item = btnRemove.closest('.global-menu-item');

      if (item) {
        item.remove();
        aplicarLayoutGlobalNaPreview();
        showToast('Item removido do menu superior.');
      }

      return;
    }

    const btnUp = e.target.closest('.btn-global-menu-up');

    if (btnUp) {
      const item = btnUp.closest('.global-menu-item');
      const prev = item?.previousElementSibling;

      if (item && prev && prev.classList.contains('global-menu-item')) {
        item.parentNode.insertBefore(item, prev);
        aplicarLayoutGlobalNaPreview();
        showToast('Item movido para cima.');
      }

      return;
    }

    const btnDown = e.target.closest('.btn-global-menu-down');

    if (btnDown) {
      const item = btnDown.closest('.global-menu-item');
      const next = item?.nextElementSibling;

      if (item && next && next.classList.contains('global-menu-item')) {
        item.parentNode.insertBefore(next, item);
        aplicarLayoutGlobalNaPreview();
        showToast('Item movido para baixo.');
      }
    }
  });
}

function montarItemFooterGlobal(item = {}) {
  return `
    <div class="global-footer-link-item">
      <div class="news-editor-top">
        <strong>Link do rodapé</strong>

        <div class="quick-item-controls">
          <button type="button" class="btn-footer-link-up">↑</button>
          <button type="button" class="btn-footer-link-down">↓</button>
        </div>
      </div>

      <label>Texto</label>
      <input class="global-footer-link-text" value="${item.texto || 'Novo link'}">

      <label>Link</label>
      <input class="global-footer-link-url" value="${item.link || '#'}">

      <button class="btn ghost btn-remove-footer-link" type="button">
        Remover link
      </button>
    </div>
  `;
}

function adicionarLinkFooterGlobal() {
  const container = document.getElementById('global-footer-links');
  if (!container) return;

  const wrap = document.createElement('div');

  wrap.innerHTML = montarItemFooterGlobal({
    texto: 'Novo link',
    link: '#'
  });

  container.appendChild(wrap.firstElementChild);

  aplicarLayoutGlobalNaPreview();
  showToast('Link adicionado ao rodapé.');
}

function ligarFooterBuilderGlobal() {
  document.addEventListener('click', (e) => {
    const btnAdd = e.target.closest('#btn-add-global-footer-link');

    if (btnAdd) {
      adicionarLinkFooterGlobal();
      return;
    }

    const btnRemove = e.target.closest('.btn-remove-footer-link');

    if (btnRemove) {
      const item = btnRemove.closest('.global-footer-link-item');

      if (item) {
        item.remove();
        aplicarLayoutGlobalNaPreview();
        showToast('Link removido do rodapé.');
      }

      return;
    }

    const btnUp = e.target.closest('.btn-footer-link-up');

    if (btnUp) {
      const item = btnUp.closest('.global-footer-link-item');
      const prev = item?.previousElementSibling;

      if (item && prev && prev.classList.contains('global-footer-link-item')) {
        item.parentNode.insertBefore(item, prev);
        aplicarLayoutGlobalNaPreview();
        showToast('Link movido para cima.');
      }

      return;
    }

    const btnDown = e.target.closest('.btn-footer-link-down');

    if (btnDown) {
      const item = btnDown.closest('.global-footer-link-item');
      const next = item?.nextElementSibling;

      if (item && next && next.classList.contains('global-footer-link-item')) {
        item.parentNode.insertBefore(next, item);
        aplicarLayoutGlobalNaPreview();
        showToast('Link movido para baixo.');
      }
    }
  });
}

function setInputValue(id, value) {
  const el = document.getElementById(id);

  if (!el) return;

  el.value = value ?? '';
}

/* =========================
   PATROCINADORES CMS
   ========================= */

async function carregarPatrocinadoresCms() {

  const list =
    document.getElementById('cms-sponsor-list');

  if (!list) return;

  list.innerHTML = `
    <div class="empty-state">
      Carregando patrocinadores...
    </div>
  `;

  try {

    const res = await fetch(
      `${API_ADMIN}/patrocinadores`,
      {
        headers: {
          Authorization:
            `Bearer ${localStorage.getItem('site_cms_token')}`
        }
      }
    );

    const data = await res.json();

    if (!data.ok) {
      throw new Error(
        data.erro ||
        'Erro ao carregar patrocinadores.'
      );
    }

    const patrocinadores =
      Array.isArray(data.patrocinadores)
        ? data.patrocinadores
        : [];

    if (!patrocinadores.length) {

      list.innerHTML = `
        <div class="empty-state">
          Nenhum patrocinador cadastrado.
        </div>
      `;

      return;
    }

    list.innerHTML =
      patrocinadores.map(item => {

        return `
          <article class="cms-news-card">

            <div
              class="cms-news-thumb"
              style="${
                item.imagem
                  ? `
                    background-image:
                    url('${item.imagem}');
                    background-size:cover;
                    background-position:center;
                  `
                  : ''
              }"
            >
              ${
                item.imagem
                  ? ''
                  : '🤝'
              }
            </div>

            <div class="cms-news-info">

              <strong>
                ${item.nome || 'Patrocinador'}
              </strong>

              <small>
                ${
                  item.tipo || 'patrocinador'
                }
              </small>

              <small>
                ${
                  item.status === 'ativo'
                    ? 'Ativo'
                    : 'Inativo'
                }
              </small>

              <div class="cms-news-actions">

                <button
                  type="button"
                  class="btn-edit-sponsor"
                  data-id="${item._id}"
                >
                  Editar
                </button>

                <button
                  type="button"
                  class="btn-delete-sponsor"
                  data-id="${item._id}"
                >
                  Excluir
                </button>

              </div>

            </div>

          </article>
        `;
      }).join('');

  } catch (err) {

    console.error(err);

    list.innerHTML = `
      <div class="empty-state">
        Erro ao carregar patrocinadores.
      </div>
    `;
  }
}

/* =========================
   LIMPAR FORM
   ========================= */

function limparFormularioPatrocinador() {

  setInputValue('cms-sponsor-id', '');
  setInputValue('cms-sponsor-name', '');
  setInputValue('cms-sponsor-description', '');
  setInputValue('cms-sponsor-url', '');
  setInputValue('cms-sponsor-image', '');
  setInputValue('cms-sponsor-order', '0');

  const type =
    document.getElementById('cms-sponsor-type');

  if (type) {
    type.value = 'patrocinador';
  }

  const featured =
    document.getElementById('cms-sponsor-featured');

  if (featured) {
    featured.checked = false;
  }

  const active =
    document.getElementById('cms-sponsor-active');

  if (active) {
    active.checked = true;
  }

  const title =
    document.getElementById('cms-sponsor-form-title');

  if (title) {
    title.textContent = 'Novo patrocinador';
  }
}

/* =========================
   NOVO PATROCINADOR
   ========================= */

document
  .getElementById('btn-add-sponsor')
  ?.addEventListener('click', () => {

    limparFormularioPatrocinador();

    showToast(
      'Novo patrocinador iniciado.'
    );
  });

/* =========================
   LIMPAR
   ========================= */

document
  .getElementById('btn-clear-sponsor-form')
  ?.addEventListener('click', () => {

    limparFormularioPatrocinador();
  });

/* =========================
   SALVAR
   ========================= */

document
  .getElementById('cms-sponsor-form')
  ?.addEventListener('submit', async (e) => {

    e.preventDefault();

    try {

      const id =
        getInput('cms-sponsor-id')?.value || '';

      const payload = {

        nome:
          getInput('cms-sponsor-name')?.value || '',

        descricao:
          getInput('cms-sponsor-description')?.value || '',

        url:
          getInput('cms-sponsor-url')?.value || '',

        imagem:
          getInput('cms-sponsor-image')?.value || '',

        tipo:
          getInput('cms-sponsor-type')?.value || 'patrocinador',

        ordem:
          Number(
            getInput('cms-sponsor-order')?.value || 0
          ),

        destaque:
          !!document.getElementById('cms-sponsor-featured')?.checked,

        status:
          document.getElementById('cms-sponsor-active')?.checked
            ? 'ativo'
            : 'inativo'
      };

      const method =
        id ? 'PUT' : 'POST';

      const endpoint =
        id
          ? `${API_ADMIN}/patrocinadores/${id}`
          : `${API_ADMIN}/patrocinadores`;

      const res = await fetch(
        endpoint,
        {
          method,

          headers: {
            'Content-Type': 'application/json',

            Authorization:
              `Bearer ${localStorage.getItem('site_cms_token')}`
          },

          body: JSON.stringify(payload)
        }
      );

      const data = await res.json();

      if (!data.ok) {
        throw new Error(
          data.erro ||
          'Erro ao salvar patrocinador.'
        );
      }

      showToast(
        'Patrocinador salvo.'
      );

      limparFormularioPatrocinador();

      carregarPatrocinadoresCms();

    } catch (err) {

      console.error(err);

      showToast(
        err.message ||
        'Erro ao salvar patrocinador.'
      );
    }
  });

/* =========================
   EDITAR / EXCLUIR
   ========================= */

document.addEventListener('click', async (e) => {

  const btnEdit =
    e.target.closest('.btn-edit-sponsor');

  if (btnEdit) {

    try {

      const id =
        btnEdit.dataset.id;

      const res = await fetch(
        `${API_ADMIN}/patrocinadores`,
        {
          headers: {
            Authorization:
              `Bearer ${localStorage.getItem('site_cms_token')}`
          }
        }
      );

      const data = await res.json();

      const item =
        data.patrocinadores?.find(
          p => p._id === id
        );

      if (!item) {
        throw new Error(
          'Patrocinador não encontrado.'
        );
      }

      setInputValue(
        'cms-sponsor-id',
        item._id || ''
      );

      setInputValue(
        'cms-sponsor-name',
        item.nome || ''
      );

      setInputValue(
        'cms-sponsor-description',
        item.descricao || ''
      );

      setInputValue(
        'cms-sponsor-url',
        item.url || ''
      );

      setInputValue(
        'cms-sponsor-image',
        item.imagem || ''
      );

      setInputValue(
        'cms-sponsor-order',
        item.ordem || 0
      );

      const type =
        document.getElementById('cms-sponsor-type');

      if (type) {
        type.value =
          item.tipo || 'patrocinador';
      }

      const featured =
        document.getElementById('cms-sponsor-featured');

      if (featured) {
        featured.checked =
          !!item.destaque;
      }

      const active =
        document.getElementById('cms-sponsor-active');

      if (active) {
        active.checked =
          item.status === 'ativo';
      }

      const title =
        document.getElementById('cms-sponsor-form-title');

      if (title) {
        title.textContent =
          'Editar patrocinador';
      }

      showToast(
        'Patrocinador carregado.'
      );

    } catch (err) {

      console.error(err);

      showToast(
        err.message ||
        'Erro ao editar patrocinador.'
      );
    }
  }

  const btnDelete =
    e.target.closest('.btn-delete-sponsor');

  if (btnDelete) {

    const confirmar = confirm(
      'Deseja realmente excluir este patrocinador?'
    );

    if (!confirmar) return;

    try {

      const id =
        btnDelete.dataset.id;

      const res = await fetch(
        `${API_ADMIN}/patrocinadores/${id}`,
        {
          method: 'DELETE',

          headers: {
            Authorization:
              `Bearer ${localStorage.getItem('site_cms_token')}`
          }
        }
      );

      const data = await res.json();

      if (!data.ok) {
        throw new Error(
          data.erro ||
          'Erro ao excluir patrocinador.'
        );
      }

      showToast(
        'Patrocinador excluído.'
      );

      carregarPatrocinadoresCms();

    } catch (err) {

      console.error(err);

      showToast(
        err.message ||
        'Erro ao excluir patrocinador.'
      );
    }
  }
});

/* =========================
   AUTO LOAD
   ========================= */

carregarPatrocinadoresCms();

/* =========================
   INIT
   ========================= */

document.querySelectorAll(
  '#section-identidade input, #section-identidade textarea, #section-identidade select'
).forEach(el => {
  el.addEventListener('input', aplicarLayoutGlobalNaPreview);
  el.addEventListener('change', aplicarLayoutGlobalNaPreview);
});

ligarHeaderBuilderGlobal();
ligarFooterBuilderGlobal();

(async () => {

  if (typeof init === 'function') {
  init();
}

  if (builderPageSelect) {
  builderPageSelect.value = 'home';
}

await renderizarBlocosDaPagina('home');

  carregarConfig();

  carregarMidias();

})();