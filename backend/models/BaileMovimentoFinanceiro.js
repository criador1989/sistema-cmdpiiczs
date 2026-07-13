const mongoose = require('mongoose');

const baileMovimentoFinanceiroSchema = new mongoose.Schema(
  {
    instituicao: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Instituicao',
      required: true,
      index: true,
    },

    anoLetivo: {
      type: Number,
      required: true,
      default: 2026,
      index: true,
    },

    evento: {
      type: String,
      default: 'Baile de Formatura 3ª Série do Ensino Médio',
      trim: true,
    },

    tipo: {
      type: String,
      enum: ['entrada', 'saida'],
      required: true,
      index: true,
    },

    origem: {
      type: String,
      enum: [
        'aluno',
        'entrada_avulsa',
        'patrocinio',
        'doacao',
        'rifa',
        'fornecedor',
        'ajuste',
        'outro',
      ],
      default: 'outro',
      index: true,
    },

    categoria: {
      type: String,
      default: '',
      trim: true,
      index: true,
    },

    descricao: {
      type: String,
      required: true,
      trim: true,
    },

    pessoaNome: {
      type: String,
      default: '',
      trim: true,
    },

    pessoaTelefone: {
      type: String,
      default: '',
      trim: true,
    },

    valorPrevisto: {
      type: Number,
      default: 0,
      min: 0,
    },

    valorPago: {
      type: Number,
      default: 0,
      min: 0,
    },

    valorPendente: {
      type: Number,
      default: 0,
      min: 0,
    },

    dataVencimento: {
      type: Date,
      default: null,
    },

    dataPagamento: {
      type: Date,
      default: null,
    },

    formaPagamento: {
      type: String,
      enum: ['pix', 'dinheiro', 'transferencia', 'misto', 'outro'],
      default: 'pix',
    },

    status: {
      type: String,
      enum: ['pendente', 'parcial', 'pago', 'cancelado'],
      default: 'pendente',
      index: true,
    },

    comprovanteUrl: {
      type: String,
      default: '',
      trim: true,
    },

    comprovanteKey: {
      type: String,
      default: '',
      trim: true,
    },

    contratoUrl: {
      type: String,
      default: '',
      trim: true,
    },

    contratoKey: {
      type: String,
      default: '',
      trim: true,
    },

    observacoes: {
      type: String,
      default: '',
      trim: true,
    },

    criadoPor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Usuario',
      default: null,
    },

    criadoPorNome: {
      type: String,
      default: '',
      trim: true,
    },

    atualizadoPor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Usuario',
      default: null,
    },

    atualizadoPorNome: {
      type: String,
      default: '',
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

baileMovimentoFinanceiroSchema.pre('save', function (next) {
  const previsto = Number(this.valorPrevisto || 0);
  const pago = Number(this.valorPago || 0);

  this.valorPendente = Math.max(previsto - pago, 0);

  if (this.status !== 'cancelado') {
    if (pago <= 0) {
      this.status = 'pendente';
    } else if (pago >= previsto) {
      this.status = 'pago';
    } else {
      this.status = 'parcial';
    }
  }

  next();
});

baileMovimentoFinanceiroSchema.methods.resumo = function () {
  const obj = this.toObject();

  return {
    ...obj,
    atrasado:
      obj.status !== 'pago' &&
      obj.dataVencimento &&
      new Date(obj.dataVencimento) < new Date(),
  };
};

module.exports =
  mongoose.models.BaileMovimentoFinanceiro ||
  mongoose.model(
    'BaileMovimentoFinanceiro',
    baileMovimentoFinanceiroSchema
  );