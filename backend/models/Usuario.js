const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto'); // usado para gerar o token

const usuarioSchema = new mongoose.Schema({
  nome: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true,
    unique: true
  },
  senha: {
    type: String,
    required: true,
    select: false // não retorna senha por padrão nas consultas
  },
  tipo: {
    type: String,
    enum: ['admin', 'monitor', 'professor'],
    default: 'monitor'
  },
  instituicao: {
    type: String,
    required: true
  },
  tokenAcesso: {
    type: String,
    unique: true,
    sparse: true // só professores terão
  }
});

// Hash da senha antes de salvar
usuarioSchema.pre('save', async function (next) {
  if (this.isModified('senha')) {
    const salt = await bcrypt.genSalt(10);
    this.senha = await bcrypt.hash(this.senha, salt);
  }

  // Gera token de acesso se for professor e ainda não tiver
  if (this.tipo === 'professor' && !this.tokenAcesso) {
    this.tokenAcesso = crypto.randomBytes(16).toString('hex');
  }

  next();
});

// Método para comparar senhas
usuarioSchema.methods.compararSenha = function (senhaDigitada) {
  return bcrypt.compare(senhaDigitada, this.senha);
};

module.exports = mongoose.model('Usuario', usuarioSchema);
