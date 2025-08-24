// models/Aluno.js
const mongoose = require('mongoose');
const crypto = require('crypto');

const alunoSchema = new mongoose.Schema({
  nome:           { type: String, required: true, trim: true },
  turma:          { type: String, required: true, trim: true },
  comportamento:  { type: Number, default: 8.00, min: 0, max: 10 },
  dataEntrada:    { type: Date, required: true },
  nascimento:     { type: Date },

  nomePai:        { type: String, trim: true },
  nomeMae:        { type: String, trim: true },
  telefone:       { type: String, trim: true },
  endereco:       { type: String, trim: true },

  codigoAcesso:   { type: String, required: true, unique: true, trim: true },

  /**
   * FOTO
   * - `foto`: pode ser uma URL https do Cloudinary OU o caminho legado local (ex.: "/uploads/alunos/123.jpg").
   * - `fotoPublicId`: public_id do Cloudinary (permite gerar thumbs on-the-fly com alta performance).
   * - `fotoThumb`: legado/opcional (se quiser persistir uma thumb específica); não é necessário com Cloudinary.
   */
  foto:           { type: String, default: null },
  fotoPublicId:   { type: String, default: null }, // ✅ novo p/ Cloudinary
  fotoThumb:      { type: String, default: null }, // (opcional/legado)

  instituicao:    { type: String, required: true }
}, { timestamps: true });

// Gera código de acesso antes de salvar
alunoSchema.pre('validate', function (next) {
  if (!this.codigoAcesso) {
    this.codigoAcesso = crypto.randomBytes(3).toString('hex').toUpperCase(); // Ex.: "A3F8B2"
  }
  next();
});

/** Indexes úteis p/ acelerar as consultas da lista (instituição/turma/nome) */
alunoSchema.index({ instituicao: 1, turma: 1, nome: 1 });
alunoSchema.index({ codigoAcesso: 1 }, { unique: true });

module.exports = mongoose.model('Aluno', alunoSchema);
