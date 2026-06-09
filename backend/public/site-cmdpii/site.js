document.addEventListener('DOMContentLoaded', () => {

  /* =========================
     CONTADORES
     ========================= */

  atualizarEstatisticasPublicas();
  registrarVisitaPublica();

  /* =========================
     MENU MOBILE
     ========================= */

  const mobileToggle =
    document.getElementById('mobile-menu-toggle');

  const mobileMenu =
    document.getElementById('mobile-menu');

  const mobileOverlay =
    document.getElementById('mobile-menu-overlay');

  const mobileClose =
    document.getElementById('mobile-menu-close');

  function abrirMenuMobile() {
    mobileMenu?.classList.add('show');
    mobileOverlay?.classList.add('show');

    document.body.style.overflow = 'hidden';
  }

  function fecharMenuMobile() {
    mobileMenu?.classList.remove('show');
    mobileOverlay?.classList.remove('show');

    document.body.style.overflow = '';
  }

  mobileToggle?.addEventListener('click', abrirMenuMobile);

  mobileClose?.addEventListener('click', fecharMenuMobile);

  mobileOverlay?.addEventListener('click', fecharMenuMobile);

  document.querySelectorAll('.mobile-nav a').forEach(link => {
    link.addEventListener('click', fecharMenuMobile);
  });

  /* =========================
     NOTÍCIA INDIVIDUAL / CONFIG / HOME
     ========================= */

  carregarPaginaNoticia();
  carregarListaNoticiasPublicas();
  carregarConfigPublica();
  carregarHomeDoMongo();
  carregarPaginaInternaDoMongo();
});

function formatarDataPublica(data) {
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

function escaparHtml(texto = '') {
  return String(texto)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatarConteudoNoticia(conteudo = '') {
  const textoSeguro = escaparHtml(conteudo);

  return textoSeguro
    .split(/\n{2,}/)
    .map(paragrafo => paragrafo.trim())
    .filter(Boolean)
    .map(paragrafo => `<p>${paragrafo.replace(/\n/g, '<br>')}</p>`)
    .join('');
}

async function carregarPaginaNoticia() {
  const root = document.getElementById('single-news-root');

  if (!root) return;

  const params = new URLSearchParams(window.location.search);
  const slug = params.get('slug');

  if (!slug) {
    root.innerHTML = `
      <section class="single-news-error">
        <h1>Notícia não encontrada</h1>
        <p>Nenhum identificador de notícia foi informado.</p>
        <a href="./noticias.html">Voltar para notícias</a>
      </section>
    `;
    return;
  }

  try {
    const res = await fetch(`/api/site-publico/noticias/${slug}`);
    const data = await res.json();

    if (!data.ok || !data.noticia) {
      throw new Error(data.erro || 'Notícia não encontrada.');
    }

    const noticia = data.noticia;

    const imagensGaleria = Array.isArray(noticia.imagens)
  ? noticia.imagens
      .map(img => ({
        ...img,
        url: img.url || img.imagem || img.src || ''
      }))
      .filter(img => img.url)
  : [];

    const imagensMeioTexto =
      imagensGaleria.filter(img => img.posicao === 'meio-texto');

    const imagensFinal =
      imagensGaleria.filter(img => img.posicao !== 'meio-texto');

    const imagemMeio = imagensMeioTexto[0];

    const conteudoHtml =
      formatarConteudoNoticia(noticia.conteudo || noticia.resumo || '');

    document.title = `${noticia.seoTitulo || noticia.titulo} | Colégio Dom Pedro II - Campus CZS`;

    const descricao =
      noticia.seoDescricao ||
      noticia.resumo ||
      '';

    let metaDescription =
      document.querySelector('meta[name="description"]');

    if (!metaDescription) {
      metaDescription = document.createElement('meta');
      metaDescription.name = 'description';
      document.head.appendChild(metaDescription);
    }

    metaDescription.content = descricao;

    root.innerHTML = `
      <section
        class="single-news-hero"
        style="${
          noticia.imagem
            ? `background-image:
                linear-gradient(90deg, rgba(6,26,53,.94), rgba(185,21,27,.58)),
                url('${escaparHtml(noticia.imagem)}');`
            : ''
        }"
      >
        <div>
          <small>Início › Notícias › ${escaparHtml(noticia.categoria || 'Notícia')}</small>
          <h1>${escaparHtml(noticia.titulo || 'Notícia')}</h1>
          <p>${escaparHtml(noticia.resumo || '')}</p>
        </div>
      </section>

      <article class="single-news-article">
        <div class="single-news-meta">
          <span>${escaparHtml(noticia.categoria || 'Comunicado')}</span>
          <small>${formatarDataPublica(noticia.dataPublicacao || noticia.createdAt)}</small>
          <small>${escaparHtml(noticia.autor || 'Comunicação CMDPII')}</small>
        </div>

        ${
          noticia.imagem
            ? `
              <img
                class="single-news-cover"
                src="${escaparHtml(noticia.imagem)}"
                alt="${escaparHtml(noticia.titulo || 'Notícia')}"
              >
            `
            : ''
        }

        <div class="single-news-content">
          ${conteudoHtml}

          ${
            imagemMeio
              ? `
                <figure class="single-news-inline-image">
                  <img
                    src="${escaparHtml(imagemMeio.url)}"
                    alt="${escaparHtml(imagemMeio.legenda || noticia.titulo || 'Imagem da notícia')}"
                  >

                  ${
                    imagemMeio.legenda
                      ? `<figcaption>${escaparHtml(imagemMeio.legenda)}</figcaption>`
                      : ''
                  }
                </figure>
              `
              : ''
          }

          ${
            imagensFinal.length
              ? `
                <section class="single-news-gallery">
                  <h3>Galeria de Fotos</h3>

                  <div class="single-news-gallery-grid">
                    ${imagensFinal.map((img, index) => `
                      <figure class="single-news-gallery-item">
  <button
    type="button"
    class="single-news-gallery-open"
    data-img="${escaparHtml(img.url)}"
    data-caption="${escaparHtml(img.legenda || noticia.titulo || 'Imagem da notícia')}"
  >
    <img
      src="${escaparHtml(img.url)}"
      alt="${escaparHtml(img.legenda || noticia.titulo || 'Imagem da notícia')}"
    >
  </button>

  ${
    img.legenda
      ? `<figcaption>${escaparHtml(img.legenda)}</figcaption>`
      : ''
  }
</figure>
                    `).join('')}
                  </div>
                </section>
              `
              : ''
          }
        </div>

        <div class="single-news-actions">
          <a href="./noticias.html">← Voltar para notícias</a>
        </div>
      </article>
    `;

  } catch (err) {
    console.error(err);

    root.innerHTML = `
      <section class="single-news-error">
        <h1>Notícia não encontrada</h1>
        <p>Não foi possível carregar esta notícia.</p>
        <a href="./noticias.html">Voltar para notícias</a>
      </section>
    `;
  }
}

function abrirImagemNoticiaModal(src, caption = '') {
  let modal = document.getElementById('news-image-lightbox');

  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'news-image-lightbox';
    modal.className = 'news-image-lightbox';

    modal.innerHTML = `
      <div class="news-image-lightbox-backdrop"></div>

      <div class="news-image-lightbox-content">
        <button
          type="button"
          class="news-image-lightbox-close"
          aria-label="Fechar imagem"
        >
          ×
        </button>

        <img src="" alt="Imagem ampliada da notícia">

        <p></p>
      </div>
    `;

    document.body.appendChild(modal);
  }

  const img = modal.querySelector('img');
  const text = modal.querySelector('p');

  img.src = src;
  img.alt = caption || 'Imagem ampliada da notícia';
  text.textContent = caption || '';

  modal.classList.add('show');
  document.body.classList.add('lightbox-open');
}

async function carregarListaNoticiasPublicas() {
  const root =
    document.getElementById('news-list-root') ||
    document.getElementById('noticias-root') ||
    document.getElementById('cms-public-root') ||
    document.querySelector('.news-list');

  const isNoticias =
    location.pathname.endsWith('/noticias.html');

  if (!isNoticias || !root) return;

  try {
    root.innerHTML = `
      <div class="single-news-loading">
        Carregando notícias...
      </div>
    `;

    let bannerHtml = `
      <section class="page-hero red-hero">
        <small>Início › Notícias</small>
        <h1>Notícias</h1>
        <p>Acompanhe comunicados, eventos e informações oficiais do Colégio Militar Dom Pedro II.</p>
      </section>
    `;

    let listaConfig = {};
    let categoriasConfig = {};
    let recentesConfig = {};

    try {
      const paginaRes = await fetch('/api/site-publico/paginas/noticias');
      const paginaData = await paginaRes.json();

      const blocosPagina = Array.isArray(paginaData.blocos)
        ? paginaData.blocos
        : [];

      const bannerCms = blocosPagina.find(bloco =>
  (
    bloco.id === 'noticias-banner' ||
    bloco.configuracao?.cmsBlockId === 'noticias-banner'
  ) &&
  bloco.ativo !== false
);

if (bannerCms) {
  bannerHtml = renderizarBlocoCms(bannerCms);
}

const listaCms = blocosPagina.find(bloco =>
  (
    bloco.id === 'noticias-lista' ||
    bloco.configuracao?.cmsBlockId === 'noticias-lista'
  ) &&
  bloco.ativo !== false
);

const categoriasCms = blocosPagina.find(bloco =>
  (
    bloco.id === 'noticias-categorias' ||
    bloco.configuracao?.cmsBlockId === 'noticias-categorias'
  ) &&
  bloco.ativo !== false
);

categoriasConfig = {
  titulo: categoriasCms?.titulo || 'Categorias',
  itens: Array.isArray(categoriasCms?.itens)
    ? categoriasCms.itens
    : []
};

const recentesCms = blocosPagina.find(bloco =>
  (
    bloco.id === 'noticias-recentes' ||
    bloco.configuracao?.cmsBlockId === 'noticias-recentes'
  ) &&
  bloco.ativo !== false
);

recentesConfig = {
  titulo: recentesCms?.titulo || 'Recentes',
  itens: Array.isArray(recentesCms?.itens)
    ? recentesCms.itens
    : []
};

console.log('BANNER CMS', bannerCms);
console.log('LISTA CMS', listaCms);
console.log('CATEGORIAS CMS', categoriasCms);
console.log('RECENTES CMS', recentesCms);
console.log('BLOCOS PAGINA', blocosPagina);
listaConfig = listaCms?.configuracao || {};

categoriasConfig = {
  titulo: categoriasCms?.titulo || 'Categorias',
  itens: Array.isArray(categoriasCms?.itens)
    ? categoriasCms.itens
    : []
};

    } catch (err) {
      console.warn('Banner/lista de notícias pelo CMS não carregado:', err);
    }

    const res = await fetch('/api/site-publico/noticias');
    const data = await res.json();

    if (!data.ok || !Array.isArray(data.noticias)) {
      throw new Error(data.erro || 'Erro ao carregar notícias.');
    }

    let noticias = data.noticias;

    if (listaConfig.somentePublicadas !== false) {
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

    const categoriaFiltro =
  String(listaConfig.categoria || '').trim().toLowerCase();

if (
  categoriaFiltro &&
  categoriaFiltro !== 'todas' &&
  categoriaFiltro !== 'todos'
) {
  noticias = noticias.filter(n =>
    String(n.categoria || '').toLowerCase() === categoriaFiltro
  );
}

    if (listaConfig.destaquesPrimeiro !== false) {
      noticias = noticias.sort((a, b) => {
        if (a.destaque === b.destaque) {
          return new Date(b.dataPublicacao || b.createdAt) -
                 new Date(a.dataPublicacao || a.createdAt);
        }

        return a.destaque ? -1 : 1;
      });
    }

    noticias = noticias.slice(0, Number(listaConfig.limite || 6));

    const textoBotaoLista =
      listaConfig.textoBotao || 'Leia mais →';

    if (!noticias.length) {
      root.innerHTML = `
        ${bannerHtml}

        <div class="single-news-loading">
          Nenhuma notícia publicada no momento.
        </div>
      `;
      return;
    }

    root.innerHTML = `
      ${bannerHtml}

      <section class="news-page" data-cms-block-id="noticias-lista">
        <div class="news-list">
          ${noticias.map(noticia => `
            <article class="news-page-card ${noticia.destaque ? 'featured' : ''}">
              <div
                class="news-page-image"
                style="${
                  noticia.imagem
                    ? `background-image:
                        linear-gradient(rgba(6,26,53,.20), rgba(6,26,53,.20)),
                        url('${escaparHtml(noticia.imagem)}');`
                    : ''
                }"
              ></div>

              <div class="news-page-content">
                <span>${escaparHtml(noticia.categoria || 'Comunicado')}</span>

                <small>
                  ${formatarDataPublica(noticia.dataPublicacao || noticia.createdAt)}
                </small>

                <h2>${escaparHtml(noticia.titulo || 'Notícia')}</h2>

                <p>${escaparHtml(noticia.resumo || '')}</p>

                <a href="./pagina-noticia.html?slug=${escaparHtml(noticia.slug || '')}">
                  ${escaparHtml(textoBotaoLista)}
                </a>
              </div>
            </article>
          `).join('')}
        </div>

        <aside class="news-sidebar">
          <div class="sidebar-box" data-cms-block-id="noticias-categorias">
  <h3>${escaparHtml(categoriasConfig.titulo || 'Categorias')}</h3>

  ${
    categoriasConfig.itens.length
      ? categoriasConfig.itens.map(item => `
          <a href="${escaparHtml(item.link || '#')}">
            ${escaparHtml(item.texto || '')}
          </a>
        `).join('')
      : [...new Set(noticias.map(n => n.categoria || 'Comunicado'))]
          .map(cat => `<a href="#">${escaparHtml(cat)}</a>`)
          .join('')
  }
</div>

          <div class="sidebar-box" data-cms-block-id="noticias-recentes">
  <h3>${escaparHtml(recentesConfig.titulo || 'Recentes')}</h3>

  ${
    recentesConfig.itens.length
      ? recentesConfig.itens.map(item => `
          <a
            href="${escaparHtml(item.link || '#')}"
            class="recent-news"
          >
            <div
              style="${
                item.imagem
                  ? `background-image:
                      linear-gradient(rgba(6,26,53,.20), rgba(6,26,53,.20)),
                      url('${escaparHtml(item.imagem)}');`
                  : ''
              }"
            ></div>

            <p>${escaparHtml(item.titulo || '')}</p>
          </a>
        `).join('')
      : noticias.slice(0, 4).map(noticia => `
          <a
            href="./pagina-noticia.html?slug=${escaparHtml(noticia.slug || '')}"
            class="recent-news"
          >
            <div
              style="${
                noticia.imagem
                  ? `background-image:
                      linear-gradient(rgba(6,26,53,.20), rgba(6,26,53,.20)),
                      url('${escaparHtml(noticia.imagem)}');`
                  : ''
              }"
            ></div>

            <p>${escaparHtml(noticia.titulo || 'Notícia')}</p>
          </a>
        `).join('')
  }
</div>

          <div class="sidebar-box support-box">
            <h3>Comunicação</h3>
            <p>As notícias publicadas nesta página são comunicados institucionais oficiais.</p>
            <a href="./contato.html">Entrar em contato</a>
          </div>
        </aside>
      </section>
    `;

  } catch (err) {
    console.error('Erro ao carregar lista de notícias:', err);

    root.innerHTML = `
      <div class="single-news-error">
        <h1>Não foi possível carregar as notícias</h1>
        <p>Verifique se a rota pública de notícias está respondendo corretamente.</p>
      </div>
    `;
  }
}

