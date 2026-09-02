'use strict';

let bancoTemas;
try {
  bancoTemas = require('../../data/temas_redacao_enem_v2.json');
} catch {
  bancoTemas = [
    {
      codigoBanco: 'AXR-FALLBACK-CIDADANIA-DIGITAL',
      titulo: 'Caminhos para proteger os dados pessoais de crianças e adolescentes no ambiente digital brasileiro',
      proposta: 'Redija um texto dissertativo-argumentativo, em modalidade escrita formal da língua portuguesa, sobre o tema “Caminhos para proteger os dados pessoais de crianças e adolescentes no ambiente digital brasileiro”, apresentando proposta de intervenção que respeite os direitos humanos.',
      eixoTematico: 'Tecnologia e direitos', palavrasChave: ['dados pessoais','privacidade','adolescentes'], textosMotivadores: [], tempoSugeridoMinutos: 70, minimoPalavras: 120, maximoPalavras: 450
    },
    {
      codigoBanco: 'AXR-FALLBACK-DESPERDICIO',
      titulo: 'Desafios para reduzir o desperdício de alimentos no Brasil',
      proposta: 'Redija um texto dissertativo-argumentativo, em modalidade escrita formal da língua portuguesa, sobre o tema “Desafios para reduzir o desperdício de alimentos no Brasil”, apresentando proposta de intervenção que respeite os direitos humanos.',
      eixoTematico: 'Meio ambiente e consumo', palavrasChave: ['desperdício','alimentos','consumo'], textosMotivadores: [], tempoSugeridoMinutos: 70, minimoPalavras: 120, maximoPalavras: 450
    },
    {
      codigoBanco: 'AXR-FALLBACK-PARTICIPACAO-JOVEM',
      titulo: 'Desafios para ampliar a participação social e política das juventudes brasileiras',
      proposta: 'Redija um texto dissertativo-argumentativo, em modalidade escrita formal da língua portuguesa, sobre o tema “Desafios para ampliar a participação social e política das juventudes brasileiras”, apresentando proposta de intervenção que respeite os direitos humanos.',
      eixoTematico: 'Cidadania e política', palavrasChave: ['juventude','participação','cidadania'], textosMotivadores: [], tempoSugeridoMinutos: 70, minimoPalavras: 120, maximoPalavras: 450
    }
  ];
}

function texto(v) { return String(v || '').trim(); }
function norm(v) {
  return texto(v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}
function tokens(v) {
  const stop = new Set(['para','como','entre','sobre','brasil','brasileiro','brasileira','brasileiros','brasileiras','desafios','caminhos','importancia','ampliar','promover','fortalecer']);
  return norm(v).split(/[^a-z0-9]+/).filter((x) => x.length >= 4 && !stop.has(x)).map((x) => x.endsWith('bullying') ? 'bullying' : x);
}
function similaridade(a, b) {
  const A = new Set(tokens(`${a?.titulo || ''} ${a?.eixoTematico || ''}`));
  const B = new Set(tokens(`${b?.titulo || ''} ${b?.eixoTematico || ''}`));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter += 1;
  return inter / Math.min(A.size, B.size);
}

function bancoElegivel() {
  return (Array.isArray(bancoTemas) ? bancoTemas : []).filter((tema) => {
    const codigo = texto(tema.codigoBanco).toUpperCase();
    if (!codigo) return false;
    if (codigo === 'AXR-TEMA-V2-AI_EDU') return false;
    if (codigo === 'AXR-TEMA-V2-REESCRITA') return false;
    return true;
  });
}

function selecionarTemasDoMes(data = new Date(), quantidade = 2, excluirCodigos = []) {
  const excluir = new Set((Array.isArray(excluirCodigos) ? excluirCodigos : []).map(texto));
  const pool = bancoElegivel().filter((tema) => !excluir.has(texto(tema.codigoBanco)));
  if (!pool.length) return [];
  const serialMes = data.getFullYear() * 12 + data.getMonth();
  const inicio = ((serialMes % pool.length) + pool.length) % pool.length;
  const ordenado = Array.from({ length: pool.length }, (_, i) => pool[(inicio + i) % pool.length]);
  const out = [];

  for (const item of ordenado) {
    if (out.some((x) => texto(x.codigoBanco) === texto(item.codigoBanco))) continue;
    // As duas propostas do mesmo mês devem variar de eixo/abordagem sempre que
    // o banco permitir, evitando combinações quase repetidas (ex.: bullying + cyberbullying).
    if (out.some((x) => similaridade(x, item) >= 0.16)) continue;
    out.push(item);
    if (out.length >= quantidade) return out;
  }

  for (const item of ordenado) {
    if (!out.some((x) => texto(x.codigoBanco) === texto(item.codigoBanco))) out.push(item);
    if (out.length >= quantidade) break;
  }
  return out;
}

module.exports = { bancoElegivel, selecionarTemasDoMes, similaridade };
