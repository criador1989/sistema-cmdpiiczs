const mongoose = require('mongoose');
const dotenv = require('dotenv');
const Notificacao = require('../models/Notificacao');

dotenv.config();

mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(async () => {
  console.log('🔧 Conectado ao MongoDB');

  const notificacoes = await Notificacao.find({});
  let alteradas = 0;

  for (const n of notificacoes) {
    if (typeof n.data === 'string') {
      const convertida = new Date(n.data);
      if (!isNaN(convertida.getTime())) {
        n.data = convertida;
        await n.save();
        alteradas++;
        console.log(`✔️ Corrigida: ${n._id}`);
      }
    }
  }

  console.log(`✅ ${alteradas} notificações corrigidas com sucesso.`);
  mongoose.disconnect();
}).catch(err => {
  console.error('Erro ao conectar ao banco:', err);
});
