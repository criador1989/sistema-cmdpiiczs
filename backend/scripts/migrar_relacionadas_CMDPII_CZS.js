// backend/scripts/migrar_relacionadas_CMDPII_CZS.js
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

function isHex24(str) {
  return typeof str === 'string' && /^[0-9a-fA-F]{24}$/.test(str);
}

(async function main() {
  const MONGO_URI = process.env.MONGO_URI;
  if (!MONGO_URI) {
    console.error('❌ Defina MONGO_URI no .env');
    process.exit(1);
  }

  const instNome = 'CMDPII-CZS';
  console.log('🔌 Conectando...');
  await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 7000 });
  const db = mongoose.connection.db;

  const Instituicoes = db.collection('instituicaos');
  // coleções que costumam existir neste projeto
  const Notifs      = db.collection('notificacaos');   // nome padrão pluralizado pelo Mongoose
  const Observs     = db.collection('observacaos');
  const Logs        = db.collection('logs');           // já migrado antes, mas deixamos aqui
  const Alunos      = db.collection('alunos');
  const Usuarios    = db.collection('usuarios');

  // 1) pegar/garantir a Instituição alvo
  let inst = await Instituicoes.findOne({ nome: instNome });
  if (!inst) {
    const now = new Date();
    const r = await Instituicoes.insertOne({ nome: instNome, ativo: true, createdAt: now, updatedAt: now });
    inst = await Instituicoes.findOne({ _id: r.insertedId });
    console.log(`➕ Criada Instituicao "${instNome}" => ${inst._id}`);
  } else {
    console.log(`✔️ Usando Instituicao existente "${instNome}" => ${inst._id}`);
  }
  const instId = inst._id;

  // helper: converte campo X string (24hex) -> ObjectId
  async function toObjectId(coll, field) {
    const pipeline = [
      {
        $set: {
          [field]: {
            $cond: [
              { $and: [{ $eq: [{ $type: `$${field}` }, 'string'] }, { $regexMatch: { input: `$${field}`, regex: /^[0-9a-fA-F]{24}$/ } }] },
              { $toObjectId: `$${field}` },
              `$${field}`
            ]
          }
        }
      }
    ];
    try {
      // updateMany com pipeline requer MongoDB 4.2+
      const r = await coll.updateMany(
        { [field]: { $type: 'string' } },
        pipeline
      );
      return r;
    } catch (e) {
      console.warn(`⚠️ Falha ao converter ${field} em ${coll.collectionName}:`, e.message || e);
      return { matchedCount: 0, modifiedCount: 0 };
    }
  }

  // 2) MIGRAÇÃO DE INSTITUIÇÃO (string -> ObjectId) nas coleções relacionadas
  async function setInstituicaoObjectId(coll) {
    const r1 = await coll.updateMany(
      { instituicao: { $type: 'string' } },
      { $set: { instituicao: instId } }
    );
    // também pega casos "vazios" ou "null" mas que deveriam ser desta instituição
    const r2 = await coll.updateMany(
      { $or: [{ instituicao: null }, { instituicao: { $exists: false } }] },
      { $set: { instituicao: instId } }
    );
    return { setString: r1, setNulls: r2 };
  }

  // 3) Notificações — principal para o comportamento
  console.log('\n📌 Migrando NOTIFICAÇÕES...');
  const notifInst = await setInstituicaoObjectId(Notifs);
  const notifAluno = await toObjectId(Notifs, 'aluno');     // vínculo com aluno
  const notifUser  = await toObjectId(Notifs, 'usuario');   // quem criou (se existir esse campo)
  const notifAutor = await toObjectId(Notifs, 'autor');     // às vezes schema usa 'autor'
  console.table({
    notif_inst_strings: `${notifInst.setString.matchedCount}/${notifInst.setString.modifiedCount}`,
    notif_inst_nulls:   `${notifInst.setNulls.matchedCount}/${notifInst.setNulls.modifiedCount}`,
    notif_aluno:        `${notifAluno.matchedCount}/${notifAluno.modifiedCount}`,
    notif_usuario:      `${notifUser.matchedCount}/${notifUser.modifiedCount}`,
    notif_autor:        `${notifAutor.matchedCount}/${notifAutor.modifiedCount}`,
  });

  // 4) Observações — muitas telas usam junto com comportamento
  console.log('\n🗒️ Migrando OBSERVAÇÕES...');
  const obsInst = await setInstituicaoObjectId(Observs);
  const obsAluno = await toObjectId(Observs, 'aluno');
  const obsAutor = await toObjectId(Observs, 'autor');
  console.table({
    obs_inst_strings: `${obsInst.setString.matchedCount}/${obsInst.setString.modifiedCount}`,
    obs_inst_nulls:   `${obsInst.setNulls.matchedCount}/${obsInst.setNulls.modifiedCount}`,
    obs_aluno:        `${obsAluno.matchedCount}/${obsAluno.modifiedCount}`,
    obs_autor:        `${obsAutor.matchedCount}/${obsAutor.modifiedCount}`,
  });

  // 5) Logs (se sobrou algo)
  if (Logs) {
    console.log('\n📜 Checando LOGS...');
    const lgInst = await setInstituicaoObjectId(Logs);
    const lgEnt  = await toObjectId(Logs, 'entidadeId'); // às vezes está como string
    const lgUser = await toObjectId(Logs, 'usuario');
    console.table({
      logs_inst_strings: `${lgInst.setString.matchedCount}/${lgInst.setString.modifiedCount}`,
      logs_inst_nulls:   `${lgInst.setNulls.matchedCount}/${lgInst.setNulls.modifiedCount}`,
      logs_entidadeId:   `${lgEnt.matchedCount}/${lgEnt.modifiedCount}`,
      logs_usuario:      `${lgUser.matchedCount}/${lgUser.modifiedCount}`,
    });
  }

  // 6) Validação rápida: Notificações por tipo atual de campo
  const restNotifInstStrings = await Notifs.countDocuments({ instituicao: { $type: 'string' } });
  const restNotifAlunoStrings = await Notifs.countDocuments({ aluno: { $type: 'string' } });

  console.log('\n✅ Checagem final:');
  console.table({
    notifs_instituicao_string: restNotifInstStrings,
    notifs_aluno_string:       restNotifAlunoStrings,
  });

  await mongoose.disconnect();
  console.log('\n🏁 Migração (relacionadas) concluída.');
})();
