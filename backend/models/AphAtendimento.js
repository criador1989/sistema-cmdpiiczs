const mongoose = require('mongoose');

const AphAtendimentoSchema = new mongoose.Schema(
  {
    instituicao: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },

    alunoId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
      ref: 'Aluno',
    },

    // Identificação & contexto
    responsavel: { type: String, trim: true, default: '' },
    local: { type: String, trim: true, default: '' },
    hora: { type: String, trim: true, default: '' },
    data: { type: Date, default: Date.now },

    // Seleções do formulário
    tipos: { type: [String], default: [] },
    materiais: { type: [String], default: [] },

    // Campos livres (compat com versões anteriores)
    sinaisESintomas: { type: String, trim: true, default: '' },
    procedimentos:   { type: String, trim: true, default: '' },
    observacoes:     { type: String, trim: true, default: '' },
    observacao:      { type: String, trim: true, default: '' }, // legado

    // Comunicação com responsáveis
    responsaveisInformados: { type: String, enum: ['Sim', 'Não'], default: 'Não' },
    meioComunicacao: { type: String, trim: true, default: '' },

    // Encaminhamento
    houveEncaminhamento: { type: Boolean, default: false },
    encaminhamento: { type: String, trim: true, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.models.AphAtendimento || mongoose.model('AphAtendimento', AphAtendimentoSchema);