async function carregarConfigPublica() {
  try {
    const res = await fetch('/api/site-publico/config');
    const data = await res.json();

    if (!data.ok || !data.config) return;

    aplicarConfigNoFooter(data.config);

  } catch (err) {
    console.error('Erro ao carregar configuração pública:', err);
  }
}

function aplicarConfigNoFooter(config) {
  const footer = document.querySelector('.footer');
  const copyright = document.querySelector('.copyright');

  if (!footer) return;

  const layout = config.layoutGlobal || {};
const header = layout.header || {};

const logoHeader = header.logo || config.logoUrl || config.brasaoUrl || '';
const favicon = config.faviconUrl || '';

const brandTitle =
  document.querySelector('.brand strong');

const brandSubtitle =
  document.querySelector('.brand span');

const brandSmall =
  document.querySelector('.brand small');

const brandSeal =
  document.querySelector('.brand-seal');

const axoriinBtn =
  document.querySelector('.btn-axoriin');

const topbar = document.querySelector('.topbar');

if (topbar && !document.getElementById('mobile-menu-toggle')) {
  const btn = document.createElement('button');
  btn.id = 'mobile-menu-toggle';
  btn.className = 'mobile-menu-toggle';
  btn.type = 'button';
  btn.innerHTML = '☰';

  topbar.appendChild(btn);
}

if (brandTitle && header.titulo) {
  brandTitle.textContent = header.titulo;
}

if (brandSubtitle && header.subtitulo) {
  brandSubtitle.textContent = header.subtitulo;
}

if (brandSmall && header.descricaoPequena) {
  brandSmall.textContent = header.descricaoPequena;
}

if (brandSeal && logoHeader) {
  brandSeal.innerHTML = `
    <img
      src="${logoHeader}"
      alt="Logo"
      style="
        width:100%;
        height:100%;
        object-fit:contain;
      "
    >
  `;
}
if (favicon) {
  let fav = document.querySelector('link[rel="icon"]');

  if (!fav) {
    fav = document.createElement('link');
    fav.rel = 'icon';
    document.head.appendChild(fav);
  }

  fav.href = favicon;
}

if (axoriinBtn) {

  if (header.botaoTexto) {
    axoriinBtn.textContent =
      header.botaoTexto;
  }

  if (header.botaoLink) {
    axoriinBtn.href =
      header.botaoLink;
  }
}

  const nome = config.nomeSite || 'Colégio Dom Pedro II';
  const sigla = config.sigla || 'Campus CZS Sul';
  const descricao = config.descricao || '';
  const telefone = config.telefone || '';
  const email = config.email || '';
  const endereco = config.endereco || '';

  const redes = config.redesSociais || {};

  footer.innerHTML = `
    <div>
      <h3>${nome}</h3>
      <p>${sigla}</p>
      <small>${descricao}</small>

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
          <a href="https://wa.me/${String(redes.whatsapp).replace(/\D/g, '')}" target="_blank" rel="noopener noreferrer" class="footer-social-btn" aria-label="WhatsApp">
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
      ${telefone ? `<p>📞 ${telefone}</p>` : ''}
      ${email ? `<p>✉️ ${email}</p>` : ''}
      ${endereco ? `<p>📍 ${endereco}</p>` : ''}
      ${redes.whatsapp ? `<p>💬 WhatsApp: ${redes.whatsapp}</p>` : ''}
    </div>
  `;

  if (copyright) {
    copyright.textContent =
      `© ${new Date().getFullYear()} ${nome}. Todos os direitos reservados.`;
  }
}

function formatarNumeroPublico(valor) {
  return Number(valor || 0).toLocaleString('pt-BR');
}

async function atualizarEstatisticasPublicas() {
  try {
    const res = await fetch('/api/site-publico/config');
    const data = await res.json();

    if (!data.ok || !data.config) return;

    const counters = document.querySelectorAll('.stats strong');

    if (!counters.length) return;

    const visitasTotais =
      data.config.analytics?.visitasTotais || 0;

    counters[0].textContent =
      formatarNumeroPublico(visitasTotais);

  } catch (err) {
    console.error('Erro ao atualizar estatísticas:', err);
  }
}

async function registrarVisitaPublica() {
  try {
    const dentroDoPreview =
      window.self !== window.top;

    if (dentroDoPreview) return;

    const chave = 'site_cmdpii_visita_registrada_em';
    const agora = Date.now();
    const ultima = Number(localStorage.getItem(chave) || 0);

    const intervalo = 30 * 60 * 1000;

    if (ultima && agora - ultima < intervalo) {
      atualizarEstatisticasPublicas();
      return;
    }

    const res = await fetch('/api/site-publico/visita', {
      method: 'POST'
    });

    const data = await res.json();

    if (data.ok) {
      localStorage.setItem(chave, String(agora));

      const counters = document.querySelectorAll('.stats strong');

      if (counters[0]) {
        counters[0].textContent =
          formatarNumeroPublico(data.visitasTotais);
      }
    }

  } catch (err) {
    console.error('Erro ao registrar visita:', err);
  }
}

/* =========================
   HOME 100% DINÂMICA DO MONGO
   ========================= */

async function carregarHomeDoMongo() {
  try {
    const isHome =
      location.pathname.endsWith('/site-cmdpii/') ||
      location.pathname.endsWith('/site-cmdpii/index.html') ||
      location.pathname.endsWith('/index.html');

    if (!isHome) return;

    const res = await fetch('/api/site-publico/paginas/home');
    const data = await res.json();

    if (!data.ok || !Array.isArray(data.blocos)) return;

    const main = document.querySelector('main');
    if (!main) return;

    
    const blocos = data.blocos
  .filter(bloco => bloco.ativo !== false)
  .sort((a, b) => {
    const ordemA = Number(a.ordem ?? 999);
    const ordemB = Number(b.ordem ?? 999);

    return ordemA - ordemB;
  });

    main.innerHTML = '';

    for (const bloco of blocos) {

  const id = bloco.configuracao?.cmsBlockId;

  if (id === 'home-banner') {
    main.insertAdjacentHTML('beforeend', renderHomeBanner(bloco));
    continue;
  }

  if (id === 'home-menu') {
    main.insertAdjacentHTML('beforeend', renderHomeMenu(bloco));
    continue;
  }

  if (id === 'home-patrocinadores') {
    await renderHomePatrocinadores(main, bloco);
    continue;
  }

  if (id === 'home-noticias') {
    await renderHomeNoticias(main, bloco);
    continue;
  }

  if (id === 'home-associacao') {
    main.insertAdjacentHTML('beforeend', renderHomeAssociacao(bloco));
    inicializarHomeAssociacaoModal();
    continue;
  }

  if (id === 'home-estatisticas') {
    main.insertAdjacentHTML('beforeend', renderHomeEstatisticas(bloco));
    atualizarEstatisticasPublicas();
    continue;
  }

  if (id === 'home-documentos') {
    main.insertAdjacentHTML('beforeend', renderHomeDocumentos(bloco));
    inicializarHomeDocumentosModal();
    continue;
  }

  if (id === 'home-galeria') {
    main.insertAdjacentHTML('beforeend', renderHomeGaleria(bloco));
    continue;
  }

  if (id === 'home-video') {
    main.insertAdjacentHTML('beforeend', renderHomeVideo(bloco));
    continue;
  }

  // NOVO
 // NOVO
main.insertAdjacentHTML(
  'beforeend',
  renderHomeBlocoDinamico(bloco)
);
    }

    await montarSidebarParceirosHome(main);

  } catch (err) {
    console.error('Erro ao renderizar Home pelo Mongo:', err);
  }
}

