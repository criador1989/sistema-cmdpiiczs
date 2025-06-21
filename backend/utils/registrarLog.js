// utils/registrarLog.js
const Log = require('../models/Log');

async function registrarLog({ usuarioId, acao, entidade, entidadeId }) {
  try {
    const log = new Log({
      usuario: usuarioId,
      acao,
      entidade,
      entidadeId
    });
    await log.save();
  } catch (erro) {
    console.error('Erro ao registrar log:', erro);
  }
}

module.exports = registrarLog;
