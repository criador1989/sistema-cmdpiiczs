// config/mongo.js
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error('❌ MONGODB_URI ausente no .env');
  process.exit(1);
}

async function connectMongo() {
  // log mascarado só pra diagnosticar sem vazar credenciais
  const masked = uri.replace(/:\/\/.*@/, '://***:***@');
  console.log('🔐 Conectando no Mongo:', masked);

  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 10000,
    maxPoolSize: 10,
    family: 4, // força IPv4 e evita tentativas em ::1
  });

  console.log('🟢 Mongo conectado');
}

module.exports = { connectMongo };