async function carregarPaginaInternaDoMongo() {
  try {
    const path = location.pathname.split('/').pop();
    const slug = path.replace('.html', '');

    const ignorar = [
      '',
      'index',
      'pagina-noticia',
      'noticias'
    ];

    if (ignorar.includes(slug)) {
      return;
    }

    const res = await fetch(`/api/site-publico/paginas/${slug}`);
    const data = await res.json();

    if (!data.ok || !Array.isArray(data.blocos)) {
      return;
    }

    const main = document.querySelector('main');
    if (!main) return;

    const blocos = data.blocos
      .filter(b => b.ativo !== false)
      .sort((a, b) => Number(a.ordem || 0) - Number(b.ordem || 0));

    main.innerHTML = '';

    if (slug === 'historia') {
      const getId = b => b.configuracao?.cmsBlockId || '';

      const banner = blocos.find(b => getId(b) === 'historia-banner');
      const texto = blocos.find(b => getId(b) === 'historia-texto');
      const menu = blocos.find(b => getId(b) === 'historia-menu');
      const timeline = blocos.find(b => getId(b) === 'historia-linha');
      const video = blocos.find(b => getId(b) === 'historia-video');

      if (banner) {
        main.insertAdjacentHTML('beforeend', renderizarBlocoCms(banner));
      }

      main.insertAdjacentHTML('beforeend', `
        <section class="history-layout section">
          <aside class="history-sidebar">
            ${
              Array.isArray(menu?.itens) && menu.itens.length
                ? `
                  <nav class="history-side-menu">
                    ${menu.itens.map(item => `
                      <a
                        href="${escaparHtml(item.link || '#')}"
                        class="${item.ativo ? 'active' : ''}"
                      >
                        ${escaparHtml(item.texto || '')}
                      </a>
                    `).join('')}
                  </nav>
                `
                : ''
            }
          </aside>

          <div class="history-main">
            ${texto ? renderizarBlocoCms(texto) : ''}
          </div>
        </section>
      `);

      if (timeline) {
        main.insertAdjacentHTML('beforeend', renderizarBlocoCms(timeline));
      }

      if (video) {
        main.insertAdjacentHTML('beforeend', renderizarBlocoCms(video));
      }

      return;
    }

if (slug === 'contato') {
  const getId = b => b.configuracao?.cmsBlockId || b.id || '';

  const banner = blocos.find(b => getId(b) === 'contato-banner');
  const info = blocos.find(b => getId(b) === 'contato-info');
  const form = blocos.find(b => getId(b) === 'contato-form');

  const demais = blocos.filter(b => {
    const id = getId(b);

    return (
      id !== 'contato-banner' &&
      id !== 'contato-info' &&
      id !== 'contato-form'
    );
  });

  if (banner) {
    main.insertAdjacentHTML('beforeend', renderizarBlocoCms(banner));
  }

  if (info) {
    const infoComFormulario = {
      ...info,
      configuracao: {
        ...info.configuracao,
        formulario: {
          label: form?.configuracao?.label || 'Contato institucional',
          titulo: form?.titulo || info.titulo || 'Informações de Contato',
          texto: form?.texto || info.texto || '',
          botao: form?.link?.texto || 'Enviar mensagem',
          campos: form?.configuracao?.campos || {}
        }
      }
    };

    main.insertAdjacentHTML('beforeend', renderizarBlocoCms(infoComFormulario));
  }

  for (const bloco of demais) {
    main.insertAdjacentHTML('beforeend', renderizarBlocoCms(bloco));
  }

  return;
}

if (slug === 'professores') {
  const getId = b => b.configuracao?.cmsBlockId || b.id || '';

  const banner = blocos.find(b => getId(b) === 'professores-banner');
  const lista = blocos.find(b => getId(b) === 'professores-lista');
  const materiais = blocos.find(b => getId(b) === 'professores-materiais');

  if (banner) {
    main.insertAdjacentHTML('beforeend', renderizarBlocoCms({
      ...banner,
      configuracao: {
        ...banner.configuracao,
        tipoRender: 'hero-interno',
        breadcrumb: 'Início › Professores',
        overlay: banner.configuracao?.overlay || '0.92'
      }
    }));
  }

  if (lista) {

  const professores =
    Array.isArray(lista.itens)
      ? lista.itens
      : [];

  main.insertAdjacentHTML('beforeend', `
    <section class="section professores-section" data-cms-block-id="professores-lista">

      <div class="section-head">
        <h2>${escaparHtml(lista.titulo || 'Corpo Docente')}</h2>
      </div>

      ${
        lista.texto
          ? `<div class="page-intro">${formatarTextoCms(lista.texto)}</div>`
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
                        ? `<img src="${escaparHtml(prof.foto)}" alt="${escaparHtml(prof.nome || 'Professor')}">`
                        : '<span>👨‍🏫</span>'
                    }
                  </div>

                  <div class="professor-info">

                    ${
                      prof.turno
                        ? `<span>${escaparHtml(prof.turno)}</span>`
                        : ''
                    }

                    <h3>${escaparHtml(prof.nome || 'Professor')}</h3>

                    ${
                      prof.disciplina
                        ? `<strong>${escaparHtml(prof.disciplina)}</strong>`
                        : ''
                    }

                    ${
                      prof.formacao
                        ? `<p>${formatarTextoCms(prof.formacao)}</p>`
                        : ''
                    }

                    ${
                      prof.descricao
                        ? `<small>${formatarTextoCms(prof.descricao)}</small>`
                        : ''
                    }

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

    </section>
  `);
}

  if (materiais) {
  main.insertAdjacentHTML(
    'beforeend',
    renderizarBlocoCms({
      ...materiais,
      configuracao: {
        ...(materiais.configuracao || {}),
        cmsBlockId: 'professores-materiais',
        tipoRender: 'professores-materiais'
      }
    })
  );
}

  return;
}

    for (const bloco of blocos) {
      main.insertAdjacentHTML('beforeend', renderizarBlocoCms(bloco));
    }

    inicializarModalGaleriaEventos();

  } catch (err) {
    console.error('Erro ao carregar página dinâmica:', err);
  }
}

function renderHomeBlocoDinamico(bloco = {}) {
  const overlay = Number(bloco.configuracao?.overlay || 0.78);

  return `
    <section
      class="home-dynamic-banner"
      data-cms-block-id="${escaparHtml(bloco.configuracao?.cmsBlockId || '')}"
      style="
        ${
          bloco.imagemUrl
            ? `
              background:
                linear-gradient(
                  90deg,
                  rgba(6,26,53,${overlay}),
                  rgba(6,26,53,.68)
                ),
                url('${escaparHtml(bloco.imagemUrl)}');
              background-size: cover;
              background-position: center;
            `
            : ''
        }
      "
    >
      <div class="home-dynamic-banner-content">
        <h2>${escaparHtml(bloco.titulo || '')}</h2>
        <p>${escaparHtml(bloco.texto || '')}</p>

        ${
          bloco.link?.url
            ? `<a class="btn primary" href="${escaparHtml(bloco.link.url)}">${escaparHtml(bloco.link.texto || 'Acessar')}</a>`
            : ''
        }
      </div>
    </section>
  `;
}

function renderizarBlocoCms(bloco = {}) {
  const cmsBlockId = bloco.configuracao?.cmsBlockId || '';

  const tipoRender =
    cmsBlockId === 'alunos-destaque'
      ? 'destaque'
      : bloco.configuracao?.tipoRender ||
        inferirTipoRenderBlocoCms(bloco);

  if (tipoRender === 'hero-interno') {
    return renderBlocoHeroInterno(bloco);
  }

  if (tipoRender === 'timeline') {
    return renderBlocoTimeline(bloco);
  }

  if (tipoRender === 'equipe') {
    return renderBlocoEquipe(bloco);
  }

  if (tipoRender === 'galeria-filtros') {
  return renderBlocoGaleriaFiltros(bloco);
}

if (tipoRender === 'galeria-premium') {
  return renderBlocoGaleriaPremium(bloco);
}

  if (tipoRender === 'galeria') {
    return renderBlocoGaleriaInterna(bloco);
  }

  if (tipoRender === 'certames') {
  return renderBlocoCertames(bloco);
}

if (tipoRender === 'downloads-expansivel') {
  return renderBlocoDownloadsExpansivel(bloco);
}

  if (tipoRender === 'downloads') {
    return renderBlocoDownloads(bloco);
  }

  if (tipoRender === 'cronograma') {
    return renderBlocoCronograma(bloco);
  }

  if (tipoRender === 'contato-cards') {
    return renderBlocoContatoCards(bloco);
  }

  if (tipoRender === 'mapa') {
    return renderBlocoMapa(bloco);
  }

  if (tipoRender === 'formulario') {
    return renderBlocoFormularioContato(bloco);
  }

  if (tipoRender === 'cta') {
    return renderBlocoCta(bloco);
  }

  if (tipoRender === 'video') {
    return renderBlocoVideoInterno(bloco);
  }

  if (tipoRender === 'numeros') {
    return renderBlocoNumeros(bloco);
  }

  if (tipoRender === 'cards') {
    return renderBlocoCards(bloco);
  }

if (tipoRender === 'destaque') {
  return renderBlocoDestaqueInstitucional(bloco);
}

if (tipoRender === 'professores-materiais') {
  return renderBlocoProfessoresMateriais(bloco);
}

    return renderBlocoPadraoCms(bloco);
}

function inferirTipoRenderBlocoCms(bloco = {}) {
  const id = bloco.configuracao?.cmsBlockId || '';

  if (id.includes('banner')) return 'hero-interno';
  if (id === 'historia-menu') return 'lista';
  if (id.includes('linha')) return 'timeline';
  if (id.includes('equipe')) return 'equipe';
  if (id === 'galeria-filtros') return 'galeria-filtros';
  if (id === 'galeria-grid') return 'galeria-premium';
  if (id === 'galeria-video') return 'video';
  if (id.includes('galeria')) return 'galeria';
  if (id.includes('certames')) return 'certames';
  if (id.includes('editais')) return 'downloads';
  if (id.includes('cronograma')) return 'cronograma';
  if (id.includes('contato-info')) return 'contato-cards';
  if (id.includes('contato-mapa')) return 'mapa';
  if (id.includes('form')) return 'formulario';
  if (id.includes('chamada')) return 'cta';
  if (id.includes('video')) return 'video';
  if (id.includes('numeros')) return 'numeros';
  if (id.includes('projetos')) return 'cards';
  if (id.includes('etapas')) return 'cards';
  
  return 'padrao';
}

function renderBlocoHeroInterno(bloco = {}) {
  const cmsBlockId =
    bloco.configuracao?.cmsBlockId || '';

  if (cmsBlockId === 'processo-banner') {
    return renderBlocoProcessoBanner(bloco);
  }

  const overlay =
    Number(bloco.configuracao?.overlay || 0.94);

  const overlaySeguro =
    Number.isFinite(overlay) ? overlay : 0.94;

  return `
    <section
      class="hero internal-page-hero cms-render-hero"
      data-cms-block-id="${escaparHtml(bloco.configuracao?.cmsBlockId || '')}"
      style="
        ${
          bloco.imagemUrl
            ? `
              background:
              linear-gradient(
                90deg,
                rgba(6,26,53,${overlaySeguro}),
                rgba(6,26,53,.72)
              ),
              url('${escaparHtml(bloco.imagemUrl)}');
              background-size:cover;
              background-position:center;
            `
            : ''
        }
      "
    >
      <div class="hero-content">
        <span class="tag">
          ${escaparHtml(bloco.configuracao?.breadcrumb || bloco.subtitulo || 'Página institucional')}
        </span>

        <h1>${escaparHtml(bloco.titulo || '')}</h1>

        <p>${escaparHtml(bloco.texto || '')}</p>

        ${
  bloco.link?.url || Array.isArray(bloco.itens)
    ? `
      <div class="hero-actions">
        ${
          bloco.link?.url
            ? `
              <a
                class="btn primary"
                href="${escaparHtml(bloco.link.url)}"
              >
                ${escaparHtml(bloco.link.texto || 'Saiba mais')}
              </a>
            `
            : ''
        }

        ${
          Array.isArray(bloco.itens)
            ? bloco.itens
                .filter(item => item.tipo === 'botao-secundario' && item.link)
                .map(item => `
                  <a
                    class="btn secondary"
                    href="${escaparHtml(item.link)}"
                  >
                    ${escaparHtml(item.texto || 'Acessar')}
                  </a>
                `).join('')
            : ''
        }
      </div>
    `
    : ''
}
      </div>
    </section>
  `;
}

function renderBlocoProcessoBanner(bloco = {}) {
  const overlay =
    Number(bloco.configuracao?.overlay || 0.90);

  const overlaySeguro =
    Number.isFinite(overlay) ? overlay : 0.90;

  const badges = Array.isArray(bloco.itens)
    ? bloco.itens.filter(item => !item.tipo)
    : [];

  const botaoSecundario = Array.isArray(bloco.itens)
    ? bloco.itens.find(item => item.tipo === 'botao-secundario')
    : null;

  return `
    <section
      class="selection-hero cms-processo-banner"
      data-cms-block-id="${escaparHtml(bloco.configuracao?.cmsBlockId || '')}"
      style="
        ${
          bloco.imagemUrl
            ? `
              background:
                linear-gradient(
                  90deg,
                  rgba(6,26,53,${overlaySeguro}),
                  rgba(6,26,53,.78),
                  rgba(185,21,27,.30)
                ),
                url('${escaparHtml(bloco.imagemUrl)}');
              background-size: cover;
              background-position: center;
            `
            : ''
        }
      "
    >
      <div class="selection-content">
        ${
          badges.length
            ? `
              <div class="selection-badges">
                ${badges.map((item, index) => `
                  <span class="mini-badge ${index === 0 ? 'gold' : ''}">
                    ${escaparHtml(item.texto || '')}
                  </span>
                `).join('')}
              </div>
            `
            : ''
        }

        <span class="selection-tag">
          ${escaparHtml(bloco.subtitulo || bloco.configuracao?.breadcrumb || 'Processo Seletivo')}
        </span>

        <h1>${escaparHtml(bloco.titulo || '')}</h1>

        ${
          bloco.texto
            ? `<p>${escaparHtml(bloco.texto)}</p>`
            : ''
        }

        <div class="selection-buttons">
          ${
            bloco.link?.url
              ? `
                <a
                  class="btn primary"
                  href="${escaparHtml(bloco.link.url)}"
                >
                  ${escaparHtml(bloco.link.texto || 'Baixar edital')}
                </a>
              `
              : ''
          }

          ${
            botaoSecundario?.link
              ? `
                <a
                  class="btn secondary"
                  href="${escaparHtml(botaoSecundario.link)}"
                >
                  ${escaparHtml(botaoSecundario.texto || 'Inscrição online')}
                </a>
              `
              : ''
          }
        </div>
      </div>
    </section>
  `;
}

function renderBlocoPadraoCms(bloco = {}) {
  return `
    <section
      class="section cms-internal-section cms-render-default"
      data-cms-block-id="${escaparHtml(bloco.configuracao?.cmsBlockId || '')}"
    >
      ${
        bloco.titulo
          ? `
            <div class="section-head">
              <h2>${escaparHtml(bloco.titulo)}</h2>
            </div>
          `
          : ''
      }

      ${
        bloco.texto
          ? `
            <div class="cms-page-text">
              ${formatarTextoCms(bloco.texto)}
            </div>
          `
          : ''
      }

      ${
        bloco.imagemUrl
          ? `
            <img
              class="cms-page-image"
              src="${escaparHtml(bloco.imagemUrl)}"
              alt="${escaparHtml(bloco.titulo || 'Imagem')}"
            >
          `
          : ''
      }

      ${renderLinkBlocoCms(bloco)}
    </section>
  `;
}

