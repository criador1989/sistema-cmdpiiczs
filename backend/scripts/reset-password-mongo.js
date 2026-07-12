// reset-password-mongo.js
// Uso: ajustar MONGO_URI e opcionalmente DB_NAME, depois: node reset-password-mongo.js
// Requer: npm install mongodb bcryptjs

require('dotenv').config();

const { MongoClient, ObjectId } = require('mongodb');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { generateTemporaryPassword } = require('../utils/passwordPolicy');

// ========== CONFIGURE AQUI ==========
const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.MONGO_URL;
const DB_NAME = process.env.DB_NAME || 'colegiomilitar';
const USERS_COLLECTION = process.env.USERS_COLLECTION || 'usuarios';
// Identificador do usuário que você enviou
const USER_ID = '685059970ca9cf93c0730239'; // já preenchido com o _id que você forneceu
// =====================================

if (!MONGO_URI) {
  console.error('⚠️  ATENÇÃO: defina MONGODB_URI, MONGO_URI ou MONGO_URL no ambiente.');
  process.exit(1);
}

// Use gerador centralizado e legível
async function gerarSenhaTemp() {
  return generateTemporaryPassword();
}

async function run() {
  const client = new MongoClient(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  try {
    await client.connect();
    const db = client.db(DB_NAME);
    const users = db.collection(USERS_COLLECTION);

    // acha o usuário pelo _id
    const filtro = { _id: new ObjectId(USER_ID) };

    const user = await users.findOne(filtro);
    if (!user) {
      console.error('Usuário não encontrado com _id:', USER_ID);
      return;
    }

    const tempPassword = await gerarSenhaTemp();
    const saltRounds = 10;
    const hash = await bcrypt.hash(tempPassword, saltRounds);

    // Atualiza senha, marca para forçar alteração e registra data da alteração
    const update = {
      $set: {
        senha: hash,                    // campo conforme seu documento (você usou "senha")
        // Não forçar troca de senha automaticamente — entrega manual ao usuário
        passwordResetAt: new Date(),
        passwordResetBy: 'admin-script'
      }
    };

    const res = await users.updateOne(filtro, update);
    if (res.matchedCount === 0) {
      console.error('Falha: usuário não encontrado (matchedCount 0).');
    } else {
      console.log('✅ Senha redefinida com sucesso para o usuário:');
      console.log('   Nome: ', user.nome || '(sem nome registrado)');
      console.log('   Email:', user.email || '(sem email)');
      console.log('');
      console.log('--- ENTREGA SEGURA: senha temporária abaixo ---');
      console.log('SENHA TEMPORÁRIA ->', tempPassword);
      console.log('---------------------------------------------');
      console.log('');
      console.log('Recomendações: entregue a senha por canal seguro e peça para o usuário trocar imediatamente.');
    }
  } catch (err) {
    console.error('Erro:', err);
  } finally {
    await client.close();
  }
}

run();
