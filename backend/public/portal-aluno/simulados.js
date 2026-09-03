// AXORIIN V1.15.9 - mascote apontando com piscada e expressao suave
(function(){
'use strict';

const runtime = window.AxoriinAluno;
if (!runtime || !runtime.garantirSessao()) return;

const $ = (s) => document.querySelector(s);
const esc = (v) => runtime.escapeHtml ? runtime.escapeHtml(String(v ?? '')) : String(v ?? '');
const THEME_KEY = 'axoriin.portal.simulados.theme';

const state = {
  contexto: null,
  resultados: [],
  selectedId: null,
  selected: null,
  reviewFilter: 'all',
  questionReviewIndex: 0,
  paperZoom: 100,
  paperMode: 'question',
  paperOriginalIndex: 0,
};

function num(v){ return Number(v || 0); }
function pct(v, min=1, max=1){ return `${num(v).toLocaleString('pt-BR',{minimumFractionDigits:min, maximumFractionDigits:max})}%`; }
function inteira(v){ return num(v).toLocaleString('pt-BR'); }
function date(v){ if(!v) return '—'; const d = new Date(v); return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pt-BR'); }
function dateTime(v){ if(!v) return ''; const d = new Date(v); return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'}); }
function text(v, fallback='—'){ const s = String(v ?? '').trim(); return s || fallback; }
function obsCount(r){ return num(r.observadas ?? (num(r.respondidas) + num(r.brancos))); }
function currentSummary(){ return state.resultados.find((item) => String(item._id) === String(state.selectedId)) || null; }
function previousSummary(){ const idx = state.resultados.findIndex((item) => String(item._id) === String(state.selectedId)); return idx >= 0 ? (state.resultados[idx + 1] || null) : null; }

function applyTheme(theme){
  const next = theme === 'dark' ? 'dark' : 'light';
  document.body.setAttribute('data-theme', next);
  try { localStorage.setItem(THEME_KEY, next); } catch(_e){}
  const btn = $('#themeToggle');
  if (btn) btn.textContent = next === 'dark' ? '☀️ Tema claro' : '🌙 Tema escuro';
}

function loadTheme(){
  let saved = null;
  try { saved = localStorage.getItem(THEME_KEY); } catch(_e){}
  if (saved === 'light' || saved === 'dark') return applyTheme(saved);
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  applyTheme(prefersDark ? 'dark' : 'light');
}

function colorForArea(name){
  const key = String(name || '').toLowerCase();
  if (key.includes('lingu')) return '#2dc96b';
  if (key.includes('human')) return '#2d8cff';
  if (key.includes('nature')) return '#ff9f1a';
  if (key.includes('mat')) return '#7d56ff';
  if (key.includes('reda')) return '#ff5f97';
  return '#7d56ff';
}

function saudacao(){
  const hour = new Date().getHours();
  if (hour < 12) return 'Bom dia';
  if (hour < 18) return 'Boa tarde';
  return 'Boa noite';
}

function nivelPorPercentual(percentual){
  const p = num(percentual);
  if (p >= 80) return { nivel: 'Nível Ouro', points: 2450, progress: 78, faltam: 'Você está em excelente ritmo.' };
  if (p >= 65) return { nivel: 'Nível Prata', points: 1780, progress: 58, faltam: 'Mais um avanço e você sobe de nível.' };
  if (p >= 50) return { nivel: 'Nível Bronze', points: 1240, progress: 42, faltam: 'Continue revisando para ganhar mais pontos.' };
  return { nivel: 'Nível Evolução', points: 760, progress: 28, faltam: 'Sua evolução começa com revisão focada.' };
}

function resumoMensagem(item){
  const r = item.resumoGeral || {};
  const acertos = num(r.acertos);
  const observadas = obsCount(r);
  const percentual = num(r.percentualPontuacao);
  if (percentual >= 75) return `Parabéns! Você acertou ${acertos} de ${observadas} questões observadas e está em ótimo ritmo.`;
  if (percentual >= 60) return `Bom desempenho! Você acertou ${acertos} de ${observadas} questões observadas. Agora vamos lapidar os detalhes.`;
  return `Seu diagnóstico já está pronto: ${acertos} de ${observadas} questões observadas. Agora é hora de revisar com foco.`;
}

function areaRowHtml(area){
  const nome = text(area.rotulo || area.areaNome || area.chave || 'Área');
  const acertos = num(area.acertos);
  const observadas = num(area.observadas);
  const percentual = Math.max(0, Math.min(100, num(area.percentualPontuacao ?? area.percentualAcerto)));
  const color = colorForArea(nome);
  return `
    <article class="area-row">
      <div class="area-main">
        <div class="area-head">
          <span class="area-dot" style="background:${color}"></span>
          <strong class="area-name">${esc(nome)}</strong>
        </div>
        <div class="area-bar"><i style="width:${percentual}%;background:${color}"></i></div>
      </div>
      <div class="area-acertos">${acertos} / ${observadas || '—'}</div>
      <div class="area-pct">${pct(percentual)}</div>
    </article>`;
}

function previewMistakeRow(q){
  const area = text(q.area, '—');
  const assunto = text(q.conteudo || q.macroconteudo || q.eixoPedagogico || q.componente, 'Conteúdo para revisar');
  const habilidade = text(q.habilidadeEnemDescricao || q.habilidade, 'Habilidade não informada');
  const visualClass = q.visual?.disponivel ? ' available' : '';
  return `
    <article class="mistake-row${q.revisada ? ' reviewed' : ''}" data-review-question="${esc(q.codigoQuestao || q.numero)}">
      <div><div class="mistake-number">${inteira(q.numero)}</div>${q.dia ? `<small>Dia ${inteira(q.dia)}</small>` : ''}</div>
      <div><span class="answer-pill wrong">${esc(text(q.resposta, '—'))}</span></div>
      <div><span class="answer-pill right">${esc(text(q.gabarito, '—'))}</span></div>
      <div class="mistake-area">${esc(area)}</div>
      <div class="mistake-topic"><strong>${esc(assunto)}</strong><small>${esc(habilidade)}</small></div>
      <button type="button" class="mistake-action${visualClass}" data-review-question="${esc(q.codigoQuestao || q.numero)}" title="${q.visual?.disponivel ? 'Abrir a questão original da prova' : 'Abrir revisão da questão'}">${q.revisada ? '✓' : '📘'}</button>
    </article>`;
}

function questaoErroHtml(q){
  const resposta = q.resposta || '—';
  const gabarito = q.gabarito || '—';
  const assunto = q.conteudo || q.macroconteudo || q.eixoPedagogico || q.componente || '';
  const habilidade = q.habilidadeEnemDescricao || q.habilidade || '';
  const area = q.area || '';
  return `<article class="wrong-question${q.revisada ? ' reviewed' : ''}"><div class="wrong-head"><div><span class="question-number">Questão ${inteira(q.numero)}</span>${num(q.dia)?`<span class="question-day">Dia ${inteira(q.dia)}</span>`:''}</div><div class="answer-compare"><span>Sua resposta: <b>${esc(resposta)}</b></span><span>Gabarito: <b>${esc(gabarito)}</b></span></div></div>${area?`<div class="question-area">${esc(area)}</div>`:''}${assunto?`<div class="question-topic"><strong>Assunto para revisar:</strong> ${esc(assunto)}</div>`:''}${habilidade?`<div class="question-skill"><strong>Habilidade:</strong> ${esc(habilidade)}</div>`:''}<button type="button" class="question-open-btn" data-review-question="${esc(q.codigoQuestao || q.numero)}">${q.visual?.disponivel ? 'Ver questão original e revisar' : 'Abrir revisão'}</button></article>`;
}

function normalizeReviewKey(value){
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0,180);
}

function reviewStatusMap(item){
  const map = new Map();
  (Array.isArray(item?.revisoesConteudo) ? item.revisoesConteudo : []).forEach((r) => {
    if (r?.chave) map.set(String(r.chave), r);
  });
  return map;
}

function deriveReviewItems(item){
  const lista = [];
  const porConteudo = Array.isArray(item?.porConteudo) ? item.porConteudo : [];
  const status = reviewStatusMap(item);

  porConteudo.forEach((entry) => {
    const tituloRaw = String(entry.rotulo || entry.nome || entry.chave || entry.conteudo || '').trim();
    const areaRaw = String(entry.areaNome || entry.area || entry.componente || entry.eixoPedagogico || '').trim();
    if (!tituloRaw) return;
    const observadas = num(entry.observadas ?? entry.total ?? entry.quantidade);
    if (observadas <= 0) return;
    const percentual = Math.max(0, Math.min(100, num(entry.percentualPontuacao ?? entry.percentualAcerto)));
    const erros = num(entry.erros);
    if (erros <= 0 && percentual >= 70) return;
    const chave = normalizeReviewKey(`${areaRaw}__${tituloRaw}`);
    const salvo = status.get(chave) || {};
    lista.push({
      chave,
      titulo: tituloRaw,
      subtitulo: areaRaw || 'Revisão prioritária',
      percentual,
      icon: iconForTheme(tituloRaw),
      observadas,
      erros,
      revisado: salvo.revisado === true,
      revisadoEm: salvo.revisadoEm || null,
    });
  });

  if (!lista.length) {
    const agrupado = new Map();
    (item?.questoesErradas || []).forEach((q) => {
      const titulo = String(q.conteudo || q.macroconteudo || q.eixoPedagogico || q.componente || q.area || q.areaEnemNome || 'Revisão prioritária').trim();
      const areaRaw = String(q.area || q.areaEnemNome || q.componente || '').trim();
      const chave = normalizeReviewKey(`${areaRaw}__${titulo}`);
      if (!agrupado.has(chave)) agrupado.set(chave, { chave, titulo, areaRaw, erros: 0, questoes: [] });
      const entry = agrupado.get(chave);
      entry.erros += 1;
      if (q.numero) entry.questoes.push(q.numero);
    });
    agrupado.forEach((entry) => {
      const salvo = status.get(entry.chave) || {};
      lista.push({
        chave: entry.chave,
        titulo: entry.titulo,
        subtitulo: entry.areaRaw || 'Ponto de atenção',
        percentual: null,
        icon: iconForTheme(entry.titulo),
        observadas: entry.erros,
        erros: entry.erros,
        questoes: entry.questoes,
        revisado: salvo.revisado === true,
        revisadoEm: salvo.revisadoEm || null,
      });
    });
  }

  const errosDoResultado = Array.isArray(item?.questoesErradas) ? item.questoesErradas : [];
  lista.forEach((entry) => {
    const relacionadas = errosDoResultado.filter((q) => {
      const titulo = String(q.conteudo || q.macroconteudo || q.eixoPedagogico || q.componente || q.area || q.areaEnemNome || 'Revisão prioritária').trim();
      const areaRaw = String(q.area || q.areaEnemNome || q.componente || '').trim();
      return normalizeReviewKey(`${areaRaw}__${titulo}`) === entry.chave;
    });
    entry.questoesDetalhes = relacionadas;
    entry.questoesRevisadas = relacionadas.filter((q) => q.revisada === true).length;
    if (!entry.questoes?.length && relacionadas.length) entry.questoes = relacionadas.map((q) => q.numero);
  });

  return lista.sort((a,b) => {
    if (a.revisado !== b.revisado) return a.revisado ? 1 : -1;
    if (a.percentual === null && b.percentual === null) return b.erros - a.erros;
    return ((a.percentual ?? 101) - (b.percentual ?? 101)) || (b.erros - a.erros) || (b.observadas - a.observadas);
  });
}

function deriveImproveItems(item){
  return deriveReviewItems(item).filter((entry) => !entry.revisado).slice(0,3);
}

function iconForTheme(texto){
  const key = String(texto || '').toLowerCase();
  if (key.includes('fun') || key.includes('mat')) return '🧮';
  if (key.includes('fís') || key.includes('newton') || key.includes('nature')) return '🧪';
  if (key.includes('text') || key.includes('lingu')) return '📘';
  if (key.includes('hist') || key.includes('human')) return '🏛️';
  return '🎯';
}

function improveHtml(entry){
  const badge = entry.percentual === null ? `${inteira(entry.observadas)} erro(s)` : `Acertou ${pct(entry.percentual,0,0)}`;
  return `
    <article class="improve-card">
      <div class="improve-icon">${entry.icon}</div>
      <div class="improve-copy"><strong>${esc(entry.titulo)}</strong><span>${esc(entry.subtitulo)}</span></div>
      <div class="improve-badge">${esc(badge)}</div>
      <div class="improve-arrow">›</div>
    </article>`;
}

function reviewPlanItemHtml(entry){
  const meta = [];
  if (entry.percentual !== null) meta.push(`${pct(entry.percentual,0,0)} de acerto`);
  if (entry.erros > 0) meta.push(`${inteira(entry.erros)} erro(s)`);
  const totalQuestoes = entry.questoesDetalhes?.length || entry.questoes?.length || 0;
  const revisadas = entry.questoesRevisadas || 0;
  if (totalQuestoes) meta.push(`${revisadas}/${totalQuestoes} questão(ões) revisada(s)`);
  const revisadoEm = entry.revisadoEm ? dateTime(entry.revisadoEm) : '';
  return `
    <article class="review-plan-item${entry.revisado ? ' done' : ''}" data-review-key="${esc(entry.chave)}">
      <div class="review-check-wrap">
        <button type="button" class="review-check" data-toggle-review="${esc(entry.chave)}" aria-label="${entry.revisado ? 'Marcar como pendente' : 'Marcar como revisado'}">${entry.revisado ? '✓' : ''}</button>
      </div>
      <div class="review-plan-copy">
        <div class="review-plan-topline"><span class="review-priority">${entry.revisado ? 'REVISADO' : (entry.percentual !== null && entry.percentual < 45 ? 'PRIORIDADE ALTA' : 'REVISAR')}</span><span>${esc(entry.subtitulo)}</span></div>
        <h3>${esc(entry.titulo)}</h3>
        <p>${esc(meta.join(' · ') || 'Conteúdo indicado para revisão')}</p>
        ${entry.revisado ? `<small>Concluído${revisadoEm ? ` em ${esc(revisadoEm)}` : ''}.</small>` : (totalQuestoes && revisadas === totalQuestoes ? '<small>Você já revisou todas as questões deste assunto. Agora pode marcar o conteúdo como estudado.</small>' : '<small>Abra as questões, estude os erros e marque o conteúdo quando concluir.</small>')}
      </div>
      <div class="review-plan-actions">${totalQuestoes ? `<button type="button" class="review-study-btn" data-study-review="${esc(entry.chave)}">Estudar questões</button>` : ''}<button type="button" class="review-action-btn" data-toggle-review="${esc(entry.chave)}">${entry.revisado ? 'Desfazer' : 'Marcar como revisado'}</button></div>
    </article>`;
}

function renderReviewPlan(){
  const listEl = $('#reviewPlanList');
  if (!listEl || !state.selected) return;
  const all = deriveReviewItems(state.selected);
  const done = all.filter((x) => x.revisado).length;
  const total = all.length;
  const progress = total ? Math.round((done / total) * 100) : 0;

  const ctaSummary = $('#ctaReviewSummary');
  const ctaHint = $('#ctaReviewHint');
  if (ctaSummary) ctaSummary.textContent = total ? `${total - done} prioridade(s) pendente(s) · ${done} concluída(s)` : 'Nenhuma prioridade disponível';
  if (ctaHint) ctaHint.textContent = total ? `${progress}% do plano marcado como estudado.` : 'Assim que houver conteúdos prioritários, eles aparecerão aqui.';

  $('#reviewProgressText').textContent = `${done} de ${total} revisado${total === 1 ? '' : 's'}`;
  $('#reviewProgressBar').style.width = `${progress}%`;
  $('#reviewProgressHint').textContent = total
    ? (done === total ? 'Plano concluído. Excelente trabalho!' : `${total - done} conteúdo(s) ainda aguardam revisão.`)
    : 'Ainda não há conteúdos suficientes para montar um plano de revisão.';

  const filtered = all.filter((entry) => {
    if (state.reviewFilter === 'pending') return !entry.revisado;
    if (state.reviewFilter === 'done') return entry.revisado;
    return true;
  });

  listEl.innerHTML = filtered.length
    ? filtered.map(reviewPlanItemHtml).join('')
    : '<div class="muted-box">Nenhum conteúdo neste filtro.</div>';

  document.querySelectorAll('[data-toggle-review]').forEach((btn) => {
    btn.addEventListener('click', () => toggleReview(btn.getAttribute('data-toggle-review')));
  });
  document.querySelectorAll('[data-study-review]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const entry = deriveReviewItems(state.selected).find((x) => x.chave === btn.getAttribute('data-study-review'));
      const q = entry?.questoesDetalhes?.[0];
      if (q) openQuestionReview(q.codigoQuestao || q.numero);
    });
  });
}