function renderBlocoTimeline(bloco = {}) {
  const itens = Array.isArray(bloco.itens) ? bloco.itens : [];

  return `
    <section
      class="section"
      data-cms-block-id="${escaparHtml(bloco.configuracao?.cmsBlockId || '')}"
    >
      <div class="section-head">
        <h2>${escaparHtml(bloco.titulo || 'Linha do Tempo')}</h2>
      </div>

      ${
        bloco.texto
          ? `<div class="page-intro">${formatarTextoCms(bloco.texto)}</div>`
          : ''
      }

      <div class="timeline">
  ${
    itens.length
      ? itens.map((item, index) => `
        <article class="timeline-card ${item.destaque ? 'destaque' : ''}">
          <strong>${escaparHtml(item.ano || item.data || item.titulo || '')}</strong>
          <p>${escaparHtml(item.texto || item.descricao || item.titulo || '')}</p>
        </article>
      `).join('')
      : `
        <article class="timeline-card">
          <strong>2026</strong>
          <p>Adicione marcos históricos pelo CMS para compor a linha do tempo institucional.</p>
        </article>

        <article class="timeline-card destaque">
          <strong>CMS</strong>
          <p>Este bloco já está pronto para receber dados dinâmicos publicados pelo Mongo.</p>
        </article>
      `
  }
</div>
    </section>
  `;
}

function renderBlocoEquipe(bloco = {}) {
  const itens = Array.isArray(bloco.itens) ? bloco.itens : [];

  return `
    <section
      class="section"
      data-cms-block-id="${escaparHtml(bloco.configuracao?.cmsBlockId || '')}"
    >
      <div class="section-head">
        <h2>${escaparHtml(bloco.titulo || 'Equipe Gestora')}</h2>
      </div>

      ${
        bloco.texto
          ? `<div class="page-intro">${formatarTextoCms(bloco.texto)}</div>`
          : ''
      }

      <div class="direction-grid">
        ${
          itens.length
            ? itens.map((item, index) => `
              <article class="direction-card ${index === 0 ? 'principal' : ''}">
                ${
                  item.imagem || item.foto
                    ? `
                      <div class="person-photo">
                        <img
                          src="${escaparHtml(item.imagem || item.foto)}"
                          alt="${escaparHtml(item.nome || item.titulo || 'Membro da equipe')}"
                          style="width:100%;height:100%;object-fit:cover;border-radius:14px;"
                        >
                      </div>
                    `
                    : `<div class="person-photo">Foto</div>`
                }

                <div>
                  <span>${escaparHtml(item.cargo || item.funcao || 'Equipe Gestora')}</span>
                  <h3>${escaparHtml(item.nome || item.titulo || 'Nome do servidor')}</h3>
                  <p>${escaparHtml(item.texto || item.descricao || '')}</p>
                </div>
              </article>
            `).join('')
            : `
              <article class="direction-card principal">
                <div class="person-photo">Foto</div>
                <div>
                  <span>Direção</span>
                  <h3>Equipe Gestora</h3>
                  <p>Adicione membros da equipe pelo CMS para exibir foto, cargo e descrição institucional.</p>
                </div>
              </article>
            `
        }
      </div>
    </section>
  `;
}

function renderBlocoGaleriaFiltros(bloco = {}) {
  const itens = Array.isArray(bloco.itens) ? bloco.itens : [];

  const filtros = itens.length
    ? itens
    : [
        { texto: 'Todos', ativo: true },
        { texto: 'Eventos' },
        { texto: 'Acadêmico' },
        { texto: 'Militar' }
      ];

  return `
    <section
      class="gallery-filter cms-gallery-filter"
      data-cms-block-id="${escaparHtml(bloco.configuracao?.cmsBlockId || '')}"
    >
      ${filtros.map((item, index) => `
        <button
          type="button"
          class="${item.ativo || index === 0 ? 'active' : ''}"
          data-gallery-filter="${escaparHtml(item.texto || 'Todos')}"
        >
          ${escaparHtml(item.texto || 'Filtro')}
        </button>
      `).join('')}
    </section>
  `;
}

function renderBlocoGaleriaPremium(bloco = {}) {
  const itens = Array.isArray(bloco.itens) ? bloco.itens : [];

  const imagens = itens.length
    ? itens
    : [
        {
          destaque: true,
          imagem: '',
          categoria: 'Destaque',
          titulo: 'Adicione imagens pelo CMS',
          imagens: []
        }
      ];

  return `
    <section
      class="gallery-page cms-gallery-premium"
      data-cms-block-id="${escaparHtml(bloco.configuracao?.cmsBlockId || '')}"
    >
      ${imagens.map((item, index) => {
        const fotosDoEvento = Array.isArray(item.imagens) && item.imagens.length
          ? item.imagens
          : item.imagem
            ? [{ url: item.imagem, legenda: item.titulo || '' }]
            : [];

        return `
          <article
            class="gallery-item ${item.destaque || index === 0 ? 'large' : ''}"
            data-gallery-category="${escaparHtml(item.categoria || 'Galeria')}"
            data-gallery-title="${escaparHtml(item.titulo || '')}"
            data-gallery-image="${escaparHtml(item.imagem || '')}"
            data-gallery-photos="${escaparHtml(JSON.stringify(fotosDoEvento))}"
            role="button"
            tabindex="0"
            style="${
              item.imagem
                ? `
                  background-image:
                    linear-gradient(
                      rgba(6,26,53,.18),
                      rgba(6,26,53,.18)
                    ),
                    url('${escaparHtml(item.imagem)}');
                `
                : ''
            }"
          >
            <div class="gallery-overlay">
              <span>${escaparHtml(item.categoria || 'Galeria')}</span>
              <h3>${escaparHtml(item.titulo || 'Imagem da Galeria')}</h3>
            </div>
          </article>
        `;
      }).join('')}
    </section>
  `;
}

