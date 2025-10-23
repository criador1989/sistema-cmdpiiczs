// models/Aluno.js
const mongoose = require('mongoose');
const crypto = require('crypto');

const { Schema } = mongoose;

const publicViewSchema = new Schema({
  enabled:   { type: Boolean, default: false },
  token:     { type: String, default: null, index: true },
  createdAt: { type: Date, default: null },
  expiresAt: { type: Date, default: null },
}, { _id: false });

const alunoSchema = new Schema({
  nome:           { type: String, required: true, trim: true },
  turma:          { type: String, required: true, trim: true },
  comportamento:  { type: Number, default: 8.00, min: 0, max: 10 },
  dataEntrada:    { type: Date, required: true },
  nascimento:     { type: Date },

  nomePai:        { type: String, trim: true },
  nomeMae:        { type: String, trim: true },
  telefone:       { type: String, trim: true },
  endereco:       { type: String, trim: true },

  codigoAcesso:   { type: String, required: true, trim: true },

  foto:           { type: String, default: null },
  fotoPublicId:   { type: String, default: null },
  fotoThumb:      { type: String, default: null },

  // 🔓 link público (somente leitura) p/ responsáveis
  publicView:     { type: publicViewSchema, default: () => ({}) },

  // 🔐 multi-tenant: agora como ObjectId
  instituicao:    { type: Schema.Types.ObjectId, ref: 'Instituicao', required: true }
}, { timestamps: true });

// gera um código curto se não existir
alunoSchema.pre('validate', function (next) {
  if (!this.codigoAcesso) {
    this.codigoAcesso = crypto.randomBytes(3).toString('hex').toUpperCase();
  }
  next();
});

// índices
alunoSchema.index({ instituicao: 1, codigoAcesso: 1 }, { unique: true, sparse: true });
alunoSchema.index({ instituicao: 1, turma: 1, nome: 1 });
// garante que o token público seja único no banco
alunoSchema.index({ 'publicView.token': 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('Aluno', alunoSchema);