async function toggleReview(chave){
  if (!state.selected || !state.selectedId || !chave) return;
  const entry = deriveReviewItems(state.selected).find((x) => x.chave === chave);
  if (!entry) return;
  const next = !entry.revisado;
  document.querySelectorAll('[data-toggle-review]').forEach((btn) => { if (btn.getAttribute('data-toggle-review') === chave) btn.disabled = true; });
  try {
    const payload = await runtime.apiFetch(`/api/portal-aluno/simulados/${encodeURIComponent(state.selectedId)}/revisoes-conteudo`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chave, revisado: next }),
    });
    state.selected.revisoesConteudo = payload.revisoesConteudo || [];
    renderReviewPlan();
    renderDashboard();
  } catch (error) {
    alert(error.message || 'Não foi possível atualizar o controle de revisão.');
    renderReviewPlan();
  }
}

function openReviewPlan(){
  if (!state.selected) return;
  state.reviewFilter = 'all';
  document.querySelectorAll('[data-review-filter]').forEach((btn) => {
    btn.classList.toggle('active', btn.getAttribute('data-review-filter') === 'all');
  });
  renderReviewPlan();
  const dialog = $('#reviewPlanDialog');
  if (dialog && !dialog.open) dialog.showModal();
}

function summaryCardHtml(item){
  const r = item.resumoGeral || {};
  const ativo = String(item._id) === String(state.selectedId) ? ' active' : '';
  return `
    <article class="result-card${ativo}" data-select-result="${esc(item._id)}">
      <span class="chip">${esc(text((item.simulado?.tipo || 'simulado').toUpperCase()))}</span>
      <h4>${esc(text(item.simulado?.titulo, 'Simulado'))}</h4>
      <p>${esc(text(item.turma, 'Ensino Médio'))} · ${esc(date(item.processadoEm))}</p>
      <div class="result-score"><strong>${pct(r.percentualPontuacao)}</strong><small>${inteira(num(r.acertos))} acertos</small></div>
    </article>`;
}