function renderBlocoProfessoresMateriais(bloco = {}) {
  const materiais = Array.isArray(bloco.itens) ? bloco.itens : [];

  return `
    <section class="section" data-cms-block-id="professores-materiais">
      <div class="section-head">
        <h2>${escaparHtml(bloco.titulo || 'Materiais dos Professores')}</h2>
      </div>

      ${
        bloco.texto
          ? `<div class="page-intro"><p>${escaparHtml(bloco.texto)}</p></div>`
          : ''
      }

      ${
        materiais.length
          ? `
            <div class="materials-grid">
              ${materiais.map(item => `
                <article class="material-card">
                  <div>
                    <span>📄</span>
                    <h3>${escaparHtml(item.titulo || 'Material')}</h3>
                    ${item.professor ? `<strong>${escaparHtml(item.professor)}</strong>` : ''}
                    ${item.texto ? `<p>${escaparHtml(item.texto)}</p>` : ''}
                  </div>

                  ${
                    item.url
                      ? `<a class="btn primary" href="${escaparHtml(item.url)}" target="_blank" rel="noopener noreferrer">Acessar material</a>`
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
    </section>
  `;
}

function inicializarModalGaleriaEventos() {
  if (document.body.dataset.galleryModalReady === 'true') return;

  document.body.dataset.galleryModalReady = 'true';

  document.addEventListener('click', event => {
    const card = event.target.closest('.gallery-item');

    if (!card) return;

    abrirModalGaleriaEvento(card);
  });

  document.addEventListener('keydown', event => {
    if (event.key !== 'Enter') return;

    const card = event.target.closest('.gallery-item');

    if (!card) return;

    abrirModalGaleriaEvento(card);
  });
}

function abrirModalGaleriaEvento(card) {
  const titulo = card.dataset.galleryTitle || 'Galeria';
  const categoria = card.dataset.galleryCategory || 'Galeria';

  let fotos = [];

  try {
    fotos = JSON.parse(card.dataset.galleryPhotos || '[]');
  } catch {
    fotos = [];
  }

  if (!Array.isArray(fotos) || !fotos.length) {
    const imagem = card.dataset.galleryImage;

    if (imagem) {
      fotos = [{ url: imagem, legenda: titulo }];
    }
  }

  if (!fotos.length) return;

  const modalAntigo = document.querySelector('.gallery-event-modal');
  modalAntigo?.remove();

  const modal = document.createElement('div');
  modal.className = 'gallery-event-modal';
  modal.innerHTML = `
    <div class="gallery-event-backdrop"></div>

    <div class="gallery-event-dialog" role="dialog" aria-modal="true">
      <button
        type="button"
        class="gallery-event-close"
        aria-label="Fechar galeria"
      >
        ×
      </button>

      <div class="gallery-event-header">
        <span>${escaparHtml(categoria)}</span>
        <h2>${escaparHtml(titulo)}</h2>
      </div>

      <div class="gallery-event-slider" data-current="0">
        <div class="gallery-event-track">
          ${fotos.map(foto => `
            <figure class="gallery-event-slide">
              <img
                src="${escaparHtml(foto.url || foto.imagem || '')}"
                alt="${escaparHtml(foto.legenda || titulo)}"
              >

              ${
                foto.legenda
                  ? `<figcaption>${escaparHtml(foto.legenda)}</figcaption>`
                  : ''
              }
            </figure>
          `).join('')}
        </div>

        ${
          fotos.length > 1
            ? `
              <button type="button" class="gallery-event-arrow prev">‹</button>
              <button type="button" class="gallery-event-arrow next">›</button>

              <div class="gallery-event-dots">
                ${fotos.map((_, index) => `
                  <button
                    type="button"
                    class="${index === 0 ? 'active' : ''}"
                    data-slide="${index}"
                    aria-label="Ir para foto ${index + 1}"
                  ></button>
                `).join('')}
              </div>
            `
            : ''
        }
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  document.body.classList.add('gallery-modal-open');

  inicializarSliderModalGaleria(modal);
}

function inicializarSliderModalGaleria(modal) {
  const track = modal.querySelector('.gallery-event-track');
  const slides = Array.from(modal.querySelectorAll('.gallery-event-slide'));
  const dots = Array.from(modal.querySelectorAll('.gallery-event-dots button'));
  const prev = modal.querySelector('.gallery-event-arrow.prev');
  const next = modal.querySelector('.gallery-event-arrow.next');
  const close = modal.querySelector('.gallery-event-close');
  const backdrop = modal.querySelector('.gallery-event-backdrop');

  if (!track || !slides.length) return;

  let current = 0;
  let timer = null;

  function fechar() {
    clearInterval(timer);
    modal.remove();
    document.body.classList.remove('gallery-modal-open');
  }

  function irPara(index) {
    current = (index + slides.length) % slides.length;

    track.style.transform = `translateX(-${current * 100}%)`;

    dots.forEach((dot, i) => {
      dot.classList.toggle('active', i === current);
    });
  }

  function proxima() {
    irPara(current + 1);
  }

  function iniciarAutoPlay() {
    clearInterval(timer);

    if (slides.length > 1) {
      timer = setInterval(proxima, 5000);
    }
  }

  prev?.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();

    irPara(current - 1);
    iniciarAutoPlay();
  });

  next?.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();

    irPara(current + 1);
    iniciarAutoPlay();
  });

  dots.forEach(dot => {
    dot.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();

      irPara(Number(dot.dataset.slide || 0));
      iniciarAutoPlay();
    });
  });

  close?.addEventListener('click', fechar);
  backdrop?.addEventListener('click', fechar);

  document.addEventListener('keydown', function escListener(event) {
    if (event.key === 'Escape') {
      fechar();
      document.removeEventListener('keydown', escListener);
    }
  });

  irPara(0);
  iniciarAutoPlay();
}

function renderBlocoGaleriaInterna(bloco = {}) {
  const itens = Array.isArray(bloco.itens) ? bloco.itens : [];

  return `
    <section
      class="section"
      data-cms-block-id="${escaparHtml(bloco.configuracao?.cmsBlockId || '')}"
    >

      <div class="section-head">
        <h2>${escaparHtml(bloco.titulo || 'Galeria')}</h2>
      </div>

      ${
        bloco.texto
          ? `<div class="page-intro">${formatarTextoCms(bloco.texto)}</div>`
          : ''
      }

      <div class="gallery-page">

        ${
          itens.length
            ? itens.map((item, index) => `
              <article
                class="gallery-item ${index === 0 ? 'large' : ''}"
                style="
                  background-image:
                    linear-gradient(
                      rgba(6,26,53,.18),
                      rgba(6,26,53,.18)
                    ),
                    url('${escaparHtml(item.imagem || item.url || '')}');
                "
              >

                <div class="gallery-overlay">

                  ${
                    item.categoria
                      ? `
                        <span>
                          ${escaparHtml(item.categoria)}
                        </span>
                      `
                      : ''
                  }

                  <h3>
                    ${escaparHtml(item.titulo || item.legenda || 'Galeria')}
                  </h3>

                </div>

              </article>
            `).join('')

            : `

              <article class="gallery-item large">
                <div class="gallery-overlay">
                  <span>Galeria</span>
                  <h3>Adicione imagens pelo CMS</h3>
                </div>
              </article>

              <article class="gallery-item">
                <div class="gallery-overlay">
                  <span>Institucional</span>
                  <h3>Eventos</h3>
                </div>
              </article>

              <article class="gallery-item">
                <div class="gallery-overlay">
                  <span>Alunos</span>
                  <h3>Projetos</h3>
                </div>
              </article>

            `
        }

      </div>

    </section>
  `;
}

function renderBlocoDownloads(bloco = {}) {
  const itens = Array.isArray(bloco.itens) ? bloco.itens : [];

  return `
    <section
      class="section"
      data-cms-block-id="${escaparHtml(bloco.configuracao?.cmsBlockId || '')}"
    >
      <div class="section-head">
        <h2>${escaparHtml(bloco.titulo || 'Editais e Documentos')}</h2>
      </div>

      <div class="notice-grid">
        ${
          itens.length
            ? itens.map(item => `
              <a
                class="notice-card"
                href="${escaparHtml(item.arquivo || item.url || item.link || '#')}"
                target="_blank"
                rel="noopener noreferrer"
              >
                <span>${escaparHtml(item.icon || item.icone || '📄')}</span>
                <strong>${escaparHtml(item.titulo || item.nome || 'Documento')}</strong>
                <small>${escaparHtml(item.descricao || item.texto || 'Acessar documento')}</small>
              </a>
            `).join('')
            : `
              <article class="notice-card">
                <span>📄</span>
                <strong>Editais</strong>
                <small>Adicione documentos pelo CMS</small>
              </article>

              <article class="notice-card">
                <span>⬇️</span>
                <strong>Downloads</strong>
                <small>Arquivos publicados aparecerão aqui</small>
              </article>
            `
        }
      </div>
    </section>
  `;
}

function renderBlocoDownloadsExpansivel(bloco = {}) {
  const itens = Array.isArray(bloco.itens) ? bloco.itens : [];

  const grupos = itens.reduce((acc, item) => {
    const categoria = item.categoria || 'Editais';

    if (!acc[categoria]) {
      acc[categoria] = [];
    }

    acc[categoria].push(item);

    return acc;
  }, {});

  const categorias = Object.keys(grupos);

  const categoriasPadrao = categorias.length
    ? categorias
    : [
  'Edital',
  'Retificações',
  'Inscrições',
  'Homologação',
  'Locais de Prova',
  'Gabaritos',
  'Recursos',
  'Resultado Preliminar',
  'Resultado Final',
  'Convocação',
  'Matrícula',
  'Documentos'
];

  return `
    <section
      class="section"
      data-cms-block-id="${escaparHtml(bloco.configuracao?.cmsBlockId || '')}"
    >
      <div class="section-head">
        <h2>${escaparHtml(bloco.titulo || 'Editais e Documentos')}</h2>
      </div>

      ${
        bloco.texto
          ? `<div class="page-intro">${formatarTextoCms(bloco.texto)}</div>`
          : ''
      }

      <div class="notice-grid cms-doc-category-grid">
        ${categoriasPadrao.map((categoria, index) => `
          <button
            type="button"
            class="notice-card cms-doc-category-card ${index === 0 ? 'active' : ''}"
            data-doc-category="${escaparHtml(categoria)}"
          >
            <span>${getIconeCategoriaDocumento(categoria)}</span>
            <strong>${escaparHtml(categoria)}</strong>
            <small>
              ${
                grupos[categoria]?.length
                  ? `${grupos[categoria].length} arquivo(s)`
                  : 'Nenhum arquivo'
              }
            </small>
          </button>
        `).join('')}
      </div>

      <div class="cms-doc-panels">
        ${categoriasPadrao.map((categoria, index) => `
          <div
            class="cms-doc-panel ${index === 0 ? 'active' : ''}"
            data-doc-panel="${escaparHtml(categoria)}"
          >
            ${
              grupos[categoria]?.length
                ? grupos[categoria].map(item => `
                  <a
                    class="cms-doc-item"
                    href="${escaparHtml(item.url || item.link || '#')}"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <span>${escaparHtml(item.icon || item.icone || '📄')}</span>

                    <div>
                      <strong>${escaparHtml(item.titulo || item.nome || 'Documento')}</strong>
                      <small>${escaparHtml(item.texto || item.descricao || 'Baixar arquivo')}</small>
                    </div>

                    <em>Baixar</em>
                  </a>
                `).join('')
                : `
                  <div class="cms-doc-empty">
                    Nenhum documento cadastrado em ${escaparHtml(categoria)}.
                  </div>
                `
            }
          </div>
        `).join('')}
      </div>
    </section>
  `;
}

function getIconeCategoriaDocumento(categoria = '') {
  const nome = String(categoria).toLowerCase();

  if (nome.includes('retifica')) return '📝';
  if (nome.includes('inscri')) return '🖊️';
  if (nome.includes('homologa')) return '✅';
  if (nome.includes('local')) return '📍';
  if (nome.includes('gabarito')) return '🧾';
  if (nome.includes('recurso')) return '⚖️';
  if (nome.includes('preliminar')) return '📊';
  if (nome.includes('final')) return '🏆';
  if (nome.includes('convoca')) return '📣';
  if (nome.includes('matr')) return '🎓';
  if (nome.includes('document')) return '📎';

  return '📄';
}

function renderBlocoCertames(bloco = {}) {
  const itens = Array.isArray(bloco.itens)
    ? bloco.itens
    : [];

  return `
    <section
      class="section cms-certames-section"
      data-cms-block-id="${escaparHtml(bloco.configuracao?.cmsBlockId || '')}"
    >

      <div class="section-head">
        <h2>
          ${escaparHtml(bloco.titulo || 'Processos Seletivos')}
        </h2>
      </div>

      <div class="cms-certames-grid">

        ${
          itens.length

            ? itens.map((certame, index) => `

              <article
                class="
                  cms-certame-card
                  ${certame.destaque ? 'featured' : ''}
                "
              >

                <div class="cms-certame-top">

                  <div>
                    <span class="cms-certame-badge">
                      ${escaparHtml(certame.status || 'Em andamento')}
                    </span>

                    <h3>
                      ${escaparHtml(certame.titulo || 'Processo seletivo')}
                    </h3>
                  </div>

                  <button
                    class="cms-certame-toggle"
                    type="button"
                    data-certame-toggle="${index}"
                  >
                    Expandir
                  </button>

                </div>

                <div
                  class="cms-certame-docs"
                  data-certame-docs="${index}"
                >

                  ${
                    Array.isArray(certame.documentos) &&
                    certame.documentos.length

                      ? certame.documentos.map(doc => `

                        <a
                          class="cms-certame-doc"
                          href="${escaparHtml(doc.url || '#')}"
                          target="_blank"
                          rel="noopener noreferrer"
                        >

                          <div class="cms-certame-doc-left">
                            <span>
                              ${getIconeCategoriaDocumento(doc.fase)}
                            </span>

                            <div>
                              <strong>
                                ${escaparHtml(doc.titulo || 'Documento')}
                              </strong>

                              <small>
                                ${escaparHtml(doc.fase || '')}
                              </small>
                            </div>
                          </div>

                          <em>
                            ${escaparHtml(doc.texto || 'Baixar PDF')}
                          </em>

                        </a>

                      `).join('')

                      : `

                        <div class="cms-doc-empty">
                          Nenhum documento cadastrado.
                        </div>

                      `
                  }

                </div>

              </article>

            `).join('')

            : `

              <div class="cms-doc-empty">
                Nenhum certame cadastrado.
              </div>

            `
        }

      </div>

    </section>
  `;
}

function renderBlocoCronograma(bloco = {}) {
  const itens = Array.isArray(bloco.itens) ? bloco.itens : [];

  return `
    <section
      class="section"
      data-cms-block-id="${escaparHtml(bloco.configuracao?.cmsBlockId || '')}"
    >
      <div class="section-head">
        <h2>${escaparHtml(bloco.titulo || 'Cronograma')}</h2>
      </div>

      ${
        bloco.texto
          ? `<div class="page-intro">${formatarTextoCms(bloco.texto)}</div>`
          : ''
      }

      <div class="schedule-table">
        <div class="schedule-row header">
          <div>Etapa / Atividade</div>
          <div>Data / Período</div>
        </div>

        ${
          itens.length
            ? itens.map(item => `
              <div class="schedule-row">
                <div>
                  ${escaparHtml(item.titulo || item.etapa || item.nome || '')}
                </div>

                <div>
                  ${escaparHtml(item.data || item.periodo || item.prazo || '')}
                </div>
              </div>
            `).join('')
            : `
              <div class="schedule-row">
                <div>Inscrições</div>
                <div>Período a configurar no CMS</div>
              </div>

              <div class="schedule-row">
                <div>Resultado</div>
                <div>Data a configurar no CMS</div>
              </div>
            `
        }
      </div>
    </section>
  `;
}

function renderBlocoContatoCards(bloco = {}) {
  const itens = Array.isArray(bloco.itens) ? bloco.itens : [];

  const form =
    bloco.configuracao?.formulario || {};

  const campos =
    form.campos || {};

  const campoNome = campos.nome || {};
  const campoEmail = campos.email || {};
  const campoTelefone = campos.telefone || {};
  const campoAssunto = campos.assunto || {};
  const campoMensagem = campos.mensagem || {};

  return `
    <section
      class="contact-page"
      data-cms-block-id="${escaparHtml(bloco.configuracao?.cmsBlockId || '')}"
    >

      <div class="contact-info">

        ${
          itens.length

            ? itens.map(item => `
              <article class="contact-card">

                <span>
                  ${escaparHtml(item.icon || item.icone || '📍')}
                </span>

                <div>
                  <h3>
                    ${escaparHtml(item.titulo || item.nome || '')}
                  </h3>

                  <p>
                    ${escaparHtml(item.texto || item.valor || item.descricao || '')}
                  </p>
                </div>

              </article>
            `).join('')

            : `
              <article class="contact-card">
                <span>📍</span>

                <div>
                  <h3>Endereço</h3>
                  <p>
                    Configure as informações institucionais
                    pelo CMS.
                  </p>
                </div>
              </article>

              <article class="contact-card">
                <span>📞</span>

                <div>
                  <h3>Contato</h3>
                  <p>
                    Telefones, WhatsApp e canais oficiais.
                  </p>
                </div>
              </article>
            `
        }

      </div>

      <div class="contact-form-box">

        <div class="contact-form-head">

          <span>
            ${escaparHtml(form.label || 'Contato institucional')}
          </span>

          <h2>
            ${escaparHtml(form.titulo || bloco.titulo || 'Informações de Contato')}
          </h2>

          <p>
            ${escaparHtml(form.texto || bloco.texto || 'Utilize os canais oficiais da instituição para atendimento.')}
          </p>

        </div>

        <form class="contact-form">

          <div class="form-grid">

            <div class="form-group">
              <label>${escaparHtml(campoNome.label || 'Nome')}</label>
              <input placeholder="${escaparHtml(campoNome.placeholder || 'Digite seu nome')}">
            </div>

            <div class="form-group">
              <label>${escaparHtml(campoEmail.label || 'E-mail')}</label>
              <input placeholder="${escaparHtml(campoEmail.placeholder || 'Digite seu e-mail')}">
            </div>

          </div>

          <div class="form-grid">

            <div class="form-group">
              <label>${escaparHtml(campoTelefone.label || 'Telefone')}</label>
              <input placeholder="${escaparHtml(campoTelefone.placeholder || '(00) 00000-0000')}">
            </div>

            <div class="form-group">
              <label>${escaparHtml(campoAssunto.label || 'Assunto')}</label>
              <input placeholder="${escaparHtml(campoAssunto.placeholder || 'Assunto')}">
            </div>

          </div>

          <div class="form-group">
            <label>${escaparHtml(campoMensagem.label || 'Mensagem')}</label>

            <textarea
              rows="6"
              placeholder="${escaparHtml(campoMensagem.placeholder || 'Digite sua mensagem')}"
            ></textarea>
          </div>

          <button
            class="btn primary"
            type="submit"
          >
            ${escaparHtml(form.botao || form.textoBotao || bloco.link?.texto || 'Enviar mensagem')}
          </button>

        </form>

      </div>

    </section>
  `;
}

function renderBlocoMapa(bloco = {}) {
  const temLink =
    bloco.link?.url && bloco.link.url !== '#';

  const mapaHtml = `
    <div
      class="map-box"
      style="
        ${
          bloco.imagemUrl
            ? `
              background-image:
                linear-gradient(
                  rgba(6,26,53,.25),
                  rgba(6,26,53,.25)
                ),
                url('${escaparHtml(bloco.imagemUrl)}');
            `
            : ''
        }
      "
    >
      <div class="map-overlay">
        <h2>${escaparHtml(bloco.titulo || 'Localização')}</h2>

        <p>
          ${
            escaparHtml(bloco.texto || '') ||
            'Configure endereço e localização institucional pelo CMS.'
          }
        </p>

        ${
          temLink
            ? `
              <span
                class="btn primary"
                style="margin-top:18px;display:inline-flex;"
              >
                ${escaparHtml(bloco.link.texto || 'Abrir mapa')}
              </span>
            `
            : ''
        }
      </div>
    </div>
  `;

  return `
    <section
      class="map-section"
      data-cms-block-id="${escaparHtml(bloco.configuracao?.cmsBlockId || '')}"
    >
      ${
        temLink
          ? `
            <a
              href="${escaparHtml(bloco.link.url)}"
              target="_blank"
              rel="noopener noreferrer"
              style="display:block;text-decoration:none;color:inherit;"
            >
              ${mapaHtml}
            </a>
          `
          : mapaHtml
      }
    </section>
  `;
}

function renderBlocoFormularioContato(bloco = {}) {
  return '';
}

function renderBlocoCta(bloco = {}) {
  return `
    <section
      class="selection-banner"
      data-cms-block-id="${escaparHtml(bloco.configuracao?.cmsBlockId || '')}"
    >
      <div class="selection-banner-content">
        <div class="selection-banner-icon">
          ${escaparHtml(bloco.configuracao?.icone || '🎖️')}
        </div>

        <div>
          <h2>${escaparHtml(bloco.titulo || 'Chamada institucional')}</h2>
          <p>
            ${
              escaparHtml(bloco.texto || '') ||
              'Configure esta chamada pelo CMS.'
            }
          </p>
        </div>
      </div>

      ${renderLinkBlocoCms(bloco)}
    </section>
  `;
}

function renderBlocoVideoInterno(bloco = {}) {
  const videoUrl =
    bloco.videoUrl ||
    bloco.link?.url ||
    '#';

  return `
    <section
      class="video-section"
      data-cms-block-id="${escaparHtml(bloco.configuracao?.cmsBlockId || '')}"
    >
      <div class="video-card">

        <a
          class="video-preview"
          href="${escaparHtml(videoUrl)}"
          target="_blank"
          rel="noopener noreferrer"
          ${
            bloco.imagemUrl
              ? `
                style="
                  background-image:
                    linear-gradient(
                      rgba(6,26,53,.30),
                      rgba(6,26,53,.30)
                    ),
                    url('${escaparHtml(bloco.imagemUrl)}');
                "
              `
              : ''
          }
        >
          ▶
        </a>

        <div class="video-content">

          <span>
            ${escaparHtml(bloco.subtitulo || 'Vídeo institucional')}
          </span>

          <h2>
            ${escaparHtml(bloco.titulo || 'Conheça nossa instituição')}
          </h2>

          <p>
            ${
              escaparHtml(bloco.texto || '') ||
              'Adicione vídeos institucionais pelo CMS.'
            }
          </p>

          ${
            videoUrl && videoUrl !== '#'
              ? `
                <a
                  class="btn primary"
                  href="${escaparHtml(videoUrl)}"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  ${escaparHtml(bloco.link?.texto || 'Assistir vídeo')}
                </a>
              `
              : ''
          }

        </div>

      </div>
    </section>
  `;
}

function renderBlocoNumeros(bloco = {}) {
  const itens = Array.isArray(bloco.itens) ? bloco.itens : [];

  return `
    <section
      class="stats cms-numbers-section"
      data-cms-block-id="${escaparHtml(bloco.configuracao?.cmsBlockId || '')}"
    >

      ${
        itens.length

          ? itens.map(item => `
            <div>

              <span>
                ${escaparHtml(item.icon || item.icone || '📊')}
              </span>

              <strong>
                ${escaparHtml(item.numero || item.valor || '0')}
              </strong>

              <small>
                ${escaparHtml(item.titulo || item.label || '')}
              </small>

            </div>
          `).join('')

          : `

            <div>
              <span>🎓</span>
              <strong>+1200</strong>
              <small>Alunos</small>
            </div>

            <div>
              <span>🏆</span>
              <strong>98%</strong>
              <small>Aprovação</small>
            </div>

            <div>
              <span>📚</span>
              <strong>40+</strong>
              <small>Projetos</small>
            </div>

            <div>
              <span>⭐</span>
              <strong>15</strong>
              <small>Anos de história</small>
            </div>

          `
      }

    </section>
  `;
}

function renderBlocoCards(bloco = {}) {
  const itens = Array.isArray(bloco.itens) ? bloco.itens : [];

  return `
    <section
      class="section"
      data-cms-block-id="${escaparHtml(bloco.configuracao?.cmsBlockId || '')}"
    >

      <div class="section-head">
        <h2>${escaparHtml(bloco.titulo || 'Destaques')}</h2>
      </div>

      ${
        bloco.texto
          ? `<div class="page-intro">${formatarTextoCms(bloco.texto)}</div>`
          : ''
      }

      <div class="project-grid">

        ${
          itens.length

            ? itens.map(item => `
              <article class="project-card">

                <div class="project-icon">
                  ${escaparHtml(item.icon || item.icone || '★')}
                </div>

                <h3>
                  ${escaparHtml(item.titulo || item.nome || '')}
                </h3>

                <p>
                  ${escaparHtml(item.texto || item.descricao || '')}
                </p>

              </article>
            `).join('')

            : `

              <article class="project-card">
                <div class="project-icon">★</div>
                <h3>Bloco Dinâmico</h3>
                <p>
                  Adicione cards institucionais pelo CMS
                  para exibir projetos, etapas,
                  diferenciais e conteúdos visuais.
                </p>
              </article>

              <article class="project-card">
                <div class="project-icon">⚑</div>
                <h3>Estrutura Modular</h3>
                <p>
                  O CMS agora reutiliza layouts premium
                  diretamente do site institucional.
                </p>
              </article>

            `
        }

      </div>

    </section>
  `;
}

function renderBlocoDestaqueInstitucional(bloco = {}) {

  const tags =
    Array.isArray(bloco.itens) && bloco.itens.length

      ? bloco.itens
          .map(item =>
            item.texto ||
            item.titulo ||
            ''
          )
          .filter(Boolean)

      : Array.isArray(bloco.configuracao?.tags)

        ? bloco.configuracao.tags

        : [];

  return `
    <section
      class="section destaque-institucional-section"
      data-cms-block-id="${escaparHtml(bloco.configuracao?.cmsBlockId || '')}"
    >

      <div class="feature-card">

        ${
          bloco.imagemUrl
            ? `
              <div
                class="feature-image"
                style="background-image:url('${escaparHtml(bloco.imagemUrl)}')"
              ></div>
            `
            : ''
        }

        <div class="feature-content">

          <span class="tag">
            ${escaparHtml(
              bloco.configuracao?.label ||
              'Destaque institucional'
            )}
          </span>

          <h2>
            ${escaparHtml(bloco.titulo || '')}
          </h2>

          <p>
            ${escaparHtml(bloco.texto || '')}
          </p>

          ${
            tags.length
              ? `
                <div class="feature-tags">
                  ${tags.map(tag => `
                    <span>${escaparHtml(tag)}</span>
                  `).join('')}
                </div>
              `
              : ''
          }

        </div>

      </div>

    </section>
  `;
}

function renderBlocoListaCms(bloco = {}) {
  const itens = Array.isArray(bloco.itens) ? bloco.itens : [];

  return `
    <section
      class="section cms-lista-section"
      data-cms-block-id="${escaparHtml(bloco.configuracao?.cmsBlockId || '')}"
    >
      <div class="section-head">
        <h2>${escaparHtml(bloco.titulo || 'Menu Lateral')}</h2>
      </div>

      <nav class="history-side-menu">
        ${
          itens.length
            ? itens.map(item => `
              <a
                href="${escaparHtml(item.link || '#')}"
                class="${item.ativo ? 'active' : ''}"
              >
                ${escaparHtml(item.texto || '')}
              </a>
            `).join('')
            : `
              <a class="active" href="#nossa-historia">Nossa História</a>
              <a href="#linha-do-tempo">Linha do Tempo</a>
            `
        }
      </nav>
    </section>
  `;
}

function renderLinkBlocoCms(bloco = {}) {
  if (!bloco.link?.url) return '';

  return `
    <a
      class="btn primary"
      href="${escaparHtml(bloco.link.url)}"
      target="_blank"
      rel="noopener noreferrer"
    >
      ${escaparHtml(bloco.link.texto || 'Acessar')}
    </a>
  `;
}

function formatarTextoCms(texto = '') {
  return escaparHtml(texto)
    .split(/\n{2,}/)
    .map(paragrafo => paragrafo.trim())
    .filter(Boolean)
    .map(paragrafo => `<p>${paragrafo.replace(/\n/g, '<br>')}</p>`)
    .join('');
}

function renderHomeBanner(bloco) {
  const bg = bloco.imagemUrl
    ? `style="background:
        linear-gradient(90deg, rgba(6,26,53,.95), rgba(6,26,53,.68), rgba(185,21,27,.25)),
        url('${bloco.imagemUrl}');
        background-size:cover;
        background-position:center;"`
    : '';

  return `
    <section class="hero" ${bg}>
      <div class="hero-content">
        <span class="tag">Ensino de Excelência</span>
        <h1>${bloco.titulo || ''}</h1>
        <p>${bloco.texto || ''}</p>

        <div class="hero-actions">
          <a class="btn primary" href="${bloco.link?.url || '#'}">
            ${bloco.link?.texto || 'Saiba mais'}
          </a>
          <a class="btn secondary" href="./processo-seletivo.html">
            Processo Seletivo
          </a>
        </div>
      </div>

      <div class="hero-badges">
        <div class="badge-circle red">CBMAC</div>
        <div class="badge-circle blue">CMDPII<br>CZS</div>
      </div>
    </section>
  `;
}

function renderHomeMenu(bloco) {
  const itens = Array.isArray(bloco.itens) ? bloco.itens : [];

  return `
    <nav class="quick-menu">
      ${itens.map(item => `
        <a href="${item.link || '#'}">
          ${item.icon || '🔗'}
          <span>${item.texto || ''}</span>
        </a>
      `).join('')}
    </nav>
  `;
}

async function renderHomeNoticias(main, bloco) {
  try {
    const res = await fetch('/api/site-publico/noticias');
    const data = await res.json();

    let noticias = data.ok && Array.isArray(data.noticias)
      ? data.noticias
      : [];

    const config = bloco.configuracao || {};
    const limite = Number(config.limite || 5);

    if (config.categoria) {
      noticias = noticias.filter(n =>
        String(n.categoria || '').toLowerCase() ===
        String(config.categoria).toLowerCase()
      );
    }

    if (config.destaquesPrimeiro) {
      noticias = noticias.sort((a, b) =>
        Number(b.destaque || 0) - Number(a.destaque || 0)
      );
    }

    noticias = noticias.slice(0, limite);

    if (!noticias.length) {
      main.insertAdjacentHTML('beforeend', `
        <section class="section" data-cms-block-id="home-noticias">
          <div class="section-head">
            <h2>${escaparHtml(bloco.titulo || 'Notícias em Destaque')}</h2>
            <a href="./noticias.html">${escaparHtml(config.textoLinkGeral || 'Ver todas as notícias →')}</a>
          </div>

          <div class="single-news-loading">
            Nenhuma notícia publicada no momento.
          </div>
        </section>
      `);

      return;
    }

    const sliderId =
      `home-news-feature-slider-${Date.now()}-${Math.floor(Math.random() * 9999)}`;

    main.insertAdjacentHTML('beforeend', `
      <section
        class="section home-news-feature-slider-section"
        data-cms-block-id="home-noticias"
      >
        <div class="section-head">
          <h2>${escaparHtml(bloco.titulo || 'Notícias em Destaque')}</h2>
          <a href="./noticias.html">${escaparHtml(config.textoLinkGeral || 'Ver todas as notícias →')}</a>
        </div>

        ${
          bloco.texto
            ? `<div class="page-intro">${formatarTextoCms(bloco.texto)}</div>`
            : ''
        }

        <div
          id="${sliderId}"
          class="home-news-feature-slider"
          data-current-slide="0"
        >
          <div class="home-news-feature-track">
            ${noticias.map((noticia, index) => `
              <a
                class="home-news-feature-slide ${index === 0 ? 'active' : ''}"
                href="./noticias.html"
              >
                <div class="home-news-feature-image">
                  ${
                    noticia.imagem
                      ? `<img src="${escaparHtml(noticia.imagem)}" alt="${escaparHtml(noticia.titulo || 'Notícia')}">`
                      : ''
                  }

                  <span class="home-news-feature-category">
                    ${escaparHtml(noticia.categoria || 'Comunicado')}
                  </span>

                  ${
                    noticia.destaque
                      ? `<strong class="home-news-feature-badge">DESTAQUE</strong>`
                      : ''
                  }
                </div>

                <div class="home-news-feature-content">
                  <small>${formatarDataPublica(noticia.dataPublicacao || noticia.createdAt)}</small>

                  <h3>${escaparHtml(noticia.titulo || 'Notícia')}</h3>

                  <p>${escaparHtml(noticia.resumo || '')}</p>

                  <strong class="news-read-more">
                    ${escaparHtml(config.textoBotao || 'Leia mais →')}
                  </strong>
                </div>
              </a>
            `).join('')}
          </div>

          ${
            noticias.length > 1
              ? `
                <button
                  class="home-news-feature-arrow prev"
                  type="button"
                  aria-label="Notícia anterior"
                >
                  ‹
                </button>

                <button
                  class="home-news-feature-arrow next"
                  type="button"
                  aria-label="Próxima notícia"
                >
                  ›
                </button>

                <div class="home-news-feature-dots">
                  ${noticias.map((_, index) => `
                    <button
                      type="button"
                      class="${index === 0 ? 'active' : ''}"
                      aria-label="Ir para notícia ${index + 1}"
                      data-slide="${index}"
                    ></button>
                  `).join('')}
                </div>
              `
              : ''
          }
        </div>
      </section>
    `);

    inicializarHomeNewsFeatureSlider(sliderId);

  } catch (err) {
    console.error('Erro ao renderizar notícias:', err);
  }
}

function inicializarHomeNewsFeatureSlider(sliderId) {
  const slider = document.getElementById(sliderId);
  if (!slider) return;

  const track = slider.querySelector('.home-news-feature-track');
  const slides = Array.from(slider.querySelectorAll('.home-news-feature-slide'));
  const dots = Array.from(slider.querySelectorAll('.home-news-feature-dots button'));
  const prev = slider.querySelector('.home-news-feature-arrow.prev');
  const next = slider.querySelector('.home-news-feature-arrow.next');

  if (!track || slides.length <= 1) return;

  let current = 0;
  let timer = null;

  function irParaSlide(index) {
    current = (index + slides.length) % slides.length;

    track.style.transform = `translateX(-${current * 100}%)`;

    slides.forEach((slide, i) => {
      slide.classList.toggle('active', i === current);
    });

    dots.forEach((dot, i) => {
      dot.classList.toggle('active', i === current);
    });

    slider.dataset.currentSlide = String(current);
  }

  function proximoSlide() {
    irParaSlide(current + 1);
  }

  function iniciarAutoPlay() {
    pararAutoPlay();

    timer = setInterval(() => {
      proximoSlide();
    }, 5000);
  }

  function pararAutoPlay() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  prev?.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();

    irParaSlide(current - 1);
    iniciarAutoPlay();
  });

  next?.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();

    irParaSlide(current + 1);
    iniciarAutoPlay();
  });

  dots.forEach(dot => {
    dot.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();

      irParaSlide(Number(dot.dataset.slide || 0));
      iniciarAutoPlay();
    });
  });

  slider.addEventListener('mouseenter', pararAutoPlay);
  slider.addEventListener('mouseleave', iniciarAutoPlay);

  irParaSlide(0);
  iniciarAutoPlay();
}

