require('dotenv').config({ path: './.env' });
const mongoose = require('mongoose');
const Usuario = require('./models/Usuario');

(async () => {
  try {
    const URI = process.env.MONGODB_URI || process.env.MONGO_URI;
    if (!URI) throw new Error('❌ URI do MongoDB não encontrada (.env ausente ou variável incorreta)');
    await mongoose.connect(URI);
    const r = await Usuario.updateOne(
      { email: 'jardesson.2008@hotmail.com' },
      { $set: { perfil: 'admin' } }
    );
    console.log('✅ Perfil atualizado:', r);
  } catch (err) {
    console.error('Erro:', err.message || err);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
})();