function findWrongQuestionIndex(identifier){
  const list = state.selected?.questoesErradas || [];
  const target = String(identifier || '');
  return list.findIndex((q) => String(q.codigoQuestao || q.numero) === target || String(q.numero) === target);
}

function paperPageUrl(q, pagina){
  const raw = `/api/portal-aluno/simulados/${encodeURIComponent(state.selectedId)}/questoes/${encodeURIComponent(q.dia || 1)}/${encodeURIComponent(q.numero)}/paginas/${encodeURIComponent(pagina)}`;
  return runtime.buildUrl ? runtime.buildUrl(raw) : raw;
}

function paperCropUrl(q, indice){
  const raw = `/api/portal-aluno/simulados/${encodeURIComponent(state.selectedId)}/questoes/${encodeURIComponent(q.dia || 1)}/${encodeURIComponent(q.numero)}/recortes/${encodeURIComponent(indice)}`;
  return runtime.buildUrl ? runtime.buildUrl(raw) : raw;
}

function renderQuestionReview(){
  const list = state.selected?.questoesErradas || [];
  if (!list.length) return;
  state.questionReviewIndex = Math.max(0, Math.min(list.length - 1, state.questionReviewIndex));
  const q = list[state.questionReviewIndex];
  const assunto = text(q.conteudo || q.macroconteudo || q.eixoPedagogico || q.componente, 'Conteúdo para revisar');
  const habilidade = text(q.habilidadeEnemDescricao || q.habilidade, 'Habilidade não informada.');
  const paginas = q.visual?.disponivel ? (q.visual.paginas || []) : [];
  const recortes = q.visual?.disponivel ? (q.visual.recortes || []) : [];

  $('#questionReviewTitle').textContent = `Questão ${inteira(q.numero)} · ${inteira(q.dia)}º dia`;
  $('#questionReviewSubtitle').textContent = q.visual?.variante && q.visual.variante !== 'PADRAO'
    ? `Versão ${q.visual.variante === 'INGLES' ? 'Inglês' : 'Espanhol'} da prova`
    : 'Questão original e diagnóstico lado a lado.';
  $('#questionStudentAnswer').textContent = text(q.resposta, '—');
  $('#questionCorrectAnswer').textContent = text(q.gabarito, '—');
  $('#questionArea').textContent = text(q.area, 'ÁREA');
  $('#questionTopic').textContent = assunto;
  $('#questionSkill').textContent = habilidade;
  $('#paperZoomLabel').textContent = `${state.paperZoom}%`;

  const pagesEl = $('#questionPages');
  const originalPager = $('#paperOriginalPager');
  const toggleOriginal = $('#paperToggleOriginal');
  const paperTitle = $('#paperViewTitle');

  if (state.paperMode === 'pages') {
    const pageIndex = Math.max(0, Math.min(Math.max(0, paginas.length - 1), state.paperOriginalIndex));
    state.paperOriginalIndex = pageIndex;
    const pagina = paginas[pageIndex];
    paperTitle.textContent = 'Página original do caderno';
    toggleOriginal.textContent = 'Voltar à questão isolada';
    originalPager.hidden = paginas.length <= 1;
    $('#paperOriginalPageLabel').textContent = pagina ? `Página ${pagina} · ${pageIndex + 1} de ${paginas.length}` : 'Página indisponível';
    $('#previousPaperPage').disabled = pageIndex <= 0;
    $('#nextPaperPage').disabled = pageIndex >= paginas.length - 1;
    $('#paperPageInfo').textContent = pagina ? `Visualização completa da página ${pagina}` : '';
    pagesEl.innerHTML = pagina
      ? `<figure class="question-page-figure original-page"><img src="${esc(paperPageUrl(q, pagina))}" alt="Página ${pagina} do caderno" style="width:${state.paperZoom}%"><figcaption>Página ${pagina} completa</figcaption></figure>`
      : '<div class="question-page-empty"><strong>Página original indisponível.</strong></div>';
    $('#questionBookletNotice').innerHTML = '<strong>Modo página original.</strong><span>Este modo pode mostrar outras questões da mesma página. Use “Voltar à questão isolada” para revisar sem distrações.</span>';
  } else {
    paperTitle.textContent = 'Questão isolada da prova';
    toggleOriginal.textContent = 'Ver página original';
    originalPager.hidden = true;
    $('#paperPageInfo').textContent = recortes.length
      ? `Recorte preciso · origem: página${paginas.length > 1 ? 's' : ''} ${paginas.join(', ')}`
      : (paginas.length ? `Origem: página${paginas.length > 1 ? 's' : ''} ${paginas.join(', ')}` : '');

    if (recortes.length) {
      pagesEl.innerHTML = recortes.map((recorte, indice) => `<figure class="question-crop-figure"><img src="${esc(paperCropUrl(q, indice))}" alt="Trecho ${indice + 1} da questão ${q.numero}" style="width:${state.paperZoom}%">${recortes.length > 1 ? `<figcaption>Continuação ${indice + 1} de ${recortes.length}</figcaption>` : ''}</figure>`).join('');
      $('#questionBookletNotice').innerHTML = '<strong>Questão isolada.</strong><span>O Axoriin removeu as outras questões da página e reuniu somente os trechos que pertencem a esta questão.</span>';
    } else if (paginas.length) {
      pagesEl.innerHTML = '<div class="question-page-empty"><strong>Recorte preciso ainda não disponível.</strong><p>Este caderno foi indexado por uma versão anterior. Reenvie o PDF no módulo de Simulados para ativar a visualização isolada da questão.</p><button type="button" class="ghost-btn" id="legacyOpenOriginal">Ver página original mesmo assim</button></div>';
      $('#questionBookletNotice').innerHTML = '<strong>Reindexação recomendada.</strong><span>O diagnóstico está correto; apenas o recorte visual precisa ser atualizado.</span>';
      requestAnimationFrame(() => $('#legacyOpenOriginal')?.addEventListener('click', () => { state.paperMode = 'pages'; state.paperOriginalIndex = 0; renderQuestionReview(); }));
    } else {
      pagesEl.innerHTML = '<div class="question-page-empty"><strong>Caderno ainda não publicado para esta questão.</strong><p>O diagnóstico continua disponível. Assim que a escola enviar o PDF da prova, a questão aparecerá aqui automaticamente.</p></div>';
      $('#questionBookletNotice').innerHTML = '<strong>Diagnóstico disponível.</strong><span>A questão original será liberada quando o caderno deste dia for publicado.</span>';
    }
  }

  const revisadas = list.filter((item) => item.revisada === true).length;
  $('#toggleQuestionReviewed').textContent = q.revisada ? '✓ Questão revisada · desfazer' : 'Marcar questão como revisada';
  $('#toggleQuestionReviewed').classList.toggle('done', q.revisada === true);
  $('#questionReviewProgress').textContent = `Questão ${state.questionReviewIndex + 1} de ${list.length} · ${revisadas} revisada(s)`;
  $('#previousWrongQuestion').disabled = state.questionReviewIndex <= 0;
  $('#nextWrongQuestion').disabled = state.questionReviewIndex >= list.length - 1;
}

