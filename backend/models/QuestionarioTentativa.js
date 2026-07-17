const mongoose = require('mongoose');

const QuestaoRespondidaSchema = new mongoose.Schema(
  {
    questaoId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Questao',
      required: true
    },

    area: {
      type: String,
      default: '',
      trim: true,
      index: true
    },

    disciplina: {
      type: String,
      default: '',
      trim: true
    },

    competencia: {
      type: String,
      default: '',
      trim: true
    },

    habilidade: {
      type: String,
      default: '',
      trim: true
    },

    tema: {
      type: String,
      default: '',
      trim: true
    },

    dificuldade: {
      type: String,
      enum: ['facil', 'medio', 'dificil'],
      default: 'medio'
    },

    enunciadoSnapshot: {
      type: String,
      default: '',
      trim: true
    },

    apoioTextoSnapshot: {
      type: String,
      default: '',
      trim: true
    },

    imagemUrlSnapshot: {
      type: String,
      default: '',
      trim: true
    },

    alternativasSnapshot: {
      type: [
        {
          letra: { type: String, trim: true, uppercase: true },
          texto: { type: String, trim: true }
        }
      ],
      default: []
    },

    gabarito: {
      type: String,
      trim: true,
      uppercase: true,
      enum: ['A', 'B', 'C', 'D', 'E', '']
    },

    respostaAluno: {
      type: String,
      default: '',
      trim: true,
      uppercase: true,
      enum: ['A', 'B', 'C', 'D', 'E', '']
    },

    correta: {
      type: Boolean,
      default: false
    },

    tempoRespostaSegundos: {
      type: Number,
      default: 0,
      min: 0
    },

    ordem: {
      type: Number,
      default: 0,
      min: 0
    },

    explicacaoSnapshot: {
      type: String,
      default: '',
      trim: true
    },

    reforcoAplicado: {
      type: Boolean,
      default: false
    },

    respondidaEm: {
      type: Date,
      default: null
    }
  },
  { _id: false }
);

const ErroPorHabilidadeSchema = new mongoose.Schema(
  {
    habilidade: { type: String, default: '', trim: true },
    quantidade: { type: Number, default: 0, min: 0 },
    total: { type: Number, default: 0, min: 0 },
    percentualErro: { type: Number, default: 0, min: 0, max: 100 }
  },
  { _id: false }
);

const ErroPorAreaSchema = new mongoose.Schema(
  {
    area: { type: String, default: '', trim: true },
    quantidade: { type: Number, default: 0, min: 0 },
    total: { type: Number, default: 0, min: 0 },
    percentualErro: { type: Number, default: 0, min: 0, max: 100 }
  },
  { _id: false }
);

const QuestaoReforcoSchema = new mongoose.Schema(
  {
    questaoId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Questao',
      required: true
    },
    habilidade: { type: String, default: '', trim: true },
    area: { type: String, default: '', trim: true },
    tema: { type: String, default: '', trim: true },
    motivo: { type: String, default: 'erro_recente', trim: true },
    respondidaCorretamenteDepois: { type: Boolean, default: false }
  },
  { _id: false }
);

const ResumoDesempenhoSchema = new mongoose.Schema(
  {
    totalQuestoes: { type: Number, default: 0, min: 0 },
    acertos: { type: Number, default: 0, min: 0 },
    erros: { type: Number, default: 0, min: 0 },
    percentualAcerto: { type: Number, default: 0, min: 0, max: 100 },

    areaMaisForte: { type: String, default: '', trim: true },
    areaMaisFraca: { type: String, default: '', trim: true },

    habilidadeMaisForte: { type: String, default: '', trim: true },
    habilidadeMaisFraca: { type: String, default: '', trim: true },

    focoRecomendado: { type: String, default: '', trim: true },

    errosPorHabilidade: {
      type: [ErroPorHabilidadeSchema],
      default: []
    },

    errosPorArea: {
      type: [ErroPorAreaSchema],
      default: []
    },

    questoesParaReforco: {
      type: [QuestaoReforcoSchema],
      default: []
    }
  },
  { _id: false }
);

