const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

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
    enum: ['admin', 'monitor', 'professor'], // ✅ Atualizado
    default: 'monitor'
  },
  instituicao: {
    type: String,
    required: true
  },
  tokenAcessoProfessor: {
    type: String,
    unique: true,
    sparse: true // Permite que alguns usuários não tenham esse token
  }
});

// Hash da senha antes de salvar
usuarioSchema.pre('save', async function (next) {
  if (!this.isModified('senha')) return next();
  const salt = await bcrypt.genSalt(10);
  this.senha = await bcrypt.hash(this.senha, salt);
  next();
});

// Método para comparar senhas
usuarioSchema.methods.compararSenha = function (senhaDigitada) {
  return bcrypt.compare(senhaDigitada, this.senha);
};

module.exports = mongoose.model('Usuario', usuarioSchema);
