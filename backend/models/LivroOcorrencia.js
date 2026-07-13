const mongoose = require("mongoose");

const MovimentacaoSchema = new mongoose.Schema(
  {
    tipo: {
      type: String,
      enum: [
        "criacao",
        "autuacao",
        "portaria",
        "termo",
        "observacao",
        "acompanhamento",
        "encaminhamento",
        "arquivamento",
        "cancelamento",
        "documento",
        "outro",
      ],
      default: "outro",
    },

    titulo: {
      type: String,
      trim: true,
      default: "Movimentação registrada",
    },

    descricao: {
      type: String,
      trim: true,
      default: "",
    },

    documentoTipo: {
      type: String,
      trim: true,
      default: "",
    },

    orgaoDestino: {
      type: String,
      enum: [
        "",
        "conselho_tutelar",
        "ministerio_publico",
        "delegacia",
        "judiciario",
        "outro",
      ],
      default: "",
    },

    protocolo: {
      type: String,
      trim: true,
      default: "",
    },

    registradoPor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Usuario",
      default: null,
    },

    registradoPorNome: {
      type: String,
      trim: true,
      default: "",
    },

    registradoEm: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: true }
);

const LivroOcorrenciaSchema = new mongoose.Schema(
  {
    tenant: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },

    numeroLivro: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },

    ano: {
      type: Number,
      required: true,
      index: true,
    },

    sequencial: {
      type: Number,
      required: true,
      index: true,
    },

    processo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ProcessoDisciplinar",
      required: true,
      index: true,
    },

    numeroProcesso: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },

    natureza: {
      type: String,
      enum: ["indisciplina", "ato_infracional"],
      default: "indisciplina",
      index: true,
    },

    classificacaoOcorrencia: {
      type: String,
      trim: true,
      default: "",
    },

    gravidade: {
      type: String,
      enum: ["leve", "media", "grave", "gravissima"],
      default: "leve",
      index: true,
    },

    status: {
      type: String,
      enum: [
        "registrado",
        "em_acompanhamento",
        "encaminhado",
        "arquivado",
        "cancelado",
      ],
      default: "registrado",
      index: true,
    },

    aluno: {
      id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Aluno",
        default: null,
      },
      nome: {
        type: String,
        trim: true,
        default: "",
      },
      turma: {
        type: String,
        trim: true,
        default: "",
      },
      matricula: {
        type: String,
        trim: true,
        default: "",
      },
    },

    responsavel: {
      nome: {
        type: String,
        trim: true,
        default: "",
      },
      parentesco: {
        type: String,
        trim: true,
        default: "",
      },
      telefone: {
        type: String,
        trim: true,
        default: "",
      },
      email: {
        type: String,
        trim: true,
        lowercase: true,
        default: "",
      },
    },

    fato: {
      data: {
        type: Date,
        default: null,
      },
      hora: {
        type: String,
        trim: true,
        default: "",
      },
      local: {
        type: String,
        trim: true,
        default: "",
      },
      descricao: {
        type: String,
        trim: true,
        default: "",
      },
      providenciasImediatas: {
        type: String,
        trim: true,
        default: "",
      },
    },

    marcadores: {
      possuiViolencia: {
        type: Boolean,
        default: false,
      },
      possuiLesao: {
        type: Boolean,
        default: false,
      },
      possuiDanoPatrimonial: {
        type: Boolean,
        default: false,
      },
      possuiSubstanciaIlicita: {
        type: Boolean,
        default: false,
      },
      possuiArmaOuObjetoPerigoso: {
        type: Boolean,
        default: false,
      },
      exigeEncaminhamentoExterno: {
        type: Boolean,
        default: false,
      },
      orgaoEncaminhamento: {
        type: String,
        enum: [
          "",
          "conselho_tutelar",
          "ministerio_publico",
          "delegacia",
          "judiciario",
          "outro",
        ],
        default: "",
      },
    },

    prazoAcompanhamentoAte: {
      type: Date,
      default: null,
    },

    documentos: [
      {
        tipo: {
          type: String,
          trim: true,
          default: "",
        },
        titulo: {
          type: String,
          trim: true,
          default: "",
        },
        categoria: {
          type: String,
          trim: true,
          default: "",
        },
        caminhoLocal: {
          type: String,
          trim: true,
          default: "",
        },
        hash: {
          type: String,
          trim: true,
          default: "",
        },
        geradoEm: {
          type: Date,
          default: Date.now,
        },
      },
    ],

    movimentacoes: [MovimentacaoSchema],

    hashDossieAtual: {
      type: String,
      trim: true,
      default: "",
      index: true,
    },

    validacaoPublicaUrl: {
      type: String,
      trim: true,
      default: "",
    },

    observacoesGerais: {
      type: String,
      trim: true,
      default: "",
    },

    homologacao: {
  homologado: {
    type: Boolean,
    default: false,
    index: true,
  },

  homologadoEm: {
    type: Date,
    default: null,
  },

  homologadoPor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Usuario",
    default: null,
  },

  homologadoPorNome: {
    type: String,
    trim: true,
    default: "",
  },

  observacao: {
    type: String,
    trim: true,
    default: "",
  },
},

assinaturas: [
  {
    tipo: {
      type: String,
      enum: [
        "coordenacao",
        "direcao",
        "comando",
        "secretaria",
        "outro",
      ],
      default: "outro",
      index: true,
    },

    assinadoPor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Usuario",
      default: null,
    },

    assinadoPorNome: {
      type: String,
      trim: true,
      default: "",
    },

    cargo: {
      type: String,
      trim: true,
      default: "",
    },

    observacao: {
      type: String,
      trim: true,
      default: "",
    },

    hashRegistro: {
      type: String,
      trim: true,
      default: "",
      index: true,
    },

    ip: {
      type: String,
      trim: true,
      default: "",
    },

    userAgent: {
      type: String,
      trim: true,
      default: "",
    },

    assinadoEm: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
],

    criadoPor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Usuario",
      default: null,
    },

    criadoPorNome: {
      type: String,
      trim: true,
      default: "",
    },

    atualizadoPor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Usuario",
      default: null,
    },

    atualizadoPorNome: {
      type: String,
      trim: true,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

LivroOcorrenciaSchema.index(
  { tenant: 1, ano: 1, sequencial: 1 },
  { unique: true }
);

LivroOcorrenciaSchema.index(
  { tenant: 1, processo: 1 },
  { unique: true }
);

LivroOcorrenciaSchema.index({
  tenant: 1,
  numeroProcesso: 1,
});

LivroOcorrenciaSchema.index({
  tenant: 1,
  status: 1,
  gravidade: 1,
});

module.exports =
  mongoose.models.LivroOcorrencia ||
  mongoose.model("LivroOcorrencia", LivroOcorrenciaSchema);