/* =====================================================
   procedimento-modal.js
   Modal compartilhado para abertura de Procedimento Disciplinar.
   Reutilizado por: notificacoes.html, lista-alunos.html, ficha-aluno.html

   API pública:
     window.abrirModalProcedimentoDisciplinar(contexto)
     window.fecharModalProcedimentoDisciplinar()

   Contexto origem notificacao:
   {
     origem: 'notificacao',
     notificacaoId, alunoId, nomeAluno, turma,
     classificacaoOcorrencia, possuiViolencia, possuiLesao,
     possuiDanoPatrimonial, possuiSubstanciaIlicita,
     possuiArmaOuObjetoPerigoso, exigeEncaminhamentoExterno,
     orgaoEncaminhamento, data, motivo, observacao
   }

   Contexto origem ficha/lista do aluno:
   {
     origem: 'ficha_aluno',
     alunoId, nomeAluno, turma
   }
===================================================== */
(function (global) {
  'use strict';

  const MODAL_ID  = 'pdProcedimentoModal';
  const STYLES_ID = 'pdProcedimentoStyles';

  /* ----------------------------------------------------------
     helpers de UI
  ---------------------------------------------------------- */
  function _showToast(msg) {
    if (typeof global.showToast === 'function') return global.showToast(msg);
    if (typeof global.toast    === 'function') return global.toast(msg, 'ok');
    console.log('[PD]', msg);
  }
  function _showError(msg) {
    if (typeof global.showError === 'function') return global.showError(msg);
    if (typeof global.toast     === 'function') return global.toast(msg, 'err', 'Erro');
    alert(msg);
  }
  function _el(id)          { return document.getElementById(id); }
  function _val(id)         { return (_el(id) || {}).value || ''; }
  function _checked(id)     { return !!(_el(id) || {}).checked; }
  function _set(id, val)    { const e = _el(id); if (e) e.value = String(val ?? ''); }
  function _setCheck(id, v) { const e = _el(id); if (e) e.checked = !!v; }
  function _setOpt(id, val) {
    const e = _el(id);
    if (!e) return;
    const opt = Array.from(e.options).find(o => o.value === val);
    if (opt) e.value = val;
  }
  function _todayISO(d) {
    const dt = d ? new Date(d) : new Date();
    if (isNaN(dt.getTime())) return _todayISO();
    const yyyy = dt.getFullYear();
    const mm   = String(dt.getMonth() + 1).padStart(2, '0');
    const dd   = String(dt.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }
  function _tenant() {
    return new URLSearchParams(global.location.search).get('t') || '';
  }

  /* ----------------------------------------------------------
     CSS injetado — auto-contido, sem dependência de CSS vars da página
  ---------------------------------------------------------- */
  const CSS = `
#pdProcedimentoModal {
  position: fixed;
  inset: 0;
  display: none;
  align-items: center;
  justify-content: center;
  padding: 18px;
  background: rgba(5,10,20,.65);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  z-index: 9999;
}
#pdProcedimentoModal.is-open { display: flex; }
.pd-modal-card {
  width: min(620px, 100%);
  border-radius: 22px;
  border: 1px solid rgba(255,255,255,.14);
  background:
    radial-gradient(circle at top left, rgba(255,196,0,.08), transparent 38%),
    linear-gradient(180deg, rgba(18,28,46,.96), rgba(10,18,34,.96));
  box-shadow: 0 24px 60px rgba(0,0,0,.42);
  overflow: hidden;
}
.pd-modal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 18px;
  border-bottom: 1px solid rgba(255,255,255,.10);
}
.pd-modal-title { font-size: 1.05rem; font-weight: 800; color: #ffe082; font-family: inherit; }
.pd-modal-close {
  border: 1px solid rgba(255,255,255,.14);
  background: rgba(255,255,255,.06);
  color: #fff;
  width: 38px;
  height: 38px;
  border-radius: 12px;
  cursor: pointer;
  font-size: 1rem;
  line-height: 1;
  flex-shrink: 0;
}
.pd-modal-body {
  padding: 18px;
  display: grid;
  gap: 12px;
  overflow-y: auto;
  max-height: calc(88dvh - 72px);
}
.pd-modal-note { color: #b8c7e0; font-size: .92rem; font-family: inherit; }
.pd-modal-field-label { display: block; font-size: .85rem; color: #b8c7e0; margin-bottom: 4px; font-family: inherit; }
.pd-modal-body input,
.pd-modal-body select,
.pd-modal-body textarea {
  width: 100%;
  box-sizing: border-box;
  background: rgba(255,255,255,.06);
  border: 1px solid rgba(255,255,255,.14);
  border-radius: 10px;
  color: #ecf2ff;
  padding: 9px 12px;
  font-size: .95rem;
  font-family: inherit;
}
.pd-modal-body select option { background: #101e36; color: #ecf2ff; }
.pd-modal-body textarea { min-height: 72px; resize: vertical; }
.pd-modal-body label {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #ecf2ff;
  font-size: .93rem;
  cursor: pointer;
  font-family: inherit;
  user-select: none;
}
.pd-btn-primary {
  border: 1px solid rgba(255,196,0,.38);
  background: linear-gradient(135deg, rgba(255,170,0,.28), rgba(255,120,0,.24));
  color: #fff;
  border-radius: 12px;
  padding: 10px 16px;
  cursor: pointer;
  font-weight: 700;
  font-size: .95rem;
  font-family: inherit;
  width: 100%;
  transition: background .16s ease;
  margin-top: 4px;
}
.pd-btn-primary:hover:not(:disabled) {
  background: linear-gradient(135deg, rgba(255,180,0,.34), rgba(255,130,0,.30));
}
.pd-btn-primary:disabled { opacity: .55; cursor: not-allowed; }
@media (max-width: 768px) {
  #pdProcedimentoModal { padding: 12px; align-items: flex-end; }
  .pd-modal-card { width: 100%; border-radius: 20px 20px 0 0; max-height: 88dvh; }
}
`;

  /* ----------------------------------------------------------
     HTML injetado
  ---------------------------------------------------------- */
  const HTML = `
<div id="${MODAL_ID}" aria-hidden="true">
  <div class="pd-modal-card">
    <div class="pd-modal-head">
      <div class="pd-modal-title">⚖️ Abrir procedimento disciplinar</div>
      <button type="button" class="pd-modal-close" onclick="window.fecharModalProcedimentoDisciplinar()">✕</button>
    </div>
    <div class="pd-modal-body">
      <div class="pd-modal-note" id="pdProcAlunoInfo">—</div>

      <input id="pdProcLocalFato" placeholder="Local do fato: sala, pátio, corredor, quadra..." />
      <input id="pdProcHoraFato" placeholder="Horário aproximado. Ex.: 09:30" />

      <div>
        <label for="pdProcDataFato" class="pd-modal-field-label">Data do fato</label>
        <input id="pdProcDataFato" type="date" />
      </div>

      <select id="pdProcNatureza">
        <option value="indisciplina">Indisciplina escolar</option>
        <option value="ato_infracional">Possível ato infracional</option>
      </select>

      <select id="pdProcGravidade">
        <option value="leve">Leve</option>
        <option value="media" selected>Média</option>
        <option value="grave">Grave</option>
        <option value="gravissima">Gravíssima</option>
      </select>

      <textarea id="pdProcComplemento" placeholder="Complemento técnico da coordenação, se necessário"></textarea>

      <label><input type="checkbox" id="pdProcViolencia"> Houve violência</label>
      <label><input type="checkbox" id="pdProcLesao"> Houve lesão</label>
      <label><input type="checkbox" id="pdProcDano"> Houve dano patrimonial</label>
      <label><input type="checkbox" id="pdProcSubstancia"> Envolveu substância ilícita</label>
      <label><input type="checkbox" id="pdProcObjeto"> Envolveu arma ou objeto perigoso</label>

      <label><input type="checkbox" id="pdProcEncaminhamento"> Exige encaminhamento externo</label>

      <select id="pdProcOrgao" style="display:none">
        <option value="">Selecione o órgão</option>
        <option value="conselho_tutelar">Conselho Tutelar</option>
        <option value="delegacia">Delegacia</option>
        <option value="ministerio_publico">Ministério Público</option>
        <option value="judiciario">Judiciário</option>
      </select>

      <button class="pd-btn-primary" id="pdBtnInstaurar" onclick="window._pdConfirmarProcedimento()">
        Instaurar procedimento
      </button>
    </div>
  </div>
</div>
`;

  /* ----------------------------------------------------------
     injeção no DOM (idempotente)
  ---------------------------------------------------------- */
  function _inject() {
    if (!_el(STYLES_ID)) {
      const style = document.createElement('style');
      style.id = STYLES_ID;
      style.textContent = CSS;
      document.head.appendChild(style);
    }
    if (!_el(MODAL_ID)) {
      document.body.insertAdjacentHTML('beforeend', HTML);
      _el('pdProcEncaminhamento')?.addEventListener('change', function () {
        _el('pdProcOrgao').style.display = this.checked ? 'block' : 'none';
      });
    }
  }

  /* ----------------------------------------------------------
     estado interno
  ---------------------------------------------------------- */
  let _ctx = null;

  /* ----------------------------------------------------------
     abrir
  ---------------------------------------------------------- */
  function abrir(contexto) {
    if (!contexto || !contexto.alunoId) {
      console.error('[PD] abrirModalProcedimentoDisciplinar: contexto inválido', contexto);
      _showError('Dados do aluno não disponíveis. Tente novamente.');
      return;
    }

    _inject();
    _ctx = contexto;

    /* Cabeçalho com nome e turma */
    _el('pdProcAlunoInfo').textContent =
      `${contexto.nomeAluno || 'Aluno'} • ${contexto.turma || 'Turma não informada'}`;

    /* Limpa campos comuns */
    _set('pdProcLocalFato', '');
    _set('pdProcHoraFato', '');
    _set('pdProcComplemento', '');
    _set('pdProcDataFato', contexto.origem === 'notificacao'
      ? _todayISO(contexto.data)
      : _todayISO());

    if (contexto.origem === 'notificacao') {
      /* Pré-preenche com dados da notificação */
      const nat  = contexto.classificacaoOcorrencia === 'ato_infracional'
        ? 'ato_infracional' : 'indisciplina';
      const grav = contexto.classificacaoOcorrencia === 'ato_infracional'
        ? 'grave' : 'media';
      _setOpt('pdProcNatureza',  nat);
      _setOpt('pdProcGravidade', grav);
      _setCheck('pdProcViolencia',      contexto.possuiViolencia);
      _setCheck('pdProcLesao',          contexto.possuiLesao);
      _setCheck('pdProcDano',           contexto.possuiDanoPatrimonial);
      _setCheck('pdProcSubstancia',     contexto.possuiSubstanciaIlicita);
      _setCheck('pdProcObjeto',         contexto.possuiArmaOuObjetoPerigoso);
      _setCheck('pdProcEncaminhamento', contexto.exigeEncaminhamentoExterno);
      const orgEl = _el('pdProcOrgao');
      if (orgEl) {
        orgEl.style.display = contexto.exigeEncaminhamentoExterno ? 'block' : 'none';
        orgEl.value = contexto.orgaoEncaminhamento || '';
      }
    } else {
      /* Origem ficha_aluno — defaults neutros */
      _setOpt('pdProcNatureza',  'indisciplina');
      _setOpt('pdProcGravidade', 'media');
      _setCheck('pdProcViolencia',      false);
      _setCheck('pdProcLesao',          false);
      _setCheck('pdProcDano',           false);
      _setCheck('pdProcSubstancia',     false);
      _setCheck('pdProcObjeto',         false);
      _setCheck('pdProcEncaminhamento', false);
      const orgEl = _el('pdProcOrgao');
      if (orgEl) { orgEl.style.display = 'none'; orgEl.value = ''; }
    }

    /* Restaura botão caso esteja desabilitado de tentativa anterior */
    const btn = _el('pdBtnInstaurar');
    if (btn) { btn.disabled = false; btn.textContent = 'Instaurar procedimento'; }

    const modal = _el(MODAL_ID);
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  /* ----------------------------------------------------------
     fechar
  ---------------------------------------------------------- */
  function fechar() {
    const modal = _el(MODAL_ID);
    if (modal) {
      modal.classList.remove('is-open');
      modal.setAttribute('aria-hidden', 'true');
    }
    document.body.style.overflow = '';
    _ctx = null;
  }

  /* ----------------------------------------------------------
     confirmar (submissão do formulário)
  ---------------------------------------------------------- */
  async function confirmar() {
    if (!_ctx) return;

    const localFato = _val('pdProcLocalFato').trim();
    if (!localFato) {
      _showError('Informe o local do fato.');
      return;
    }

    const natureza                   = _val('pdProcNatureza');
    const gravidade                  = _val('pdProcGravidade');
    const horaFato                   = _val('pdProcHoraFato').trim();
    const complemento                = _val('pdProcComplemento').trim();
    const possuiViolencia            = _checked('pdProcViolencia');
    const possuiLesao                = _checked('pdProcLesao');
    const possuiDanoPatrimonial      = _checked('pdProcDano');
    const possuiSubstanciaIlicita    = _checked('pdProcSubstancia');
    const possuiArmaOuObjetoPerigoso = _checked('pdProcObjeto');
    const exigeEncaminhamentoExterno = _checked('pdProcEncaminhamento');
    const orgaoEncaminhamento        = _val('pdProcOrgao') || null;

    if (exigeEncaminhamentoExterno && !orgaoEncaminhamento) {
      _showError('Selecione o órgão de encaminhamento externo.');
      return;
    }

    const classificacaoOcorrencia =
      natureza === 'ato_infracional'
        ? 'ato_infracional'
        : gravidade === 'grave' || gravidade === 'gravissima'
          ? 'indisciplina_grave'
          : gravidade === 'media'
            ? 'indisciplina_media'
            : 'indisciplina_leve';

    const dataFato = _val('pdProcDataFato').trim();
    if (!dataFato) {
      _showError('Informe a data do fato.');
      return;
    }

    let descricaoFato;

    if (_ctx.origem === 'notificacao') {
      /* Usa dados da notificação; complemento é acréscimo opcional */
      const base = _ctx.motivo || _ctx.observacao || 'Ocorrência registrada via notificação.';
      descricaoFato = (complemento && complemento !== base)
        ? `${base}\n\n${complemento}`
        : base;
    } else {
      /* Origem ficha_aluno — monta descrição a partir dos campos do formulário */
      const partes = [`Local: ${localFato}`];
      if (horaFato) partes.push(`Horário: ${horaFato}`);
      partes.push(`Natureza: ${natureza}`, `Gravidade: ${gravidade}`);
      if (complemento) partes.push(complemento);
      descricaoFato = partes.join('. ');
    }

    const payload = {
      aluno: _ctx.alunoId,
      natureza,
      classificacaoOcorrencia,
      gravidade,
      dataFato,
      horaFato,
      localFato,
      descricaoFato,
      providenciasImediatas:     complemento || '',
      possuiViolencia,
      possuiLesao,
      possuiDanoPatrimonial,
      possuiSubstanciaIlicita,
      possuiArmaOuObjetoPerigoso,
      exigeEncaminhamentoExterno,
      orgaoEncaminhamento,
      origem: _ctx.origem || 'ficha_aluno'
    };

    if (_ctx.origem === 'notificacao' && _ctx.notificacaoId) {
      payload.notificacaoId = _ctx.notificacaoId;
    }

    const btn = _el('pdBtnInstaurar');
    if (btn) { btn.disabled = true; btn.textContent = 'Aguarde...'; }

    try {
      const resp = await fetch('/api/processos-disciplinares', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await resp.json().catch(() => ({}));

      if (!resp.ok) {
        throw new Error(data?.message || data?.error || `Erro ${resp.status}`);
      }

      fechar();
      _showToast(`Procedimento ${data.numeroProcesso} criado com sucesso.`);

      const destino = new URL('/processos-disciplinares.html', global.location.origin);
      const t = _tenant();
      if (t) destino.searchParams.set('t', t);
      destino.searchParams.set('processo', data._id);
      global.location.href = destino.toString();

    } catch (e) {
      console.error('[PD] Erro ao criar processo:', e);
      _showError(e.message || 'Erro ao abrir procedimento disciplinar.');
      if (btn) { btn.disabled = false; btn.textContent = 'Instaurar procedimento'; }
    }
  }

  /* ----------------------------------------------------------
     API pública
  ---------------------------------------------------------- */
  global.abrirModalProcedimentoDisciplinar  = abrir;
  global.fecharModalProcedimentoDisciplinar = fechar;
  global._pdConfirmarProcedimento           = confirmar;

})(window);
