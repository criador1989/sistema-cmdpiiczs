// backend/public/cadastroMedidaDisciplinar.js

// Utilidades
function toNumberSafe(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
function round2(n) {
  return Number(toNumberSafe(n).toFixed(2));
}

// Carrega alunos no <select>
async function carregarAlunos() {
  try {
    const resposta = await fetch('/api/alunos', { credentials: 'include' });
    if (!resposta.ok) throw new Error('Falha ao carregar alunos');
    const alunos = await resposta.json();

    const select = document.getElementById('aluno');
    select.innerHTML = '<option value="">Selecione...</option>';
    alunos.forEach(a => {
      const option = document.createElement('option');
      option.value = a._id;
      option.textContent = `${a.nome} - Turma ${a.turma}`;
      select.appendChild(option);
    });
  } catch (erro) {
    console.error('Erro ao carregar alunos:', erro);
    alert('Erro ao carregar alunos. Recarregue a página.');
  }
}

// Mostra/esconde campo de dias conforme a medida
document.getElementById('tipoMedida').addEventListener('change', function () {
  const campoDias = document.getElementById('campoDias');
  const tipo = this.value;
  if (tipo === 'A.I.A' || tipo === 'A.E.C.D.E') {
    campoDias.style.display = 'block';
  } else {
    campoDias.style.display = 'none';
    document.getElementById('quantidadeDias').value = '';
  }
});

// Mapeamentos (espelham o backend)
const MAPA_NEGATIVOS = {
  'Advertência Escrita': -0.30,
  'Repreensão': -0.50,
  'A.E.C.D.E': -0.70, // por dia
  'A.I.A': -1.20      // por dia
};
const MAPA_ELOGIOS = {
  // chaves do backend: tipoElogio
  elogioVerbal: 0.15,
  boletimInternoIndividual: 0.60,
  boletimInternoColetivo: 0.20,
  mediaAlta: 0.40
};
// Para o <select> atual de "tipoMedida", quando for elogio, mapeia para tipoElogio do backend
const MAPA_LABEL_ELOGIO_PARA_TIPO = {
  'Elogio Verbal': 'elogioVerbal',
  'Elogio Individual': 'boletimInternoIndividual',
  'Elogio Coletivo': 'boletimInternoColetivo',
  'Média ≥ 8,5': 'mediaAlta'
};

// Envio do formulário
document.getElementById('formNotificacao').addEventListener('submit', async function (e) {
  e.preventDefault();

  const aluno = document.getElementById('aluno').value;
  const motivo = document.getElementById('motivo').value;
  const tipo = document.getElementById('tipo').value; // compatibilidade, se existir no HTML
  const tipoMedida = document.getElementById('tipoMedida').value;
  const data = document.getElementById('data').value;
  const observacao = document.getElementById('observacao').value;
  const quantidadeDiasInput = document.getElementById('quantidadeDias').value;

  // Campos de regulamento (se existirem)
  const artigo = document.getElementById('artigo')?.value ?? null;
  const inciso = document.getElementById('inciso')?.value ?? null;
  const classificacaoRegulamento = document.getElementById('classificacaoRegulamento')?.value ?? null;

  // Normalização de dias
  let quantidadeDias = toNumberSafe(quantidadeDiasInput, 1);
  if (!Number.isInteger(quantidadeDias) || quantidadeDias < 1) quantidadeDias = 1;

  // Decidir natureza e valor
  let natureza = 'indisciplina'; // padrão
  let tipoElogio = null;
  let valorNumerico = 0;

  // Caso seja um dos elogios disponíveis no select, tratamos como 'elogio'
  if (MAPA_LABEL_ELOGIO_PARA_TIPO[tipoMedida]) {
    natureza = 'elogio';
    tipoElogio = MAPA_LABEL_ELOGIO_PARA_TIPO[tipoMedida];
    valorNumerico = round2(MAPA_ELOGIOS[tipoElogio] || 0);
    // Para elogio, dias não se aplicam
    quantidadeDias = null;
  } else {
    // Medidas negativas
    const base = MAPA_NEGATIVOS[tipoMedida] || 0;
    const precisaDias = (tipoMedida === 'A.E.C.D.E' || tipoMedida === 'A.I.A');
    const dias = precisaDias ? quantidadeDias : 1;
    valorNumerico = round2(base * dias);
  }

  // Montagem do payload
  const payload = {
    aluno,
    motivo,
    tipo,                 // compat
    tipoMedida,           // para o backend identificar a medida
    valorNumerico,        // mantido por compatibilidade (o backend recalcula negativos)
    data,
    observacao,
    quantidadeDias: quantidadeDias ?? 1,
    artigo,
    inciso,
    classificacaoRegulamento,
    natureza,             // chave para o backend escolher fluxo
    tipoElogio            // quando natureza === 'elogio'
  };

  // Validações básicas
  if (!aluno) return alert('Selecione o aluno.');
  if (!tipoMedida) return alert('Selecione a medida/elogio.');
  if (!data) return alert('Informe a data.');

  try {
    const resposta = await fetch('/api/notificacoes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload)
    });

    if (resposta.ok) {
      alert('Notificação salva com sucesso!');
      window.location.href = '/painel.html';
    } else {
      const erro = await resposta.json().catch(() => ({}));
      console.error('Falha ao salvar:', erro);
      alert(erro?.error || 'Erro ao salvar notificação.');
    }
  } catch (err) {
    console.error('Erro ao enviar notificação:', err);
    alert('Erro ao enviar notificação. Verifique sua conexão e tente novamente.');
  }
});

// Inicialização
carregarAlunos();
