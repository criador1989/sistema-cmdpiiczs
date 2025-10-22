// models/Mensagem.js
const mongoose = require('mongoose');

const MensagemSchema = new mongoose.Schema(
  {
    remetente: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Usuario',
      required: true,
      index: true,
    },
    destinatario: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Usuario',
      required: true,
      index: true,
    },

    // Texto da mensagem (agora opcional se houver anexo)
    conteudo: {
      type: String,
      trim: true,
      set: v => (typeof v === 'string' ? v.trim() : v),
      validate: {
        validator: function (v) {
          // Só exige texto quando NÃO houver anexo
          return (v && v.length > 0) || !!this.anexoUrl;
        },
        message: 'Informe um texto ou um anexo.',
      },
    },

    // Anexo opcional
    anexoUrl: { type: String },   // ex: /uploads/mensagens/170000__arquivo.pdf
    anexoNome: { type: String },  // nome original
    anexoMime: { type: String },  // content-type

    lida: { type: Boolean, default: false },

    data: { type: Date, default: Date.now, index: true },

    // Multiescola
    instituicao: { type: String, required: true, index: true },
  },
  { timestamps: true }
);

// ======================================================
// ÍNDICES RECOMENDADOS
// ======================================================

// Conversas por instituição (permite filtros eficientes)
MensagemSchema.index(
  { instituicao: 1, remetente: 1, destinatario: 1, data: 1 }
);

// Novas mensagens não lidas (usado por /novas e notificações)
MensagemSchema.index(
  { instituicao: 1, destinatario: 1, lida: 1, data: 1 }
);

// ======================================================
// EXPORTAÇÃO
// ======================================================
module.exports = mongoose.model('Mensagem', MensagemSchema);
