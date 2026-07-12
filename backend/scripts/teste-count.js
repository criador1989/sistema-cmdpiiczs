'use strict';

require('dotenv').config();

const mongoose = require("mongoose");
const Notificacao = require("../models/Notificacao");

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.MONGO_URL;

if (!MONGO_URI) {
  throw new Error('Variável MONGODB_URI, MONGO_URI ou MONGO_URL não encontrada no ambiente.');
}

(async () => {
  try {
    await mongoose.connect(MONGO_URI);
    const n = await Notificacao.countDocuments({ ativo: true, arquivada: false, lida: false });
    console.log("Visíveis (ativo:true, arquivada:false, lida:false):", n);
  } catch (e) {
    console.error("ERRO:", e);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
})();
