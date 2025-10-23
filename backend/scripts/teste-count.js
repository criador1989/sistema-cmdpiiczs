const mongoose = require("mongoose");
const Notificacao = require("../models/Notificacao");

(async () => {
  try {
    await mongoose.connect("mongodb+srv://admin:admin123@cluster0.yyf7zhy.mongodb.net/colegiomilitar?retryWrites=true&w=majority");
    const n = await Notificacao.countDocuments({ ativo: true, arquivada: false, lida: false });
    console.log("Visíveis (ativo:true, arquivada:false, lida:false):", n);
  } catch (e) {
    console.error("ERRO:", e);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
})();