function openQuestionReview(identifier){
  const idx = findWrongQuestionIndex(identifier);
  if (idx < 0) return;
  state.questionReviewIndex = idx;
  state.paperZoom = 100;
  state.paperMode = 'question';
  state.paperOriginalIndex = 0;
  renderQuestionReview();
  if ($('#detailDialog')?.open) $('#detailDialog').close();
  $('#questionReviewDialog').showModal();
}

async function toggleQuestionReviewed(){
  const q = state.selected?.questoesErradas?.[state.questionReviewIndex];
  if (!q || !state.selectedId) return;
  const next = !q.revisada;
  const button = $('#toggleQuestionReviewed');
  button.disabled = true;
  try {
    const payload = await runtime.apiFetch(`/api/portal-aluno/simulados/${encodeURIComponent(state.selectedId)}/revisoes-questao`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codigoQuestao: q.codigoQuestao, dia: q.dia, revisada: next }),
    });
    q.revisada = next;
    q.revisadaEm = next ? new Date().toISOString() : null;
    state.selected.revisoesQuestao = payload.revisoesQuestao || [];
    renderQuestionReview();
    renderDashboard();
    if ($('#reviewPlanDialog')?.open) renderReviewPlan();
  } catch (error) {
    alert(error.message || 'Não foi possível atualizar a revisão desta questão.');
  } finally {
    button.disabled = false;
  }
}

