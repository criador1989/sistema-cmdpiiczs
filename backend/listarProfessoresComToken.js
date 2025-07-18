const mongoose = require('mongoose');
const dotenv = require('dotenv');
const Usuario = require('./models/Usuario');

dotenv.config();

mongoose.connect(process.env.MONGO_URI)
  .then(async () => {
    console.log('🟢 Conectado ao MongoDB');

    const professores = await Usuario.find({
      tipo: 'professor',
      tokenAcessoProfessor: { $exists: true, $ne: null }
    });

    if (professores.length === 0) {
      console.log('Nenhum professor com token encontrado.');
    } else {
      console.log('Professores com token de acesso:\n');
      professores.forEach((prof, i) => {
        console.log(`${i + 1}. Nome: ${prof.nome}`);
        console.log(`   Email: ${prof.email}`);
        console.log(`   Token: ${prof.tokenAcessoProfessor}\n`);
      });
    }

    mongoose.disconnect();
  })
  .catch(err => {
    console.error('❌ Erro ao conectar ao MongoDB:', err);
  });
