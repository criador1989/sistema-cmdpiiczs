/* =====================================================
   procedimento-modal.js
   Abertura individual e coletiva de Procedimentos Disciplinares.

   Reutilizado por:
   - notificacoes.html
   - lista-alunos.html
   - ficha-aluno.html
   - processos-disciplinares.html

   API pública:
     window.abrirModalProcedimentoDisciplinar(contexto)
     window.fecharModalProcedimentoDisciplinar()

   O contexto pode trazer um aluno inicial ou ser aberto sem aluno:
   {
     origem: 'notificacao' | 'ficha_aluno' | 'lista_alunos' | 'processos',
     notificacaoId?,
     alunoId?, nomeAluno?, turma?,
     classificacaoOcorrencia?,
     possuiViolencia?, possuiLesao?, possuiDanoPatrimonial?,
     possuiSubstanciaIlicita?, possuiArmaOuObjetoPerigoso?,
     exigeEncaminhamentoExterno?, orgaoEncaminhamento?,
     data?, motivo?, observacao?
   }
===================================================== */
(function (global) {
  'use strict';

  const MODAL_ID = 'pdProcedimentoModal';
  const STYLES_ID = 'pdProcedimentoStyles';

  let _ctx = null;
  let _selecionados = new Map();
  let _buscaTimer = null;
  let _resultadosBusca = new Map();

  function _el(id) { return document.getElementById(id); }
  function _val(id) { return (_el(id) || {}).value || ''; }
  function _checked(id) { return !!(_el(id) || {}).checked; }
  function _set(id, val) { const e = _el(id); if (e) e.value = String(val ?? ''); }
  function _setCheck(id, v) { const e = _el(id); if (e) e.checked = !!v; }
  function _tenant() {
    return new URLSearchParams(global.location.search).get('t') || '';
  }
  function _todayISO(d) {
    const dt = d ? new Date(d) : new Date();
    if (isNaN(dt.getTime())) return _todayISO();
    const yyyy = dt.getFullYear();
    const mm = String(dt.getMonth() + 1).padStart(2, '0');
    const dd = String(dt.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }
  function _escape(v) {
    return String(v ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
  function _showToast(msg) {
    if (typeof global.showToast === 'function') return global.showToast(msg);
    if (typeof global.toast === 'function') return global.toast(msg, 'ok');
    console.log('[PD]', msg);
  }
  function _showError(msg) {
    if (typeof global.showError === 'function') return global.showError(msg);
    if (typeof global.toast === 'function') return global.toast(msg, 'err', 'Erro');
    alert(msg);
  }
  function _api(path) {
    const url = new URL(path, global.location.origin);
    const t = _tenant();
    if (t) url.searchParams.set('t', t);
    return url;
  }

  const CSS = `
#pdProcedimentoModal {
  position: fixed; inset: 0; display: none; align-items: center; justify-content: center;
  padding: 18px; background: rgba(5,10,20,.68); backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px); z-index: 9999;
}
#pdProcedimentoModal.is-open { display:flex; }
.pd-modal-card {
  width:min(820px,100%); max-height:92dvh; border-radius:22px;
  border:1px solid rgba(255,255,255,.14);
  background:radial-gradient(circle at top left,rgba(255,196,0,.08),transparent 38%),
             linear-gradient(180deg,rgba(18,28,46,.98),rgba(10,18,34,.98));
  box-shadow:0 24px 60px rgba(0,0,0,.42); overflow:hidden;
}
.pd-modal-head {
  display:flex; align-items:center; justify-content:space-between; gap:12px;
  padding:16px 18px; border-bottom:1px solid rgba(255,255,255,.10);
}
.pd-modal-title {font-size:1.05rem;font-weight:800;color:#ffe082;font-family:inherit;}
.pd-modal-close {
  border:1px solid rgba(255,255,255,.14); background:rgba(255,255,255,.06); color:#fff;
  width:38px;height:38px;border-radius:12px;cursor:pointer;font-size:1rem;flex-shrink:0;
}
.pd-modal-body {padding:18px;display:grid;gap:14px;overflow-y:auto;max-height:calc(92dvh - 72px);}
.pd-section {
  border:1px solid rgba(255,255,255,.10); border-radius:14px;
  background:rgba(255,255,255,.035); padding:13px; display:grid; gap:10px;
}
.pd-section-title {font-weight:800;color:#eaf1ff;font-size:.95rem;}
.pd-note {color:#b8c7e0;font-size:.88rem;line-height:1.45;}
.pd-grid2 {display:grid;grid-template-columns:1fr 1fr;gap:10px;}
.pd-grid3 {display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;}
.pd-modal-body input,.pd-modal-body select,.pd-modal-body textarea {
  width:100%;box-sizing:border-box;background:rgba(255,255,255,.06);
  border:1px solid rgba(255,255,255,.14);border-radius:10px;color:#ecf2ff;
  padding:9px 12px;font-size:.94rem;font-family:inherit;
}
.pd-modal-body select option {background:#101e36;color:#ecf2ff;}
.pd-modal-body textarea {min-height:82px;resize:vertical;}
.pd-checks {display:grid;grid-template-columns:1fr 1fr;gap:8px;}
.pd-checks label {display:flex;align-items:center;gap:8px;color:#ecf2ff;font-size:.9rem;cursor:pointer;}
.pd-checks input {width:auto;}
.pd-search-row {display:grid;grid-template-columns:1fr auto;gap:8px;}
.pd-search-results {display:grid;gap:7px;max-height:210px;overflow:auto;}
.pd-result,.pd-selected {
  border:1px solid rgba(255,255,255,.10);border-radius:11px;background:rgba(255,255,255,.04);
}
.pd-result {display:flex;justify-content:space-between;align-items:center;gap:10px;padding:9px 10px;}
.pd-result strong,.pd-selected strong {color:#fff;}
.pd-result small,.pd-selected small {color:#aebed8;}
.pd-mini-btn {
  border:1px solid rgba(255,196,0,.3);background:rgba(255,170,0,.12);color:#ffe082;
  border-radius:9px;padding:7px 10px;cursor:pointer;font-weight:700;
}
.pd-selected {padding:10px;display:grid;gap:9px;}
.pd-selected-head {display:flex;align-items:center;justify-content:space-between;gap:8px;}
.pd-selected-fields {display:grid;grid-template-columns:180px 1fr;gap:9px;}
.pd-remove {
  border:0;background:transparent;color:#ffb4b4;cursor:pointer;font-weight:800;padding:5px 7px;
}
.pd-count {
  display:inline-flex;align-items:center;justify-content:center;min-width:25px;height:25px;
  border-radius:999px;background:rgba(255,196,0,.16);color:#ffe082;font-weight:800;padding:0 8px;
}
.pd-btn-primary {
  border:1px solid rgba(255,196,0,.38);
  background:linear-gradient(135deg,rgba(255,170,0,.28),rgba(255,120,0,.24));
  color:#fff;border-radius:12px;padding:11px 16px;cursor:pointer;font-weight:800;
  font-size:.96rem;font-family:inherit;width:100%;
}
.pd-btn-primary:disabled {opacity:.55;cursor:not-allowed;}
.pd-hidden {display:none!important;}
@media(max-width:700px){
  #pdProcedimentoModal{padding:8px;align-items:flex-end}
  .pd-modal-card{border-radius:20px 20px 0 0;max-height:94dvh}
  .pd-grid2,.pd-grid3,.pd-checks,.pd-selected-fields{grid-template-columns:1fr}
}
`;

  const HTML = `
<div id="${MODAL_ID}" aria-hidden="true">
  <div class="pd-modal-card">
    <div class="pd-modal-head">
      <div class="pd-modal-title">⚖️ Abrir procedimento disciplinar</div>
      <button type="button" class="pd-modal-close" onclick="window.fecharModalProcedimentoDisciplinar()">✕</button>
    </div>
    <div class="pd-modal-body">

      <section class="pd-section">
        <div class="pd-section-title">
          Alunos com procedimento <span class="pd-count" id="pdQtdSelecionados">0</span>
        </div>
        <div class="pd-note">
          Selecione um aluno para abertura individual ou vários alunos quando o mesmo fato envolver um grupo.
          O relato geral será aproveitado em todos os procedimentos, sem perder o histórico individual.
          Adicione aqui somente estudantes para os quais haverá procedimento; vítimas ou testemunhas sem procedimento não precisam ser incluídas nesta seleção.
        </div>

        <div class="pd-search-row">
          <input id="pdBuscaAluno" placeholder="Pesquisar aluno por nome ou turma..." autocomplete="off" />
          <button type="button" class="pd-mini-btn" id="pdBtnBuscarAluno">Buscar</button>
        </div>
        <div id="pdBuscaResultados" class="pd-search-results"></div>
        <div id="pdSelecionados"></div>
      </section>

      <section class="pd-section">
        <div class="pd-section-title">Relato do fato</div>
        <textarea id="pdProcRelatoGeral" placeholder="Descreva o fato de forma objetiva. Este relato será comum aos alunos selecionados."></textarea>

        <div class="pd-grid3">
          <div>
            <div class="pd-note">Data do fato</div>
            <input id="pdProcDataFato" type="date" />
          </div>
          <div>
            <div class="pd-note">Horário aproximado</div>
            <input id="pdProcHoraFato" placeholder="Ex.: 09:30" />
          </div>
          <div>
            <div class="pd-note">Local</div>
            <input id="pdProcLocalFato" placeholder="Sala, pátio, corredor..." />
          </div>
        </div>

        <textarea id="pdProcProvidencias" placeholder="Providências imediatas adotadas, se houver."></textarea>
      </section>

      <section class="pd-section">
        <div class="pd-section-title">Classificação e marcadores</div>
        <div class="pd-grid2">
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
        </div>

        <div class="pd-checks">
          <label><input type="checkbox" id="pdProcViolencia"> Houve violência</label>
          <label><input type="checkbox" id="pdProcLesao"> Houve lesão</label>
          <label><input type="checkbox" id="pdProcDano"> Houve dano patrimonial</label>
          <label><input type="checkbox" id="pdProcSubstancia"> Envolveu substância ilícita</label>
          <label><input type="checkbox" id="pdProcObjeto"> Envolveu arma ou objeto perigoso</label>
          <label><input type="checkbox" id="pdProcEncaminhamento"> Exige encaminhamento externo</label>
        </div>

        <select id="pdProcOrgao" class="pd-hidden">
          <option value="">Selecione o órgão</option>
          <option value="conselho_tutelar">Conselho Tutelar</option>
          <option value="delegacia">Delegacia</option>
          <option value="ministerio_publico">Ministério Público</option>
          <option value="judiciario">Judiciário</option>
        </select>
      </section>

      <button class="pd-btn-primary" id="pdBtnInstaurar" type="button">
        Instaurar procedimento
      </button>
    </div>
  </div>
</div>`;

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
        _el('pdProcOrgao')?.classList.toggle('pd-hidden', !this.checked);
      });

      _el('pdBuscaAluno')?.addEventListener('input', () => {
        clearTimeout(_buscaTimer);
        _buscaTimer = setTimeout(_buscarAlunos, 350);
      });

      _el('pdBuscaAluno')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          _buscarAlunos();
        }
      });

      _el('pdBtnBuscarAluno')?.addEventListener('click', _buscarAlunos);
      _el('pdBtnInstaurar')?.addEventListener('click', _confirmar);
    }
  }

  function _adicionarAluno(aluno, opts = {}) {
    const id = String(aluno?._id || aluno?.id || aluno?.alunoId || '').trim();
    if (!id || _selecionados.has(id)) return;

    _selecionados.set(id, {
      id,
      nome: aluno?.nome || aluno?.nomeAluno || 'Aluno',
      turma: aluno?.turma || '',
      papel: opts.papel || 'autor',
      observacao: opts.observacao || '',
      obrigatorio: !!opts.obrigatorio
    });

    _renderSelecionados();
  }

  function _removerAluno(id) {
    const item = _selecionados.get(String(id));
    if (item?.obrigatorio) {
      _showError('O aluno que originou a notificação precisa permanecer na ocorrência.');
      return;
    }
    _selecionados.delete(String(id));
    _renderSelecionados();
  }

  function _atualizarAluno(id, campo, valor) {
    const item = _selecionados.get(String(id));
    if (!item) return;
    item[campo] = valor;
    _selecionados.set(String(id), item);
  }

  function _renderSelecionados() {
    const box = _el('pdSelecionados');
    const qtd = _el('pdQtdSelecionados');
    if (!box || !qtd) return;

    qtd.textContent = String(_selecionados.size);

    if (!_selecionados.size) {
      box.innerHTML = `<div class="pd-note">Nenhum aluno selecionado.</div>`;
      return;
    }

    box.innerHTML = Array.from(_selecionados.values()).map(item => `
      <div class="pd-selected">
        <div class="pd-selected-head">
          <div>
            <strong>${_escape(item.nome)}</strong>
            <small> • ${_escape(item.turma || 'Turma não informada')}</small>
          </div>
          <button type="button" class="pd-remove"
            onclick="window._pdRemoverAluno('${_escape(item.id)}')"
            ${item.obrigatorio ? 'title="Aluno de origem da notificação"' : ''}>
            ${item.obrigatorio ? '🔒' : 'Remover'}
          </button>
        </div>
        <div class="pd-selected-fields">
          <select onchange="window._pdAtualizarAluno('${_escape(item.id)}','papel',this.value)">
            <option value="autor" ${item.papel === 'autor' ? 'selected' : ''}>Autor / participante da conduta</option>
            <option value="vitima" ${item.papel === 'vitima' ? 'selected' : ''}>Vítima</option>
            <option value="testemunha" ${item.papel === 'testemunha' ? 'selected' : ''}>Testemunha</option>
            <option value="outro" ${item.papel === 'outro' ? 'selected' : ''}>Outro envolvimento</option>
          </select>
          <textarea
            placeholder="Complemento individual deste aluno (opcional)"
            oninput="window._pdAtualizarAluno('${_escape(item.id)}','observacao',this.value)">${_escape(item.observacao || '')}</textarea>
        </div>
      </div>
    `).join('');
  }

  async function _buscarAlunos() {
    const q = _val('pdBuscaAluno').trim();
    const box = _el('pdBuscaResultados');
    if (!box) return;

    if (q.length < 2) {
      box.innerHTML = `<div class="pd-note">Digite pelo menos 2 caracteres.</div>`;
      return;
    }

    box.innerHTML = `<div class="pd-note">Buscando...</div>`;

    try {
      const url = _api('/api/alunos/busca');
      url.searchParams.set('q', q);
      url.searchParams.set('limit', '20');

      const resp = await fetch(url.toString(), {
        credentials: 'include',
        cache: 'no-store'
      });
      const data = await resp.json().catch(() => ({}));

      if (!resp.ok) {
        throw new Error(data?.message || `Erro ${resp.status}`);
      }

      const itens = Array.isArray(data?.items) ? data.items : [];

      if (!itens.length) {
        box.innerHTML = `<div class="pd-note">Nenhum aluno encontrado.</div>`;
        return;
      }

      _resultadosBusca = new Map(
        itens.map(a => [String(a._id), a])
      );

      box.innerHTML = itens.map(a => {
        const id = String(a._id);
        const ja = _selecionados.has(id);
        return `
          <div class="pd-result">
            <div>
              <strong>${_escape(a.nome)}</strong>
              <small> • ${_escape(a.turma || 'Sem turma')}</small>
            </div>
            <button type="button" class="pd-mini-btn"
              ${ja ? 'disabled' : ''}
              onclick="window._pdAdicionarAlunoBusca('${id}')">
              ${ja ? 'Selecionado' : 'Adicionar'}
            </button>
          </div>`;
      }).join('');
    } catch (e) {
      console.error('[PD][BUSCA_ALUNO]', e);
      box.innerHTML = `<div class="pd-note">Não foi possível pesquisar alunos.</div>`;
    }
  }

  function _abrir(contexto = {}) {
    _inject();
    _ctx = contexto || {};
    _selecionados = new Map();

    if (_ctx.alunoId) {
      _adicionarAluno({
        _id: _ctx.alunoId,
        nome: _ctx.nomeAluno || 'Aluno',
        turma: _ctx.turma || ''
      }, {
        papel: 'autor',
        obrigatorio: _ctx.origem === 'notificacao'
      });
    } else {
      _renderSelecionados();
    }

    _set('pdBuscaAluno', '');
    _resultadosBusca = new Map();
    if (_el('pdBuscaResultados')) _el('pdBuscaResultados').innerHTML = '';

    const relatoOrigem =
      _ctx.origem === 'notificacao'
        ? (_ctx.motivo || _ctx.observacao || '')
        : '';

    _set('pdProcRelatoGeral', relatoOrigem);
    _set('pdProcProvidencias', '');
    _set('pdProcLocalFato', '');
    _set('pdProcHoraFato', '');
    _set('pdProcDataFato', _todayISO(_ctx.data));

    const nat = _ctx.classificacaoOcorrencia === 'ato_infracional'
      ? 'ato_infracional'
      : 'indisciplina';

    const grav = _ctx.classificacaoOcorrencia === 'ato_infracional'
      ? 'grave'
      : 'media';

    _set('pdProcNatureza', nat);
    _set('pdProcGravidade', grav);
    _setCheck('pdProcViolencia', !!_ctx.possuiViolencia);
    _setCheck('pdProcLesao', !!_ctx.possuiLesao);
    _setCheck('pdProcDano', !!_ctx.possuiDanoPatrimonial);
    _setCheck('pdProcSubstancia', !!_ctx.possuiSubstanciaIlicita);
    _setCheck('pdProcObjeto', !!_ctx.possuiArmaOuObjetoPerigoso);
    _setCheck('pdProcEncaminhamento', !!_ctx.exigeEncaminhamentoExterno);

    const org = _el('pdProcOrgao');
    if (org) {
      org.value = _ctx.orgaoEncaminhamento || '';
      org.classList.toggle('pd-hidden', !_ctx.exigeEncaminhamentoExterno);
    }

    const btn = _el('pdBtnInstaurar');
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Instaurar procedimento';
    }

    const modal = _el(MODAL_ID);
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';

    setTimeout(() => {
      if (!_selecionados.size) _el('pdBuscaAluno')?.focus();
      else _el('pdProcRelatoGeral')?.focus();
    }, 50);
  }

  function _fechar() {
    const modal = _el(MODAL_ID);
    if (modal) {
      modal.classList.remove('is-open');
      modal.setAttribute('aria-hidden', 'true');
    }
    document.body.style.overflow = '';
    _ctx = null;
    _selecionados = new Map();
  }

  async function _confirmar() {
    const alunos = Array.from(_selecionados.values());

    if (!alunos.length) {
      _showError('Selecione pelo menos um aluno.');
      return;
    }

    const descricaoFato = _val('pdProcRelatoGeral').trim();
    const dataFato = _val('pdProcDataFato').trim();
    const localFato = _val('pdProcLocalFato').trim();
    const horaFato = _val('pdProcHoraFato').trim();
    const providenciasImediatas = _val('pdProcProvidencias').trim();
    const natureza = _val('pdProcNatureza');
    const gravidade = _val('pdProcGravidade');

    if (!descricaoFato) {
      _showError('Informe o relato do fato.');
      return;
    }
    if (!dataFato) {
      _showError('Informe a data do fato.');
      return;
    }
    if (!localFato) {
      _showError('Informe o local do fato.');
      return;
    }

    const possuiViolencia = _checked('pdProcViolencia');
    const possuiLesao = _checked('pdProcLesao');
    const possuiDanoPatrimonial = _checked('pdProcDano');
    const possuiSubstanciaIlicita = _checked('pdProcSubstancia');
    const possuiArmaOuObjetoPerigoso = _checked('pdProcObjeto');
    const exigeEncaminhamentoExterno = _checked('pdProcEncaminhamento');
    const orgaoEncaminhamento = _val('pdProcOrgao') || null;

    if (exigeEncaminhamentoExterno && !orgaoEncaminhamento) {
      _showError('Selecione o órgão de encaminhamento externo.');
      return;
    }

    const classificacaoOcorrencia =
      natureza === 'ato_infracional'
        ? 'ato_infracional'
        : (gravidade === 'grave' || gravidade === 'gravissima')
          ? 'indisciplina_grave'
          : gravidade === 'media'
            ? 'indisciplina_media'
            : 'indisciplina_leve';

    const base = {
      natureza,
      classificacaoOcorrencia,
      gravidade,
      dataFato,
      horaFato,
      localFato,
      descricaoFato,
      providenciasImediatas,
      possuiViolencia,
      possuiLesao,
      possuiDanoPatrimonial,
      possuiSubstanciaIlicita,
      possuiArmaOuObjetoPerigoso,
      exigeEncaminhamentoExterno,
      orgaoEncaminhamento,
      origem: _ctx?.origem || 'processos'
    };

    if (_ctx?.origem === 'notificacao' && _ctx?.notificacaoId) {
      base.notificacaoId = _ctx.notificacaoId;
    }

    const btn = _el('pdBtnInstaurar');
    if (btn) {
      btn.disabled = true;
      btn.textContent = alunos.length > 1
        ? `Criando ${alunos.length} procedimentos...`
        : 'Criando procedimento...';
    }

    try {
      let url;
      let payload;

      if (alunos.length > 1) {
        url = _api('/api/processos-disciplinares/lote');
        payload = {
          ...base,
          alunos: alunos.map(a => ({
            aluno: a.id,
            papel: a.papel || 'autor',
            observacao: a.observacao || ''
          }))
        };
      } else {
        const a = alunos[0];
        url = _api('/api/processos-disciplinares');
        payload = {
          ...base,
          aluno: a.id
        };

        if (a.observacao) {
          payload.descricaoFato = `${descricaoFato}\n\nComplemento individual: ${a.observacao}`;
          payload.providenciasImediatas = providenciasImediatas;
        }
      }

      const resp = await fetch(url.toString(), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await resp.json().catch(() => ({}));

      if (!resp.ok) {
        throw new Error(data?.message || data?.error || `Erro ${resp.status}`);
      }

      _fechar();

      let processoId = null;

      if (alunos.length > 1) {
        _showToast(
          `${data.total || alunos.length} procedimentos criados na ocorrência ${data.ocorrenciaColetivaCodigo || 'coletiva'}.`
        );
        processoId = data?.processos?.[0]?._id || null;
      } else {
        _showToast(`Procedimento ${data.numeroProcesso || ''} criado com sucesso.`);
        processoId = data?._id || null;
      }

      const destino = new URL('/processos-disciplinares.html', global.location.origin);
      const t = _tenant();
      if (t) destino.searchParams.set('t', t);
      if (processoId) destino.searchParams.set('processo', processoId);
      if (data?.ocorrenciaColetivaId) {
        destino.searchParams.set('grupo', data.ocorrenciaColetivaId);
      }
      global.location.href = destino.toString();

    } catch (e) {
      console.error('[PD] Erro ao criar procedimento:', e);
      _showError(e.message || 'Erro ao abrir procedimento disciplinar.');
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Instaurar procedimento';
      }
    }
  }

  global.abrirModalProcedimentoDisciplinar = _abrir;
  global.fecharModalProcedimentoDisciplinar = _fechar;

  global._pdAdicionarAlunoBusca = function (id) {
    const aluno = _resultadosBusca.get(String(id));
    if (!aluno) return;
    _adicionarAluno(aluno);
    _buscarAlunos();
  };
  global._pdRemoverAluno = _removerAluno;
  global._pdAtualizarAluno = _atualizarAluno;

})(window);