function bindQuestionReviewButtons(root = document){
  root.querySelectorAll('[data-review-question]').forEach((el) => {
    el.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      openQuestionReview(el.getAttribute('data-review-question'));
    });
  });
}

function renderContext(){
  const aluno = state.contexto?.aluno || {};
  const nome = text(aluno.nome, 'Aluno');
  const primeiroNome = nome.split(' ')[0] || nome;
  $('#greetingTitle').textContent = `${saudacao()}, ${primeiroNome}!`;
  $('#greetingText').textContent = 'Cada simulado é uma oportunidade para evoluir e estudar com mais direção.';
  $('#studentName').textContent = nome;
  $('#studentClass').textContent = text(aluno.turma, 'Ensino Médio');
  const avatar = $('#studentAvatar');
  const foto = aluno.foto || '';
  if (foto) {
    avatar.src = foto;
    avatar.alt = `Foto de ${nome}`;
  }
}

function renderDashboard(){
  const item = state.selected;
  const summary = currentSummary() || item;
  if (!item || !summary) return;

  const r = item.resumoGeral || {};
  const previous = previousSummary();
  const previousPercent = num(previous?.resumoGeral?.percentualPontuacao);
  const currentPercent = num(r.percentualPontuacao);
  const evolution = previous ? currentPercent - previousPercent : null;
  const acertos = num(r.acertos);
  const observadas = obsCount(r);
  const totalQuestoes = num(r.totalQuestoes || observadas);
  const level = nivelPorPercentual(currentPercent);

  $('#heroTitle').textContent = text(item.simulado?.titulo, 'Simulado');
  $('#heroMeta').textContent = `${text(item.turma, 'Ensino Médio')} · ${date(item.processadoEm)} · ${text(item.simulado?.anoLetivo, '—')}`;
  $('#heroText').textContent = resumoMensagem(item);

  $('#statAcertos').textContent = inteira(acertos);
  $('#statAcertosSub').textContent = `de ${inteira(observadas)} questões observadas`;
  $('#statPercentual').textContent = pct(currentPercent,0,1);
  $('#statQuestoes').textContent = inteira(totalQuestoes);
  $('#statQuestoesSub').textContent = totalQuestoes && totalQuestoes !== observadas ? `${inteira(observadas)} consideradas no diagnóstico` : 'Questões consideradas no simulado';
  $('#statEvolucao').textContent = previous ? `${evolution >= 0 ? '+' : ''}${pct(evolution,0,1)}` : '1º';
  $('#statEvolucaoSub').textContent = previous ? 'Comparação com o simulado anterior' : 'Primeiro resultado disponível';
  $('#totalSimulados').textContent = inteira(state.resultados.length);

  $('#studentPoints').textContent = inteira(level.points);
  $('#studentLevel').textContent = level.nivel;
  $('#levelProgress').style.width = `${level.progress}%`;
  $('#levelHint').textContent = level.faltam;

  $('#areasList').innerHTML = (item.porArea || []).length
    ? item.porArea.map(areaRowHtml).join('')
    : '<div class="empty-box">Ainda não há detalhamento por área neste resultado.</div>';

  const wrongPreview = (item.questoesErradas || []).slice(0,4);
  $('#mistakesPreview').innerHTML = wrongPreview.length
    ? wrongPreview.map(previewMistakeRow).join('')
    : '<div class="muted-box">Nenhuma questão foi classificada como erro neste resultado.</div>';
  bindQuestionReviewButtons($('#mistakesPreview'));

  const improve = deriveImproveItems(item);
  $('#improveList').innerHTML = improve.length
    ? improve.map(improveHtml).join('')
    : '<div class="muted-box">Ainda não há tópicos suficientes para recomendar uma rota de revisão.</div>';

  renderReviewPlan();
  $('#resultsRail').innerHTML = state.resultados.map(summaryCardHtml).join('');
  document.querySelectorAll('[data-select-result]').forEach((el) => {
    el.addEventListener('click', () => selectResult(el.getAttribute('data-select-result')));
  });
}