function renderHomeEstatisticas(bloco) {
  const itensCms =
    Array.isArray(bloco.itens)
      ? bloco.itens
      : [];

  const itens = [
    {
      icon: '👁️',
      valor: '0',
      label: 'Visitas registradas'
    },
    ...itensCms
  ];

  return `
    <section class="stats" data-cms-block-id="home-estatisticas">
      ${itens.map(item => `
        <div>
          <span>${escaparHtml(item.icon || item.icone || '📌')}</span>
          <strong>${escaparHtml(item.valor || item.numero || '0')}</strong>
          <small>${escaparHtml(item.label || item.titulo || '')}</small>
        </div>
      `).join('')}
    </section>
  `;
}

function renderHomeGaleria(bloco) {
  const itens = Array.isArray(bloco.itens)
    ? bloco.itens
    : [];

  return `
    <section class="section" data-cms-block-id="home-galeria">
      <div class="section-head">
        <h2>${escaparHtml(bloco.titulo || 'Galeria de Fotos')}</h2>

        ${
          bloco.link?.url
            ? `
              <a href="${escaparHtml(bloco.link.url)}">
                ${escaparHtml(bloco.link.texto || 'Ver galeria completa →')}
              </a>
            `
            : ''
        }
      </div>

      ${
        bloco.texto
          ? `<div class="page-intro">${formatarTextoCms(bloco.texto)}</div>`
          : ''
      }

      <div class="gallery">
        ${
          itens.length
            ? itens.map(item => `
              <button
                type="button"
                class="home-gallery-item"
                data-home-gallery-image="${escaparHtml(item.imagem || item.url || '')}"
                data-home-gallery-title="${escaparHtml(item.alt || item.titulo || item.legenda || 'Imagem da galeria')}"
                style="${
                  item.imagem || item.url
                    ? `background-image:url('${escaparHtml(item.imagem || item.url)}')`
                    : ''
                }"
                title="${escaparHtml(item.alt || item.titulo || item.legenda || '')}"
              ></button>
            `).join('')
            : `
              <div class="single-news-loading">
                Nenhuma imagem cadastrada na galeria.
              </div>
            `
        }
      </div>

      <div class="home-gallery-footer">
        <a
          href="${escaparHtml(bloco.link?.url || './galeria.html')}"
          class="btn primary"
        >
          ${escaparHtml(bloco.link?.texto || 'Ver galeria completa')}
        </a>
      </div>
    </section>
  `;
}

