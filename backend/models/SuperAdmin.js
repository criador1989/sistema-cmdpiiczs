'use strict';

const mongoose = require('mongoose');

const SuperAdminSchema = new mongoose.Schema(
  {
    nome: {
      type: String,
      required: true,
      trim: true
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true
    },
    senhaHash: {
      type: String,
      required: true
    },
    ativo: {
      type: Boolean,
      default: true,
      index: true
    },
    ultimoLoginEm: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true,
    collection: 'superadmins'
  }
);

module.exports = mongoose.models.SuperAdmin || mongoose.model('SuperAdmin', SuperAdminSchema);