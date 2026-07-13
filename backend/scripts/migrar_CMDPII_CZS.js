// backend/scripts/migrar_CMDPII_CZS.js
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

(async function main() {
  const MONGO_URI = process.env.MONGO_URI;
  if (!MONGO_URI) {
    console.error('❌ Defina MONGO_URI no arquivo .env');
    process.exit(1);
  }

  const instNome = 'CMDPII-CZS';

  try {
    console.log('🔌 Conectando ao MongoDB...');
    await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 7000 });
    const db = mongoose.connection.db;

    const Instituicoes = db.collection('instituicaos');
    const Usuarios = db.collection('usuarios');
    const Alunos = db.collection('alunos');
    const Logs = db.collection('logs'); // pode não existir

    // 1️⃣ Garante que a instituição CMDPII-CZS exista
    let inst = await Instituicoes.findOne({ nome: instNome });
    if (!inst) {
      const now = new Date();
      const r = await Instituicoes.insertOne({ nome: instNome, ativo: true, createdAt: now, updatedAt: now });
      inst = await Instituicoes.findOne({ _id: r.insertedId });
      console.log(`➕ Criada instituição "${instNome}" => ${inst._id}`);
    } else {
      console.log(`✔️ Instituição já existe: "${instNome}" => ${inst._id}`);
    }
    const instId = inst._id;

    // 2️⃣ Atualiza USUÁRIOS
    const rU = await Usuarios.updateMany(
      { instituicao: instNome },
      { $set: { instituicao: instId } }
    );

    // 3️⃣ Atualiza ALUNOS
    const rA = await Alunos.updateMany(
      { instituicao: instNome },
      { $set: { instituicao: instId } }
    );

    // 4️⃣ Atualiza LOGS (opcional)
    let rL = { matchedCount: 0, modifiedCount: 0 };
    try {
      rL = await Logs.updateMany(
        { instituicao: instNome },
        { $set: { instituicao: instId } }
      );
    } catch {
      // se não houver logs, ignora
    }

    console.log('🔁 Atualização concluída:');
    console.table({
      usuarios: `${rU.matchedCount}/${rU.modifiedCount}`,
      alunos: `${rA.matchedCount}/${rA.modifiedCount}`,
      logs: `${rL.matchedCount}/${rL.modifiedCount}`,
    });

    // 5️⃣ Checagem final
    const restUsers = await Usuarios.countDocuments({ instituicao: { $type: 'string' } });
    const restAlunos = await Alunos.countDocuments({ instituicao: { $type: 'string' } });
    console.log('✅ Restante com tipo string:', { usuarios: restUsers, alunos: restAlunos });

    await mongoose.disconnect();
    console.log('🏁 Migração concluída com sucesso.');
  } catch (err) {
    console.error('🚨 Erro na migração:', err);
    process.exit(1);
  }
})();
