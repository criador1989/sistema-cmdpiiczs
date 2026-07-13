// backend/scripts/migrar_restantes_CMDPII_CZS.js
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

(async function main() {
  const MONGO_URI = process.env.MONGO_URI;
  if (!MONGO_URI) {
    console.error('❌ Defina MONGO_URI no .env');
    process.exit(1);
  }

  const instNome = 'CMDPII-CZS';

  try {
    console.log('🔌 Conectando...');
    await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 7000 });
    const db = mongoose.connection.db;

    const Instituicoes = db.collection('instituicaos');
    const Usuarios = db.collection('usuarios');
    const Alunos = db.collection('alunos');
    const Logs = db.collection('logs'); // opcional

    // usa a instituição já criada pela migração anterior
    const inst = await Instituicoes.findOne({ nome: instNome });
    if (!inst) throw new Error(`Instituição "${instNome}" não encontrada.`);
    const instId = inst._id;
    console.log(`✔️ Instituição: ${instNome} => ${instId}`);

    // Só para conferência: liste quais strings ainda existem
    const restantesUsuarios = await Usuarios.aggregate([
      { $match: { instituicao: { $type: 'string' } } },
      { $group: { _id: '$instituicao', qtd: { $sum: 1 } } }
    ]).toArray();
    const restantesAlunos = await Alunos.aggregate([
      { $match: { instituicao: { $type: 'string' } } },
      { $group: { _id: '$instituicao', qtd: { $sum: 1 } } }
    ]).toArray();
    console.log('🔎 Strings restantes (usuarios):', restantesUsuarios);
    console.log('🔎 Strings restantes (alunos):', restantesAlunos);

    // 🔧 força todos os docs que ainda têm string a usar o ObjectId dessa instituição
    const rU = await Usuarios.updateMany(
      { instituicao: { $type: 'string' } },
      { $set: { instituicao: instId } }
    );
    const rA = await Alunos.updateMany(
      { instituicao: { $type: 'string' } },
      { $set: { instituicao: instId } }
    );
    let rL = { matchedCount: 0, modifiedCount: 0 };
    try {
      rL = await Logs.updateMany(
        { instituicao: { $type: 'string' } },
        { $set: { instituicao: instId } }
      );
    } catch {}

    console.log('🔁 Atualização aplicada:');
    console.table({
      usuarios: `${rU.matchedCount}/${rU.modifiedCount}`,
      alunos:   `${rA.matchedCount}/${rA.modifiedCount}`,
      logs:     `${rL.matchedCount}/${rL.modifiedCount}`,
    });

    // Checagem final
    const restUsers  = await Usuarios.countDocuments({ instituicao: { $type: 'string' } });
    const restAlunos = await Alunos.countDocuments({ instituicao: { $type: 'string' } });
    console.log('✅ Restante com tipo string:', { usuarios: restUsers, alunos: restAlunos });

    await mongoose.disconnect();
    console.log('🏁 Concluído.');
  } catch (err) {
    console.error('🚨 Erro:', err);
    process.exit(1);
  }
})();
