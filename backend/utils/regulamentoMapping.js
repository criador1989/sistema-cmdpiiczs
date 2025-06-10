const regulamentoMapeado = [
  {
    motivo: "Portar objeto perigoso sem autorização",
    artigo: "Art. 27",
    inciso: "XXI",
    classificacao: "Gravíssimo"
  },
  {
    motivo: "Ato de desrespeito à autoridade escolar",
    artigo: "Art. 27",
    inciso: "XII",
    classificacao: "Grave"
  },
  {
    motivo: "Uso de aparelho eletrônico em sala de aula",
    artigo: "Art. 26",
    inciso: "VI",
    classificacao: "Médio"
  },
  {
    motivo: "Descumprimento do uniforme",
    artigo: "Art. 26",
    inciso: "I",
    classificacao: "Leve"
  }
  // ... Adicione todos os outros motivos extraídos do regulamento
];

function buscarDadosRegulamento(motivoInformado) {
  return regulamentoMapeado.find(entry => entry.motivo === motivoInformado);
}

module.exports = buscarDadosRegulamento; // Para uso no backend
