'use strict';

const mongoose = require('mongoose');

const SiteConfigSchema = new mongoose.Schema({
  tenant: {
    type: String,
    default: 'cmdpii-czs',
    unique: true,
    index: true
  },

  nomeSite: {
    type: String,
    default: 'Colégio Dom Pedro II - Campus CZS'
  },

  sigla: {
    type: String,
    default: 'CMDPII-CZS'
  },

  descricao: {
    type: String,
    default: ''
  },

  seoTitulo: {
  type: String,
  default: ''
},

seoDescricao: {
  type: String,
  default: ''
},

  logoUrl: {
    type: String,
    default: ''
  },

  brasaoUrl: {
    type: String,
    default: ''
  },
  faviconUrl: {
  type: String,
  default: ''
},

  corPrimaria: {
    type: String,
    default: '#061a35'
  },

  corSecundaria: {
    type: String,
    default: '#b9151b'
  },

  corDestaque: {
    type: String,
    default: '#f5b51b'
  },

  telefone: {
    type: String,
    default: ''
  },

  email: {
    type: String,
    default: ''
  },

  endereco: {
    type: String,
    default: ''
  },

  redesSociais: {
    facebook: { type: String, default: '' },
    instagram: { type: String, default: '' },
    youtube: { type: String, default: '' },
    whatsapp: { type: String, default: '' }
  },


layoutGlobal: {
  header: {
    titulo: { type: String, default: 'COLÉGIO DOM PEDRO II' },
    subtitulo: { type: String, default: 'CAMPUS CZS SUL' },
    descricaoPequena: { type: String, default: 'Unidade de Ensino do CBMAC' },
    logo: { type: String, default: '' },
    botaoTexto: { type: String, default: 'Acesso Axoriin' },
    botaoLink: { type: String, default: 'https://axoriin.com.br' }
  },

  menu: {
    type: [mongoose.Schema.Types.Mixed],
    default: []
  },

  footerLinks: {
    type: [mongoose.Schema.Types.Mixed],
    default: []
  }
},

  analytics: {
    visitasTotais: { type: Number, default: 0 },
    visitasHoje: { type: Number, default: 0 },
    atualizadoEm: { type: Date, default: null }
  },

  atualizadoPor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Usuario',
    default: null
  }
}, {
  timestamps: true
});

module.exports = mongoose.models.SiteConfig || mongoose.model('SiteConfig', SiteConfigSchema);