const mongoose = require('mongoose');

const bailePagamentoSchema = new mongoose.Schema(
  {
    dataPagamento: {
      type: Date,
      default: Date.now,
    },

    valor: {
      type: Number,
      required: true,
      min: 0,
    },

    formaPagamento: {
      type: String,
      enum: ['pix', 'dinheiro', 'misto', 'outro'],
      default: 'pix',
    },

    referenciaParcela: {
      type: String,
      default: '',
      trim: true,
      // Exemplo: "1/8", "2/8", "pagamento parcial", etc.
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

    observacao: {
      type: String,
      default: '',
      trim: true,
    },

    registradoPor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Usuario',
      default: null,
    },

    registradoPorNome: {
      type: String,
      default: '',
      trim: true,
    },
  },
  { timestamps: true }
);

const baileParcelaSchema = new mongoose.Schema(
  {
    numero: {
      type: Number,
      required: true,
    },

    vencimento: {
      type: Date,
      required: true,
    },

    valorPrevisto: {
      type: Number,
      required: true,
      min: 0,
    },

    valorPago: {
      type: Number,
      default: 0,
      min: 0,
    },

    status: {
      type: String,
      enum: ['pendente', 'parcial', 'paga', 'atrasada'],
      default: 'pendente',
    },
  },
  { _id: false }
);

const baileContratoSchema = new mongoose.Schema(
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

    aluno: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Aluno',
      required: true,
      index: true,
    },

    alunoNome: {
      type: String,
      required: true,
      trim: true,
    },

    turma: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },

    responsavelNome: {
      type: String,
      default: '',
      trim: true,
    },

    responsavelCpf: {
      type: String,
      default: '',
      trim: true,
    },

    responsavelTelefone: {
      type: String,
      default: '',
      trim: true,
    },

    aderiu: {
      type: Boolean,
      default: true,
    },

    quantidadeIngressos: {
      type: Number,
      required: true,
      min: 1,
      max: 6,
      default: 1,
    },

    valorUnitario: {
      type: Number,
      required: true,
      default: 150,
      min: 0,
    },

    valorTotal: {
      type: Number,
      required: true,
      default: 150,
      min: 0,
    },

    quantidadeParcelas: {
      type: Number,
      min: 1,
      max: 8,
      default: 8,
    },

    dataAdesao: {
      type: Date,
      default: Date.now,
    },

    contratoAssinado: {
      type: Boolean,
      default: false,
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

    pagamentos: [bailePagamentoSchema],

    parcelas: [baileParcelaSchema],

    status: {
      type: String,
      enum: [
        'em_aberto',
        'em_dia',
        'atrasado',
        'quitado',
        'desistente',
        'cancelado',
      ],
      default: 'em_aberto',
      index: true,
    },

    dataDesistencia: {
      type: Date,
      default: null,
    },

    motivoDesistencia: {
      type: String,
      default: '',
      trim: true,
    },

    valorDevolucaoPrevisto: {
      type: Number,
      default: 0,
      min: 0,
    },

    observacoes: {
      type: String,
      default: '',
      trim: true,
    },

    historicoCorrecoes: [
      {
        data: {
          type: Date,
          default: Date.now,
        },
        campo: String,
        valorAnterior: mongoose.Schema.Types.Mixed,
        valorNovo: mongoose.Schema.Types.Mixed,
        motivo: String,
        usuario: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Usuario',
          default: null,
        },
        usuarioNome: {
          type: String,
          default: '',
        },
      },
    ],

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
  { timestamps: true }
);

baileContratoSchema.index(
  { instituicao: 1, anoLetivo: 1, aluno: 1 },
  { unique: true }
);

baileContratoSchema.pre('validate', function (next) {
  this.valorTotal =
    Number(this.quantidadeIngressos || 0) * Number(this.valorUnitario || 0);

  next();
});

baileContratoSchema.methods.calcularResumoFinanceiro = function () {
  const totalPago = (this.pagamentos || []).reduce((acc, pg) => {
    return acc + Number(pg.valor || 0);
  }, 0);

  const valorPendente = Math.max(Number(this.valorTotal || 0) - totalPago, 0);

  return {
    valorTotal: Number(this.valorTotal || 0),
    totalPago,
    valorPendente,
  };
};

baileContratoSchema.methods.atualizarStatusFinanceiro = function () {
  if (['desistente', 'cancelado'].includes(this.status)) {
    return;
  }

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  const resumo = this.calcularResumoFinanceiro();

  if (resumo.valorPendente <= 0) {
    this.status = 'quitado';
  } else {
    const possuiParcelaAtrasada = (this.parcelas || []).some((p) => {
      if (['paga'].includes(p.status)) return false;

      const venc = new Date(p.vencimento);
      venc.setHours(0, 0, 0, 0);

      return venc < hoje;
    });

    this.status = possuiParcelaAtrasada ? 'atrasado' : 'em_dia';
  }
};

module.exports = mongoose.model('BaileContrato', baileContratoSchema);
module.exports =
  mongoose.models.BaileContrato ||
  mongoose.model('BaileContrato', baileContratoSchema);