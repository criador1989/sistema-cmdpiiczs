'use strict';

const mongoose = require('mongoose');

const JogadorSchema = new mongoose.Schema({
  id: { type: String, default: '' },
  nome: { type: String, default: '' },
  numero: { type: String, default: '' },
  posicao: { type: String, default: '' },
  foto: { type: String, default: '' },
  capitao: { type: Boolean, default: false },
  destaque: { type: Boolean, default: false }
}, { _id: false });

const ModalidadeSchema = new mongoose.Schema({
  id: { type: String, default: '' },
  nome: { type: String, default: '' },
  icone: { type: String, default: '🏆' },
  categoria: { type: String, default: 'Geral' },
  genero: { type: String, default: '' },
  status: { type: String, default: 'Ativa' },
  descricao: { type: String, default: '' },

regulamentoUrl: {
  type: String,
  default: ''
},

  formatoCompeticao: {
    type: String,
    enum: [
      'a-definir',
      'fase-de-grupos',
      'mata-mata',
      'triangular',
      'pontos-corridos'
    ],
    default: 'a-definir'
  }
}, { _id: false });

const EquipeSchema = new mongoose.Schema({
  id: { type: String, default: '' },
  nome: { type: String, default: '' },
  turma: { type: String, default: '' },
  modalidadeId: { type: String, default: '' },
  modalidadeNome: { type: String, default: '' },
  fotoEquipe: { type: String, default: '' },
  corPrimaria: { type: String, default: '#061a35' },
  corSecundaria: { type: String, default: '#f5b51b' },
  tecnico: { type: String, default: '' },
  status: { type: String, default: 'Em disputa' },
  jogadores: { type: [JogadorSchema], default: [] }
}, { _id: false });

const JogoSchema = new mongoose.Schema({
  id: { type: String, default: '' },
  modalidadeId: { type: String, default: '' },
  equipeAId: { type: String, default: '' },
  equipeBId: { type: String, default: '' },
  equipeA: { type: String, default: '' },
  equipeB: { type: String, default: '' },
  placarA: { type: Number, default: 0 },
  placarB: { type: Number, default: 0 },
  data: { type: String, default: '' },
  horario: { type: String, default: '' },
  local: { type: String, default: '' },
  fase: { type: String, default: 'Fase de grupos' },
  status: { type: String, default: 'Agendado' }
}, { _id: false });

const SiteInterclasseSchema = new mongoose.Schema({
  tenant: {
    type: String,
    default: 'cmdpii-czs',
    index: true
  },

  nome: {
    type: String,
    default: 'V Interclasse CMDPII'
  },

  ano: {
    type: Number,
    default: 2026
  },

  edicao: {
    type: String,
    default: '5ª edição'
  },

  tema: {
    type: String,
    default: 'copa'
  },

  descricao: {
    type: String,
    default: ''
  },

  banner: {
    type: String,
    default: ''
  },

  regulamentoUrl: {
    type: String,
    default: ''
  },

  destaque: {
    titulo: {
      type: String,
      default: 'Regulamentos e inscrições'
    },

    descricao: {
      type: String,
      default: 'Consulte as orientações oficiais do Interclasse CMDPII-CZS e acesse os documentos da competição.'
    },

    botao: {
      type: String,
      default: 'Acesse'
    },

    url: {
      type: String,
      default: ''
    },

    tipo: {
      type: String,
      enum: ['informativo', 'inscricoes', 'atencao', 'premiacao'],
      default: 'informativo'
    }
  },

  inscricoesAbertas: {
    type: Boolean,
    default: false
  },

  ativo: {
    type: Boolean,
    default: true,
    index: true
  },

  inscricoes: {
    titulo: {
      type: String,
      default: 'Inscrições abertas'
    },

    texto: {
      type: String,
      default: 'Clique no botão abaixo para acessar o formulário de inscrição do Interclasse.'
    },

    botao: {
      type: String,
      default: 'Fazer inscrição'
    },

    url: {
      type: String,
      default: ''
    },

    status: {
      type: String,
      enum: ['aberta', 'encerrada'],
      default: 'aberta'
    }
  },

  modalidades: {
    type: [ModalidadeSchema],
    default: []
  },

  equipes: {
    type: [EquipeSchema],
    default: []
  },

  jogos: {
    type: [JogoSchema],
    default: []
  },

  galeria: {
    type: [mongoose.Schema.Types.Mixed],
    default: []
  },

  atualizadoPor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Usuario',
    default: null
  }
}, {
  timestamps: true
});

SiteInterclasseSchema.index({ tenant: 1, ativo: 1 });

module.exports =
  mongoose.models.SiteInterclasse ||
  mongoose.model('SiteInterclasse', SiteInterclasseSchema);