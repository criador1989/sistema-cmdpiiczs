(() => {
  'use strict';
  const esc = (v) => String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
  const labels = {
    categoria:{comportamento:'Comportamento',participacao_pedagogica:'Participação pedagógica',convivencia:'Convivência',seguranca:'Segurança',atividade:'Atividade',elogio:'Elogio',outro:'Outro'},
    status:{nova:'Nova',lida:'Lida',em_atendimento:'Em atendimento',resolvida:'Resolvida',arquivada:'Arquivada'},
    prioridade:{normal:'Normal',atencao:'Atenção',urgente:'Urgente'}
  };
  const dataHora = (v) => { const d = new Date(v); return !v || Number.isNaN(d.getTime()) ? 'Data não informada' : new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(d); };
  async function getJson(url){ const r=await fetch(url,{credentials:'include',cache:'no-store',headers:{Accept:'application/json'}}); const p=await r.json().catch(()=>({})); if(!r.ok){const e=new Error(p.mensagem||'Não foi possível carregar.');e.status=r.status;throw e;} return p; }
  function render(payload, tipo){
    const card=document.getElementById('professorObservationsCard'); const list=document.getElementById('observacoesProfessoresFicha'); const count=document.getElementById('profObsFichaCount'); const help=document.getElementById('profObsFichaHelp');
    const itens=Array.isArray(payload.observacoes)?payload.observacoes:[]; card.hidden=false; count.textContent=`${itens.length} ${itens.length===1?'registro':'registros'}`;
    help.textContent = tipo === 'professor' ? 'Nesta visualização aparecem somente as observações registradas por você.' : 'Registros enviados pelos professores, separados das observações institucionais e das notificações disciplinares.';
    if(!itens.length){list.innerHTML='<div class="professor-observations-empty">Nenhuma observação de professor registrada para este aluno.</div>';return;}
    list.innerHTML=itens.map(item=>{
      const follow=item.resolucao?.nota?`<div class="professor-observation-followup"><b>Encaminhamento:</b> ${esc(item.resolucao.nota)}</div>`:item.atendimento?.nome?`<div class="professor-observation-followup">Em atendimento por <b>${esc(item.atendimento.nome)}</b>.</div>`:'';
      const action=tipo==='admin'?`<a class="professor-observation-action" href="/painel.html?observacaoProfessor=${encodeURIComponent(item._id)}">Abrir acompanhamento</a>`:'';
      return `<article class="professor-observation-item ${esc(item.prioridade)} ${item.categoria==='elogio'?'elogio':''}">
        <div class="professor-observation-top"><div><div class="professor-observation-name">${esc(item.professorNome)}${item.componenteCurricular?` • ${esc(item.componenteCurricular)}`:''}</div><div class="professor-observation-meta">${esc(labels.categoria[item.categoria]||item.categoria)} • ${esc(labels.prioridade[item.prioridade]||item.prioridade)} • ${esc(dataHora(item.createdAt))}</div></div><span class="professor-observation-status">${esc(labels.status[item.status]||item.status)}</span></div>
        <div class="professor-observation-text">${esc(item.texto)}</div>${follow}${action}
      </article>`;
    }).join('');
  }
  async function iniciar(){
    const card=document.getElementById('professorObservationsCard'); if(!card)return;
    const alunoId=new URLSearchParams(location.search).get('id'); if(!alunoId)return;
    try{
      const usuario=await getJson('/api/usuario-logado'); const tipo=String(usuario.tipo||'').toLowerCase();
      if(!['professor','admin','master','superadmin'].includes(tipo))return;
      const payload=await getJson(`/api/observacoes-professores/aluno/${encodeURIComponent(alunoId)}`);
      render(payload,tipo==='professor'?'professor':'admin');
    }catch(error){
      if([401,403,404].includes(error.status)){card.hidden=true;return;}
      card.hidden=false;document.getElementById('observacoesProfessoresFicha').innerHTML=`<div class="professor-observations-empty">${esc(error.message)}</div>`;
    }
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',iniciar,{once:true});else iniciar();
})();