async function renderHomePatrocinadores(main, bloco) {
  try {
    const res = await fetch('/api/site-publico/patrocinadores');
    const data = await res.json();

    if (!data.ok || !Array.isArray(data.patrocinadores)) return;

    const config = bloco.configuracao || {};

    let patrocinadores = data.patrocinadores;

    if (config.somenteAtivos !== false) {
      patrocinadores = patrocinadores.filter(p => p.status !== 'inativo');
    }

    if (config.tipo) {
      patrocinadores = patrocinadores.filter(p => p.tipo === config.tipo);
    }

    patrocinadores = patrocinadores
      .filter(p => p.destaque === true)
      .sort((a, b) => Number(a.ordem || 0) - Number(b.ordem || 0))
      .slice(0, Number(config.limite || 6));

    if (!patrocinadores.length) return;

    main.insertAdjacentHTML('beforeend', `
      <section
        class="home-sponsors-feature-section"
        data-cms-block-id="home-patrocinadores"
      >
        <div class="home-sponsors-feature-wrap">
          <div class="cms-home-sponsors-head subtle">
            <span>${escaparHtml(bloco.titulo || 'Parceiros Institucionais')}</span>
          </div>

          ${
            bloco.texto
              ? `<div class="page-intro">${formatarTextoCms(bloco.texto)}</div>`
              : ''
          }

          <div class="home-sponsors-feature-grid">
            ${patrocinadores.map(item => `
              <a
                class="home-sponsor-feature-card"
                href="${escaparHtml(item.url || '#')}"
                target="${item.url ? '_blank' : '_self'}"
                rel="noopener noreferrer"
              >
                <div class="home-sponsor-feature-logo">
                  ${
                    item.imagem
                      ? `<img src="${escaparHtml(item.imagem)}" alt="${escaparHtml(item.nome || 'Parceiro')}">`
                      : '<span>🤝</span>'
                  }
                </div>

                <div>
                  <strong>${escaparHtml(item.nome || 'Parceiro')}</strong>
                  ${item.descricao ? `<p>${escaparHtml(item.descricao)}</p>` : ''}
                  <small>${escaparHtml(item.tipo || 'Parceiro')}</small>
                </div>
              </a>
            `).join('')}
          </div>
        </div>
      </section>
    `);
    
  } catch (err) {
    console.error('Erro ao renderizar parceiros principais:', err);
  }
}

async function montarSidebarParceirosHome(main) {
  if (!main) return;

  if (main.querySelector('.home-flow-with-sidebar')) return;

  try {
    const res = await fetch('/api/site-publico/patrocinadores');
    const data = await res.json();

    if (!data.ok || !Array.isArray(data.patrocinadores)) return;

    const laterais = data.patrocinadores
      .filter(p => p.status !== 'inativo')
      .filter(p => p.destaque !== true)
      .sort((a, b) => Number(a.ordem || 0) - Number(b.ordem || 0));

    if (!laterais.length) return;

    const primeiraSecao =
      main.querySelector('[data-cms-block-id="home-noticias"]');

    if (!primeiraSecao) return;

    const wrapper = document.createElement('section');
    wrapper.className = 'home-flow-with-sidebar-section';

    wrapper.innerHTML = `
      <div class="home-flow-with-sidebar">
        <div class="home-flow-main"></div>

        <aside class="home-flow-sidebar">
  <div class="home-side-partners simple">
    <div class="home-side-partners-list simple">
      ${laterais.map(item => `
        <a
          class="home-side-partner-logo-card"
          href="${escaparHtml(item.url || '#')}"
          target="${item.url ? '_blank' : '_self'}"
          rel="noopener noreferrer"
          title="${escaparHtml(item.nome || 'Parceiro')}"
        >
          ${
            item.imagem
              ? `<img src="${escaparHtml(item.imagem)}" alt="${escaparHtml(item.nome || 'Parceiro')}">`
              : '<span>🤝</span>'
          }
        </a>
      `).join('')}
    </div>
  </div>
</aside>
      </div>
    `;

    primeiraSecao.parentNode.insertBefore(wrapper, primeiraSecao);

    const colunaPrincipal = wrapper.querySelector('.home-flow-main');

    const idsParaMover = [
      'home-noticias',
      'home-associacao',
      'home-estatisticas',
      'home-documentos',
      'home-galeria',
      'home-video'
    ];

    idsParaMover.forEach(id => {
      const bloco = main.querySelector(`[data-cms-block-id="${id}"]`);

      if (bloco) {
        colunaPrincipal.appendChild(bloco);
      }
    });

  } catch (err) {
    console.error('Erro ao montar sidebar de parceiros:', err);
  }
}

async function inserirSidebarParceirosNaHome(main) {
  return montarSidebarParceirosHome(main);
}

function renderHomeVideo(bloco) {
  const imagem = bloco.imagemUrl || '';

  return `
    <section
      class="video-call"
      style="${
        imagem
          ? `background:
              linear-gradient(90deg, rgba(6,26,53,.92), rgba(8,36,74,.82)),
              url('${imagem}');
              background-size:cover;
              background-position:center;`
          : ''
      }"
    >
      <div>
        <span class="video-icon">▶</span>
        <h2>${bloco.titulo || 'Assista ao vídeo institucional'}</h2>
        <p>${bloco.texto || ''}</p>
      </div>

      <a
        class="btn primary"
        href="${bloco.videoUrl || bloco.link?.url || '#'}"
        target="_blank"
        rel="noopener noreferrer"
      >
        ${bloco.link?.texto || 'Assistir agora'}
      </a>
    </section>
  `;
}

document.addEventListener('click', event => {
  const btn = event.target.closest('.cms-doc-category-card');

  if (!btn) return;

  const section = btn.closest('section');

  if (!section) return;

  const categoria = btn.dataset.docCategory;

  section.querySelectorAll('.cms-doc-category-card').forEach(item => {
    item.classList.toggle('active', item === btn);
  });

  section.querySelectorAll('.cms-doc-panel').forEach(panel => {
    panel.classList.toggle(
      'active',
      panel.dataset.docPanel === categoria
    );
  });
});

document.addEventListener('click', event => {
  const btn = event.target.closest('.cms-certame-toggle');

  if (!btn) return;

  const index = btn.dataset.certameToggle;

  const docs =
    document.querySelector(
      `[data-certame-docs="${index}"]`
    );

  if (!docs) return;

  docs.classList.toggle('open');

  btn.textContent =
    docs.classList.contains('open')
      ? 'Ocultar'
      : 'Expandir';
});
document.addEventListener('click', event => {
  const btn = event.target.closest('[data-gallery-filter]');

  if (!btn) return;

  const filtro = btn.dataset.galleryFilter;

  document.querySelectorAll('[data-gallery-filter]').forEach(item => {
    item.classList.toggle('active', item === btn);
  });

  document.querySelectorAll('.cms-gallery-premium .gallery-item').forEach(item => {
    const categoria = item.dataset.galleryCategory || '';

    const mostrar =
      filtro === 'Todos' ||
      categoria === filtro;

    item.style.display = mostrar ? '' : 'none';
  });
});