function renderDetailDialog(mode){
  const item = state.selected;
  if (!item) return;
  const r = item.resumoGeral || {};
  const aus = item.diasAusentes?.length ? `<div class="notice"><strong>Ausência registrada:</strong> dia(s) ${item.diasAusentes.join(', ')}. Essas questões não entram no denominador do seu diagnóstico.</div>` : '';
  const areas = (item.porArea || []).length ? item.porArea.map(areaRowHtml).join('') : '<p class="meta">Ainda não há detalhamento por área neste resultado.</p>';
  const erros = (item.questoesErradas || []).length
    ? `<p class="section-subtitle">Use esta lista para revisar exatamente os pontos em que você teve dificuldade. O assunto e a habilidade aparecem quando já constam no diagnóstico do simulado.</p><div class="wrong-list">${(item.questoesErradas || []).map(questaoErroHtml).join('')}</div>`
    : '<div class="notice">Nenhuma questão foi classificada como erro neste resultado.</div>';

  $('#detailTitle').textContent = text(item.simulado?.titulo, 'Simulado');
  $('#detailMeta').textContent = `${text(item.turma, 'Ensino Médio')} · ${text(item.simulado?.anoLetivo, '—')}`;
  $('#detailBody').innerHTML = `
    <div class="detail-grid">
      <div class="detail-tile"><span>Desempenho confirmado</span><strong>${pct(r.percentualPontuacao)}</strong></div>
      <div class="detail-tile"><span>Acertos</span><strong>${inteira(num(r.acertos))} de ${inteira(obsCount(r))}</strong></div>
      <div class="detail-tile"><span>Cobertura</span><strong>${pct(r.coberturaPercentual)}</strong></div>
      <div class="detail-tile"><span>Questões do simulado</span><strong>${inteira(num(r.totalQuestoes))}</strong></div>
    </div>
    <div class="notice">Este é um diagnóstico por acertos/pontuação bruta calculado pelo Axoriin. Ele não representa a nota TRI oficial do ENEM.</div>
    ${aus}
    ${mode !== 'wrongOnly' ? `<h3>Desempenho por área</h3><div class="area-table">${areas}</div>` : ''}
    <section class="wrong-section">
      <div class="wrong-section-title"><div><span class="eyebrow">REVISÃO DA PROVA</span><h3>Questões que você errou</h3></div><strong class="wrong-count">${(item.questoesErradas||[]).length}</strong></div>
      ${erros}
    </section>`;
  bindQuestionReviewButtons($('#detailBody'));
  $('#detailDialog').showModal();
}

