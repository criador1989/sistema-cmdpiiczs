const mongoose = require('mongoose');
const crypto = require('crypto');

const alunoSchema = new mongoose.Schema({
  nome: {
    type: String,
    required: true,
    trim: true
  },
  turma: {
    type: String,
    required: true,
    trim: true
  },
  comportamento: {
    type: Number,
    default: 8.00,
    min: 0,
    max: 10
  },
  dataEntrada: {
    type: Date,
    required: true
  },
  nascimento: {
    type: Date
  },
  nomePai: {
    type: String,
    trim: true
  },
  nomeMae: {
    type: String,
    trim: true
  },
  telefone: {
    type: String,
    trim: true
  },
  endereco: {
    type: String,
    trim: true
  },
  codigoAcesso: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  // ✅ Pode guardar um caminho relativo (ex: "alunos/123.jpg"),
  // uma URL completa (http/https) ou até um data URL (base64).
  foto: {
    type: String,
    default: null
  },
  instituicao: {
    type: String,
    required: true
  }
}, {
  timestamps: true
});

// Gerar código de acesso antes de salvar
alunoSchema.pre('validate', function (next) {
  if (!this.codigoAcesso) {
    this.codigoAcesso = crypto.randomBytes(3).toString('hex').toUpperCase(); // Ex: "A3F8B2"
  }
  next();
});

module.exports = mongoose.model('Aluno', alunoSchema);
