'use strict';
const mongoose = require('mongoose');

const EventoParticipanteSchema = new mongoose.Schema({
  eventSlug: { type: String, required: true, index: true },
  accountId: { type: mongoose.Schema.Types.ObjectId, ref: 'EventoConta', required: true, index: true },
  nome: { type: String, required: true, trim: true },
  nascimento: { type: Date, required: true },
  cpf: { type: String, default: undefined },
  sexo: { type: String, enum: ['masculino', 'feminino', 'outro', 'nao_informado'], default: 'nao_informado' },
  vinculo: { type: String, enum: ['aluno','pai','mae','irmao','irma','egresso','servidor','conjuge_servidor','filho_servidor','filho_bombeiro'], required: true },
  etapaEnsino: { type: String, enum: ['fundamental2','medio','nao_aplicavel'], default: 'nao_aplicavel' },
  turno: { type: String, enum: ['manha','tarde','nao_aplicavel'], default: 'nao_aplicavel' },
  turma: { type: String, default: '' },
  matricula: { type: String, default: '' },
  enquadramento: { type: String, enum: ['regular','aee','pcd'], default: 'regular' },
  aee: { type: Boolean, default: false },
  pcd: { type: Boolean, default: false },
  referenciaVinculo: {
    nome: { type: String, default: '' },
    turma: { type: String, default: '' },
    observacao: { type: String, default: '' },
  },
  titular: { type: Boolean, default: false },
  ativo: { type: Boolean, default: true },
}, { timestamps: true, collection: 'evento_participantes' });

EventoParticipanteSchema.index({ eventSlug: 1, cpf: 1 }, { unique: true, sparse: true });
EventoParticipanteSchema.index({ eventSlug: 1, accountId: 1, nome: 1, nascimento: 1 });

module.exports = mongoose.models.EventoParticipante || mongoose.model('EventoParticipante', EventoParticipanteSchema);