async function selectResult(id){
  if (!id || String(id) === String(state.selectedId) && state.selected) return;
  try {
    state.selectedId = id;
    const payload = await runtime.apiFetch(`/api/portal-aluno/simulados/${encodeURIComponent(id)}`);
    state.selected = payload.resultado || null;
    renderDashboard();
  } catch (error) {
    alert(error.message || 'Não foi possível carregar o detalhamento do simulado.');
  }
}

async function load(){
  $('#loading').hidden = false;
  $('#empty').hidden = true;
  $('#error').hidden = true;
  $('#dashboard').hidden = true;
  try {
    const [contexto, payload] = await Promise.all([
      runtime.apiFetch('/api/portal-aluno/contexto').catch(() => null),
      runtime.apiFetch('/api/portal-aluno/simulados'),
    ]);
    state.contexto = contexto || null;
    state.resultados = payload.resultados || [];
    renderContext();
    $('#loading').hidden = true;
    if (!state.resultados.length) {
      $('#empty').hidden = false;
      return;
    }
    state.selectedId = state.resultados[0]._id;
    await selectResult(state.selectedId);
    $('#dashboard').hidden = false;
  } catch (error) {
    $('#loading').hidden = true;
    $('#error').hidden = false;
    $('#errorText').textContent = error.message || 'Erro inesperado.';
  }
}