document.addEventListener('click', event => {
  const item = event.target.closest('.cms-gallery-premium .gallery-item');

  if (!item) return;

  const imagem = item.dataset.galleryImage;
  const titulo = item.dataset.galleryTitle || 'Imagem da galeria';

  if (!imagem) return;

  let modal = document.getElementById('cms-gallery-lightbox');

  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'cms-gallery-lightbox';
    modal.className = 'cms-gallery-lightbox';

    modal.innerHTML = `
      <button type="button" class="cms-gallery-lightbox-close">×</button>
      <img src="" alt="">
      <strong></strong>
    `;

    document.body.appendChild(modal);
  }

  modal.querySelector('img').src = imagem;
  modal.querySelector('img').alt = titulo;
  modal.querySelector('strong').textContent = titulo;

  modal.classList.add('show');
});

document.addEventListener('click', event => {
  if (
    event.target.closest('.cms-gallery-lightbox-close') ||
    event.target.id === 'cms-gallery-lightbox'
  ) {
    document.getElementById('cms-gallery-lightbox')?.classList.remove('show');
  }
});

document.addEventListener('click', event => {
  const item = event.target.closest('.home-gallery-item');

  if (!item) return;

  const imagem = item.dataset.homeGalleryImage;
  const titulo = item.dataset.homeGalleryTitle || 'Imagem da galeria';

  if (!imagem) return;

  let modal = document.getElementById('cms-gallery-lightbox');

  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'cms-gallery-lightbox';
    modal.className = 'cms-gallery-lightbox';

    modal.innerHTML = `
      <button type="button" class="cms-gallery-lightbox-close">×</button>
      <img src="" alt="">
      <strong></strong>
    `;

    document.body.appendChild(modal);
  }

  modal.querySelector('img').src = imagem;
  modal.querySelector('img').alt = titulo;
  modal.querySelector('strong').textContent = titulo;

  modal.classList.add('show');
});

window.AxoriinCmsRenderer = {
  renderizarBlocoCms,
  renderBlocoHeroInterno,
  renderBlocoPadraoCms,
  renderBlocoTimeline,
  renderBlocoEquipe,
  renderBlocoGaleriaInterna,
  renderBlocoDownloads,
  renderBlocoCronograma,
  renderBlocoContatoCards,
  renderBlocoMapa,
  renderBlocoFormularioContato,
  renderBlocoCta,
  renderBlocoVideoInterno,
  renderBlocoNumeros,
  renderBlocoCards
};
function renderHomeAssociacao(bloco = {}) {
  const projetos =
    Array.isArray(bloco.configuracao?.projetos)
      ? bloco.configuracao.projetos
      : [];

  return `
    <section
      class="section home-assoc-section"
      data-cms-block-id="${escaparHtml(bloco.configuracao?.cmsBlockId || 'home-associacao')}"
    >
      <article class="home-assoc-card">
        <div class="home-assoc-icon">🤝</div>

        <div class="home-assoc-content">
          <span>Comunidade escolar</span>

          <h2>${escaparHtml(bloco.titulo || 'Associação de Pais')}</h2>

          <p>
            ${escaparHtml(bloco.texto || 'Conheça as ações da Associação de Pais e participe das iniciativas que fortalecem nossa comunidade escolar.')}
          </p>
        </div>

        <button
          type="button"
          class="home-assoc-open"
          data-assoc-title="${escaparHtml(bloco.configuracao?.modalTitulo || bloco.titulo || 'Associação de Pais')}"
          data-assoc-text="${escaparHtml(bloco.configuracao?.modalTexto || bloco.texto || '')}"
          data-assoc-button="${escaparHtml(bloco.link?.texto || 'Quero participar')}"
          data-assoc-link="${escaparHtml(bloco.link?.url || '#')}"
          data-assoc-projects="${escaparHtml(JSON.stringify(projetos))}"
        >
          Saiba mais
        </button>
      </article>
    </section>
  `;
}

function renderHomeDocumentos(bloco = {}) {
  const itens = Array.isArray(bloco.itens) ? bloco.itens : [];

  return `
    <section
      class="section home-docs-section"
      data-cms-block-id="${escaparHtml(bloco.configuracao?.cmsBlockId || 'home-documentos')}"
    >
      <div class="section-head">
        <h2>${escaparHtml(bloco.titulo || 'Documentos e Informações')}</h2>
      </div>

      ${
        bloco.texto
          ? `<div class="page-intro">${formatarTextoCms(bloco.texto)}</div>`
          : ''
      }

      <div class="home-docs-grid">
        ${
          itens.length
            ? itens.map(item => `
              <button
                type="button"
                class="home-doc-card"
                data-doc-title="${escaparHtml(item.titulo || 'Documento')}"
                data-doc-text="${escaparHtml(item.texto || '')}"
                data-doc-icon="${escaparHtml(item.icone || item.icon || '📄')}"
                data-doc-files="${escaparHtml(JSON.stringify(Array.isArray(item.documentos) ? item.documentos : []))}"
              >
                <span>${escaparHtml(item.icone || item.icon || '📄')}</span>

                <div>
                  <h3>${escaparHtml(item.titulo || 'Documento')}</h3>
                  <p>${escaparHtml(item.texto || item.descricao || '')}</p>
                </div>

                <strong>Ver arquivos →</strong>
              </button>
            `).join('')
            : ''
        }
      </div>
    </section>
  `;
}

function inicializarHomeAssociacaoModal() {
  if (document.body.dataset.assocModalReady === 'true') return;

  document.body.dataset.assocModalReady = 'true';

  document.addEventListener('click', event => {
    const btn = event.target.closest('.home-assoc-open');
    if (!btn) return;

    let projetos = [];

    try {
      projetos = JSON.parse(btn.dataset.assocProjects || '[]');
    } catch {
      projetos = [];
    }

    const modalAntigo = document.querySelector('.home-assoc-modal');
    modalAntigo?.remove();

    const modal = document.createElement('div');
    modal.className = 'home-assoc-modal';

    modal.innerHTML = `
      <div class="home-assoc-modal-backdrop"></div>

      <div class="home-assoc-modal-dialog home-assoc-modal-wide" role="dialog" aria-modal="true">
        <button type="button" class="home-assoc-modal-close" aria-label="Fechar">×</button>

        <div class="home-assoc-modal-grid">
          <div class="home-assoc-modal-info">
            <span>Associação de Pais</span>

            <h2>${escaparHtml(btn.dataset.assocTitle || 'Associação de Pais')}</h2>

            <div class="home-assoc-modal-text">
              ${formatarTextoCms(btn.dataset.assocText || '')}
            </div>

            ${
              btn.dataset.assocLink && btn.dataset.assocLink !== '#'
                ? `
                  <a
                    class="btn primary home-assoc-join-btn"
                    href="${escaparHtml(btn.dataset.assocLink)}"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    ${escaparHtml(btn.dataset.assocButton || 'Quero participar')}
                  </a>
                `
                : ''
            }
          </div>

          <div class="home-assoc-projects">
            ${
              projetos.length
                ? `
                  <div class="home-assoc-slider" data-assoc-slider>
                    <button type="button" class="home-assoc-slide-nav prev" data-assoc-prev>‹</button>

                    <div class="home-assoc-slides">
                      ${projetos.map((item, index) => `
                        <article class="home-assoc-slide ${index === 0 ? 'active' : ''}">
                          ${
                            item.imagem
                              ? `<img src="${escaparHtml(item.imagem)}" alt="${escaparHtml(item.titulo || 'Projeto da Associação')}">`
                              : `<div class="home-assoc-slide-empty">Sem imagem</div>`
                          }

                          <div class="home-assoc-slide-caption">
                            <strong>${escaparHtml(item.titulo || 'Projeto apoiado pela Associação')}</strong>
                            <p>${escaparHtml(item.texto || '')}</p>
                          </div>
                        </article>
                      `).join('')}
                    </div>

                    <button type="button" class="home-assoc-slide-nav next" data-assoc-next>›</button>

                    <div class="home-assoc-dots">
                      ${projetos.map((_, index) => `
                        <button
                          type="button"
                          class="${index === 0 ? 'active' : ''}"
                          data-assoc-dot="${index}"
                          aria-label="Ir para imagem ${index + 1}"
                        ></button>
                      `).join('')}
                    </div>
                  </div>
                `
                : `
                  <div class="home-assoc-projects-empty">
                    Adicione imagens dos projetos pelo CMS para exibi-las aqui.
                  </div>
                `
            }
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    document.body.classList.add('home-assoc-modal-open');

    let slideAtual = 0;

    const slides = [...modal.querySelectorAll('.home-assoc-slide')];
    const dots = [...modal.querySelectorAll('[data-assoc-dot]')];

    const irParaSlide = index => {
      if (!slides.length) return;

      slideAtual = (index + slides.length) % slides.length;

      slides.forEach((slide, i) => {
        slide.classList.toggle('active', i === slideAtual);
      });

      dots.forEach((dot, i) => {
        dot.classList.toggle('active', i === slideAtual);
      });
    };

    modal.querySelector('[data-assoc-prev]')?.addEventListener('click', () => {
      irParaSlide(slideAtual - 1);
    });

    modal.querySelector('[data-assoc-next]')?.addEventListener('click', () => {
      irParaSlide(slideAtual + 1);
    });

    dots.forEach(dot => {
      dot.addEventListener('click', () => {
        irParaSlide(Number(dot.dataset.assocDot || 0));
      });
    });

    let autoplay = null;

    if (slides.length > 1) {
      autoplay = setInterval(() => {
        irParaSlide(slideAtual + 1);
      }, 5000);
    }

    const fechar = () => {
      if (autoplay) clearInterval(autoplay);

      modal.remove();
      document.body.classList.remove('home-assoc-modal-open');
    };

    modal.querySelector('.home-assoc-modal-close')?.addEventListener('click', fechar);
    modal.querySelector('.home-assoc-modal-backdrop')?.addEventListener('click', fechar);
  });
}

function inicializarHomeDocumentosModal() {
  if (document.body.dataset.homeDocsModalReady === 'true') return;

  document.body.dataset.homeDocsModalReady = 'true';

  document.addEventListener('click', event => {
    const card = event.target.closest('.home-doc-card');
    if (!card) return;

    let arquivos = [];

    try {
      arquivos = JSON.parse(card.dataset.docFiles || '[]');
    } catch {
      arquivos = [];
    }

    const modalAntigo = document.querySelector('.home-doc-modal');
    modalAntigo?.remove();

    const modal = document.createElement('div');
    modal.className = 'home-doc-modal';

    modal.innerHTML = `
      <div class="home-doc-modal-backdrop"></div>

      <div class="home-doc-modal-dialog" role="dialog" aria-modal="true">
        <button
          type="button"
          class="home-doc-modal-close"
          aria-label="Fechar"
        >
          ×
        </button>

        <div class="home-doc-modal-head">
          <span>${escaparHtml(card.dataset.docIcon || '📄')}</span>

          <div>
            <small>Documentos e informações</small>
            <h2>${escaparHtml(card.dataset.docTitle || 'Documento')}</h2>
            <p>${escaparHtml(card.dataset.docText || '')}</p>
          </div>
        </div>

        <div class="home-doc-modal-list">
          ${
            arquivos.length
              ? arquivos.map(arquivo => `
                <a
                  class="home-doc-modal-item"
                  href="${escaparHtml(arquivo.url || arquivo.link || '#')}"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <div>
                    <strong>${escaparHtml(arquivo.titulo || 'Documento')}</strong>
                    <small>${escaparHtml(arquivo.texto || 'Baixar arquivo')}</small>
                  </div>

                  <em>Baixar</em>
                </a>
              `).join('')
              : `
                <div class="home-doc-modal-empty">
                  Nenhum documento cadastrado neste card.
                </div>
              `
          }
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    document.body.classList.add('home-doc-modal-open');

    const fechar = () => {
      modal.remove();
      document.body.classList.remove('home-doc-modal-open');
    };

    modal.querySelector('.home-doc-modal-close')?.addEventListener('click', fechar);
    modal.querySelector('.home-doc-modal-backdrop')?.addEventListener('click', fechar);
  });
}
document.addEventListener('click', event => {
  const openBtn = event.target.closest('.single-news-gallery-open');

  if (openBtn) {
    abrirImagemNoticiaModal(
      openBtn.dataset.img,
      openBtn.dataset.caption || ''
    );
    return;
  }

  if (
    event.target.closest('.news-image-lightbox-close') ||
    event.target.classList.contains('news-image-lightbox-backdrop')
  ) {
    document
      .getElementById('news-image-lightbox')
      ?.classList.remove('show');

    document.body.classList.remove('lightbox-open');
  }
});

document.addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    document
      .getElementById('news-image-lightbox')
      ?.classList.remove('show');

    document.body.classList.remove('lightbox-open');
  }
});