const QuestionarioTentativaSchema = new mongoose.Schema(
  {
    instituicao: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
      index: true
    },

    aluno: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
      index: true
    },

    usuarioAluno: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
      index: true
    },

    turma: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
      index: true
    },

    tipo: {
      type: String,
      enum: [
        'diagnostico',
        'treino',
        'revisao',
        'pre_simulado',
        'personalizado'
      ],
      default: 'treino',
      index: true
    },

    origemExperiencia: {
      type: String,
      enum: ['portal', 'arena_diaria'],
      default: 'portal',
      index: true
    },

    diaReferencia: {
      type: String,
      default: '',
      trim: true,
      index: true
    },

    localId: {
      type: String,
      default: '',
      trim: true,
      index: true
    },

    anoEscolar: {
      type: Number,
      default: null,
      min: 1,
      max: 12,
      index: true
    },

    medalha: {
      type: String,
      default: '',
      trim: true
    },

    titulo: {
      type: String,
      default: '',
      trim: true
    },

    descricao: {
      type: String,
      default: '',
      trim: true
    },

    area: {
      type: String,
      default: '',
      trim: true,
      index: true
    },

    disciplina: {
      type: String,
      default: '',
      trim: true
    },

    dificuldadePredominante: {
      type: String,
      enum: ['facil', 'medio', 'dificil', 'misto'],
      default: 'misto',
      index: true
    },

    origemMontagem: {
      type: String,
      enum: ['banco', 'ia_assistida', 'misto', 'reforco_adaptativo'],
      default: 'banco'
    },

    focoMontagem: {
      type: String,
      default: '',
      trim: true
    },

    habilidadeFoco: {
      type: String,
      default: '',
      trim: true,
      index: true
    },

    questoes: {
      type: [QuestaoRespondidaSchema],
      default: []
    },

    totalQuestoes: {
      type: Number,
      default: 0,
      min: 0
    },

    acertos: {
      type: Number,
      default: 0,
      min: 0
    },

    erros: {
      type: Number,
      default: 0,
      min: 0
    },

    nota: {
      type: Number,
      default: 0,
      min: 0,
      max: 100
    },

    tempoTotalSegundos: {
      type: Number,
      default: 0,
      min: 0
    },

    pontosGanhos: {
      type: Number,
      default: 0,
      min: 0
    },

    xpGanho: {
      type: Number,
      default: 0,
      min: 0
    },

    moedasGanhas: {
      type: Number,
      default: 0,
      min: 0
    },

    status: {
      type: String,
      enum: ['em_andamento', 'finalizado', 'cancelado'],
      default: 'finalizado',
      index: true
    },

    resumoDesempenho: {
      type: ResumoDesempenhoSchema,
      default: () => ({})
    },

    observacoesIA: {
      type: String,
      default: '',
      trim: true
    },

    proximaSugestao: {
      type: String,
      default: '',
      trim: true
    },

    criadoPorMotor: {
      type: Boolean,
      default: true
    }
  },
  {
    timestamps: true,
    collection: 'questionario_tentativas'
  }
);

QuestionarioTentativaSchema.index({ instituicao: 1, aluno: 1, createdAt: -1 });
QuestionarioTentativaSchema.index({ instituicao: 1, aluno: 1, tipo: 1, createdAt: -1 });
QuestionarioTentativaSchema.index({ instituicao: 1, area: 1, status: 1, createdAt: -1 });
QuestionarioTentativaSchema.index({ instituicao: 1, aluno: 1, habilidadeFoco: 1, createdAt: -1 });
QuestionarioTentativaSchema.index({ status: 1, createdAt: -1 });
QuestionarioTentativaSchema.index({ instituicao: 1, aluno: 1, origemExperiencia: 1, diaReferencia: 1 });
QuestionarioTentativaSchema.index({ instituicao: 1, aluno: 1, origemExperiencia: 1, diaReferencia: 1, localId: 1 });

module.exports = mongoose.models.QuestionarioTentativa || mongoose.model('QuestionarioTentativa', QuestionarioTentativaSchema);