function initReviewMascotAnimation(){
  const card = document.getElementById('reviewEvolutionCard');
  if (!card) return;

  const stage = card.querySelector('.cta-mascot-stage');
  const blinkSoft = card.querySelector('.cta-mascot-blink-soft');
  const blinkFull = card.querySelector('.cta-mascot-blink-full');
  const mouthFrame = card.querySelector('.cta-mascot-mouth');
  const reviewButton = document.getElementById('scrollImprove');

  if (!stage || !blinkSoft || !blinkFull || !mouthFrame) return;

  card.classList.add('ax-mascot-awake');

  let alive = true;
  let blinkTimer = null;
  let expressionTimer = null;
  let reactTimer = null;

  const animateOpacity = (el, keyframes, options) => {
    if (!el || typeof el.animate !== 'function') return null;
    return el.animate(keyframes, options);
  };

  // Piscada em aproximadamente 170 ms. O corpo e a escala nunca mudam:
  // apenas dois overlays recortados no visor ganham/perdem opacidade.
  const blinkOnce = () => {
    if (!alive || document.hidden) return;

    animateOpacity(blinkSoft, [
      { opacity:0, offset:0 },
      { opacity:1, offset:.28 },
      { opacity:1, offset:.72 },
      { opacity:0, offset:1 }
    ], { duration:170, easing:'linear' });

    animateOpacity(blinkFull, [
      { opacity:0, offset:0 },
      { opacity:0, offset:.22 },
      { opacity:1, offset:.43 },
      { opacity:1, offset:.60 },
      { opacity:0, offset:.82 },
      { opacity:0, offset:1 }
    ], { duration:170, easing:'linear' });
  };

  const scheduleBlink = () => {
    window.clearTimeout(blinkTimer);
    blinkTimer = window.setTimeout(() => {
      blinkOnce();
      if (Math.random() > .78) window.setTimeout(blinkOnce, 255);
      scheduleBlink();
    }, 2800 + Math.floor(Math.random() * 2600));
  };

  const smilePulse = () => {
    if (!alive || document.hidden) return;
    animateOpacity(mouthFrame, [
      { opacity:0, offset:0 },
      { opacity:1, offset:.28 },
      { opacity:1, offset:.66 },
      { opacity:0, offset:1 }
    ], { duration:620, easing:'ease-in-out' });
  };

  const scheduleExpression = () => {
    window.clearTimeout(expressionTimer);
    expressionTimer = window.setTimeout(() => {
      smilePulse();
      scheduleExpression();
    }, 7600 + Math.floor(Math.random() * 4200));
  };

  const react = () => {
    if (!alive) return;
    card.classList.remove('ax-mascot-react');
    void card.offsetWidth;
    card.classList.add('ax-mascot-react');
    blinkOnce();
    window.setTimeout(smilePulse, 170);
    window.clearTimeout(reactTimer);
    reactTimer = window.setTimeout(() => card.classList.remove('ax-mascot-react'), 980);
  };

  scheduleBlink();
  scheduleExpression();

  card.addEventListener('mouseenter', react, { passive:true });
  card.addEventListener('focusin', react, { passive:true });
  if (reviewButton) reviewButton.addEventListener('mouseenter', react, { passive:true });
  if (reviewButton) reviewButton.addEventListener('focus', react, { passive:true });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      scheduleBlink();
      scheduleExpression();
    }
  });

  window.addEventListener('pagehide', () => {
    alive = false;
    window.clearTimeout(blinkTimer);
    window.clearTimeout(expressionTimer);
    window.clearTimeout(reactTimer);
  }, { once:true });
}

initReviewMascotAnimation();

$('#retry').addEventListener('click', load);
$('#closeDetail').addEventListener('click', () => $('#detailDialog').close());
$('#openDetail').addEventListener('click', () => renderDetailDialog('full'));
$('#openDetailAreas').addEventListener('click', () => renderDetailDialog('full'));
$('#viewAllWrong').addEventListener('click', () => renderDetailDialog('wrongOnly'));
$('#openWrongModal').addEventListener('click', () => renderDetailDialog('wrongOnly'));
$('#scrollImprove').addEventListener('click', openReviewPlan);
$('#closeReviewPlan').addEventListener('click', () => $('#reviewPlanDialog').close());
document.querySelectorAll('[data-review-filter]').forEach((btn) => {
  btn.addEventListener('click', () => {
    state.reviewFilter = btn.getAttribute('data-review-filter') || 'all';
    document.querySelectorAll('[data-review-filter]').forEach((x) => x.classList.toggle('active', x === btn));
    renderReviewPlan();
  });
});
$('#closeQuestionReview').addEventListener('click', () => $('#questionReviewDialog').close());
$('#toggleQuestionReviewed').addEventListener('click', toggleQuestionReviewed);
$('#previousWrongQuestion').addEventListener('click', () => { if (state.questionReviewIndex > 0) { state.questionReviewIndex -= 1; state.paperZoom = 100; state.paperMode = 'question'; state.paperOriginalIndex = 0; renderQuestionReview(); } });
$('#nextWrongQuestion').addEventListener('click', () => { const total = state.selected?.questoesErradas?.length || 0; if (state.questionReviewIndex < total - 1) { state.questionReviewIndex += 1; state.paperZoom = 100; state.paperMode = 'question'; state.paperOriginalIndex = 0; renderQuestionReview(); } });
$('#paperZoomIn').addEventListener('click', () => { state.paperZoom = Math.min(180, state.paperZoom + 20); renderQuestionReview(); });
$('#paperZoomOut').addEventListener('click', () => { state.paperZoom = Math.max(60, state.paperZoom - 20); renderQuestionReview(); });
$('#paperToggleOriginal').addEventListener('click', () => { state.paperMode = state.paperMode === 'question' ? 'pages' : 'question'; state.paperOriginalIndex = 0; renderQuestionReview(); });
$('#previousPaperPage').addEventListener('click', () => { if (state.paperOriginalIndex > 0) { state.paperOriginalIndex -= 1; renderQuestionReview(); } });
$('#nextPaperPage').addEventListener('click', () => { const q = state.selected?.questoesErradas?.[state.questionReviewIndex]; const total = q?.visual?.paginas?.length || 0; if (state.paperOriginalIndex < total - 1) { state.paperOriginalIndex += 1; renderQuestionReview(); } });

$('#themeToggle').addEventListener('click', () => {
  const current = document.body.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  applyTheme(current === 'dark' ? 'light' : 'dark');
});

document.querySelectorAll('[data-portal-link]').forEach((a) => {
  const href = a.getAttribute('href');
  if (href) a.href = runtime.buildUrl(href);
});

runtime.registrarPwa();
loadTheme();
load();
})();
