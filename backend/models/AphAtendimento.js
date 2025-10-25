// backend/models/AphAtendimento.js
const mongoose = require('mongoose');

const AphAtendimentoSchema = new mongoose.Schema(
  {
    alunoId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
      ref: 'Aluno', // opcional, só se você tiver o model Aluno
    },

    // Identificação & contexto
    responsavel: { type: String, trim: true, default: '' },
    local: { type: String, trim: true, default: '' },     // Sala, Pátio, etc.
    hora: { type: String, trim: true, default: '' },      // "14:35" (texto livre)

    // Seleções do formulário
    tipos: { type: [String], default: [] },               // ex: ["Arranhão / escoriação", "Queda"]
    materiais: { type: [String], default: [] },           // ex: ["Curativo simples", "Bolsa de gelo"]

    // Observações gerais
    observacoes: { type: String, trim: true, default: '' },

    // Comunicação
    responsaveisInformados: { type: String, trim: true, default: '' }, // "Sim" | "Não"
    meioComunicacao: { type: String, trim: true, default: '' },        // "WhatsApp" | "Telefone" | "Pessoalmente"
    encaminhamento: { type: String, trim: true, default: '' },         // hospital/posto etc.

    // Metadados
    criadoPor: { type: String, trim: true, default: '' }, // usuário do sistema (se desejar)
  },
  { timestamps: true, versionKey: false }
);

AphAtendimentoSchema.index({ alunoId: 1, createdAt: -1 });

module.exports = mongoose.model('AphAtendimento', AphAtendimentoSchema);
