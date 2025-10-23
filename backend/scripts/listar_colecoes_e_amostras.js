// backend/scripts/listar_colecoes_e_amostras.js
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

(async function main() {
  const MONGO_URI = process.env.MONGO_URI;
  if (!MONGO_URI) { console.error('❌ Defina MONGO_URI no .env'); process.exit(1); }

  await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 7000 });
  const db = mongoose.connection.db;

  // nome do banco em uso
  const admin = mongoose.connection;
  const dbName = admin.name || (await db.admin().listDatabases()).databases?.find(d => d.name)?.name;
  console.log('📦 Database conectado:', db.databaseName || dbName);

  // lista coleções
  const colls = await db.listCollections().toArray();
  console.log('\n📚 Coleções encontradas:');
  for (const c of colls) console.log('-', c.name);

  // pega contagens
  const withCounts = [];
  for (const c of colls) {
    try {
      const cnt = await db.collection(c.name).estimatedDocumentCount();
      withCounts.push({ name: c.name, count: cnt });
    } catch {
      withCounts.push({ name: c.name, count: '—' });
    }
  }
  console.log('\n🔢 Contagens:');
  console.table(withCounts.sort((a, b) => (b.count || 0) - (a.count || 0)));

  // candidatos a "notificações" e "observações"
  const regexNotif = /(notif|notifi|notificac|notifica)/i;
  const regexObserv = /(observ|obs)/i;

  const candidatosNotif = withCounts.filter(c => regexNotif.test(c.name));
  const candidatosObserv = withCounts.filter(c => regexObserv.test(c.name));

  console.log('\n🔎 Candidatos de notificações:');
  console.table(candidatosNotif);

  console.log('\n🔎 Candidatos de observações:');
  console.table(candidatosObserv);

  // amostra de até 3 docs por candidato
  async function amostrar(nome) {
    try {
      const docs = await db.collection(nome).find({}).limit(3).toArray();
      console.log(`\n🧪 Amostra de "${nome}" (até 3 docs):`);
      for (const d of docs) {
        const preview = { _id: d._id };
        for (const k of Object.keys(d)) {
          if (['_id'].includes(k)) continue;
          // só mostra o tipo da chave pra não poluir
          const v = d[k];
          preview[k] = Array.isArray(v) ? `Array(${v.length})` : (v === null ? 'null' : typeof v);
        }
        console.log(preview);
      }
      if (!docs.length) console.log('(vazia)');
    } catch (e) {
      console.log(`(falha ao ler "${nome}": ${e.message})`);
    }
  }

  for (const c of candidatosNotif) { await amostrar(c.name); }
  for (const c of candidatosObserv) { await amostrar(c.name); }

  await mongoose.disconnect();
  console.log('\n🏁 Listagem concluída.');
})();
