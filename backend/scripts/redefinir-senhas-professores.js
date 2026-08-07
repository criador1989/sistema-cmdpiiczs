#!/usr/bin/env node
'use strict';

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');
const mongoose = require('mongoose');
const PDFDocument = require('pdfkit');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const Usuario = require('../models/Usuario');
const Instituicao = require('../models/Instituicao');
const { validatePasswordStrength } = require('../utils/passwordPolicy');

const PASSWORD_WORDS = [
  'Acesso', 'Agenda', 'Campus', 'Classe', 'Diario', 'Equipe', 'Escola', 'Estudo',
  'Materia', 'Portal', 'Projeto', 'Registro', 'Sala', 'Turma', 'Professor', 'Conteudo',
];
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const LOWER = 'abcdefghjkmnpqrstuvwxyz';
const DIGITS = '23456789';

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      args[key] = next;
      i += 1;
    } else {
      args[key] = true;
    }
  }
  return args;
}

function usage() {
  return `
Redefinição segura das senhas de todos os professores de uma instituição

Simulação:
  node scripts/redefinir-senhas-professores.js --instituicao <ID> --dry-run

Execução definitiva:
  node scripts/redefinir-senhas-professores.js --instituicao <ID> --confirmar

Opções:
  --instituicao <ID>   ID MongoDB da instituição (obrigatório)
  --saida <pasta>      Pasta dos relatórios (opcional)
  --dry-run            Lista os professores sem alterar o banco
  --confirmar          Redefine as senhas e gera PDF protegido
  --incluir-inativos   Inclui professores inativos (não recomendado)
  --help               Exibe esta ajuda
`;
}

function randomChar(chars) {
  return chars[crypto.randomInt(0, chars.length)];
}

function generateSecureTemporaryPassword(used) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const firstIndex = crypto.randomInt(0, PASSWORD_WORDS.length);
    let secondIndex = crypto.randomInt(0, PASSWORD_WORDS.length - 1);
    if (secondIndex >= firstIndex) secondIndex += 1;

    const password = `${PASSWORD_WORDS[firstIndex]}${PASSWORD_WORDS[secondIndex]}${randomChar(UPPER)}${randomChar(DIGITS)}${randomChar(LOWER)}${randomChar(DIGITS)}${randomChar(UPPER)}${randomChar(DIGITS)}${randomChar(LOWER)}${randomChar(DIGITS)}`;

    if (!used.has(password) && validatePasswordStrength(password).ok) {
      used.add(password);
      return password;
    }
  }
  throw new Error('Não foi possível gerar senhas temporárias únicas.');
}

function normalizeText(value) {
  return String(value ?? '').replace(/\u00a0/g, ' ').trim().replace(/\s+/g, ' ');
}

function safeFilePart(value) {
  return normalizeText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'instituicao';
}

function timestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function formatDate(date = new Date()) {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'medium',
    timeZone: 'America/Rio_Branco',
  }).format(date);
}

function formatPhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  const local = digits.startsWith('55') ? digits.slice(2) : digits;
  if (local.length === 11) return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
  if (local.length === 10) return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
  return value ? String(value) : 'Não informado';
}

function csvEscape(value) {
  const text = String(value ?? '');
  if (/[;"\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

async function writeCsv(filePath, rows) {
  const headers = ['Nome', 'E-mail', 'WhatsApp', 'Ativo', 'Status', 'ID do usuário'];
  const lines = [headers.map(csvEscape).join(';')];
  for (const row of rows) {
    lines.push([
      row.nome,
      row.email,
      row.whatsapp || '',
      row.ativo === false ? 'Não' : 'Sim',
      row.status,
      row.id,
    ].map(csvEscape).join(';'));
  }
  await fsp.writeFile(filePath, `\uFEFF${lines.join('\r\n')}\r\n`, { encoding: 'utf8', mode: 0o600 });
}

function pdfOptions(password) {
  const options = {
    size: 'A4',
    margins: { top: 42, right: 42, bottom: 42, left: 42 },
    info: {
      Title: 'Credenciais temporárias dos professores - Axoriin',
      Author: 'Axoriin',
      Subject: 'Redefinição controlada de senhas de professores',
      CreationDate: new Date(),
    },
  };

  if (password) {
    options.userPassword = password;
    options.ownerPassword = crypto.randomBytes(24).toString('hex');
    options.permissions = {
      printing: 'highResolution',
      modifying: false,
      copying: false,
      annotating: false,
      fillingForms: false,
      contentAccessibility: false,
      documentAssembly: false,
    };
  }

  return options;
}

function addFooter(doc, pageNumber) {
  doc.font('Helvetica').fontSize(7).fillColor('#555555')
    .text(`Axoriin - Documento confidencial - Página ${pageNumber}`, 42, doc.page.height - 28, {
      width: doc.page.width - 84,
      align: 'center',
      lineBreak: false,
    });
  doc.fillColor('#000000');
}

function addCover(doc, institution, count, generatedAt) {
  doc.font('Helvetica-Bold').fontSize(21).text('CREDENCIAIS DE ACESSO', { align: 'center' });
  doc.moveDown(0.3);
  doc.font('Helvetica').fontSize(13).text('PROFESSORES - AXORIIN', { align: 'center' });

  doc.roundedRect(55, 150, doc.page.width - 110, 190, 8).lineWidth(1).stroke('#333333');
  doc.font('Helvetica-Bold').fontSize(11).text('Instituição', 75, 178);
  doc.font('Helvetica').fontSize(11).text(institution.nome || institution.slug || String(institution._id), 75, 198, {
    width: doc.page.width - 150,
  });
  doc.font('Helvetica-Bold').text('Gerado em', 75, 245);
  doc.font('Helvetica').text(generatedAt, 75, 265);
  doc.font('Helvetica-Bold').text('Professores com senha redefinida', 75, 300);
  doc.font('Helvetica').text(String(count), 290, 300);

  doc.font('Helvetica-Bold').fontSize(11).fillColor('#8b0000')
    .text('DOCUMENTO CONFIDENCIAL', 55, 390, { width: doc.page.width - 110, align: 'center' });
  doc.font('Helvetica').fontSize(9).fillColor('#222222')
    .text(
      'As senhas anteriores deixaram de funcionar. Entregue cada página somente ao respectivo professor e guarde este arquivo em local seguro.',
      75,
      430,
      { width: doc.page.width - 150, align: 'justify', lineGap: 3 }
    );
}

function addCredentialPage(doc, item, institution, pageNumber) {
  doc.addPage();
  doc.font('Helvetica-Bold').fontSize(17).text('ACESSO TEMPORÁRIO - PROFESSOR', { align: 'center' });
  doc.moveDown(0.4);
  doc.font('Helvetica').fontSize(10).fillColor('#444444')
    .text(institution.nome || institution.slug || String(institution._id), { align: 'center' });
  doc.fillColor('#000000');

  const x = 55;
  const y = 145;
  const width = doc.page.width - 110;
  const height = 340;
  doc.roundedRect(x, y, width, height, 8).lineWidth(1).stroke('#333333');

  const labelX = x + 25;
  const valueX = x + 155;
  const valueWidth = width - 185;
  let rowY = y + 45;

  const field = (label, value, opts = {}) => {
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#333333').text(label, labelX, rowY, { width: 120 });
    doc.font(opts.bold ? 'Helvetica-Bold' : 'Helvetica')
      .fontSize(opts.size || 11)
      .fillColor('#000000')
      .text(value || '-', valueX, rowY, { width: valueWidth });
    rowY += opts.gap || 43;
  };

  field('Nome', item.nome);
  field('Login (e-mail)', item.email);
  field('WhatsApp', formatPhone(item.whatsapp));
  field('Senha temporária', item.senhaTemporaria, { bold: true, size: 16, gap: 54 });
  field('Perfil', 'Professor');

  doc.font('Helvetica-Bold').fontSize(9).fillColor('#8b0000')
    .text('IMPORTANTE', labelX, y + 280, { width: 120 });
  doc.font('Helvetica').fontSize(8.5).fillColor('#222222')
    .text(
      'A senha anterior não funciona mais. Após entrar, mantenha esta credencial em sigilo e altere a senha assim que o sistema disponibilizar essa opção.',
      valueX,
      y + 280,
      { width: valueWidth, lineGap: 2 }
    );

  addFooter(doc, pageNumber);
}

async function writePdf(filePath, institution, items, password) {
  await new Promise((resolve, reject) => {
    const doc = new PDFDocument(pdfOptions(password));
    const stream = fs.createWriteStream(filePath, { mode: 0o600 });

    stream.on('finish', resolve);
    stream.on('error', reject);
    doc.on('error', reject);
    doc.pipe(stream);

    addCover(doc, institution, items.length, formatDate(new Date()));
    addFooter(doc, 1);

    items.forEach((item, index) => addCredentialPage(doc, item, institution, index + 2));

    doc.end();
  });
}

async function sha256(filePath) {
  const hash = crypto.createHash('sha256');
  const stream = fs.createReadStream(filePath);
  for await (const chunk of stream) hash.update(chunk);
  return hash.digest('hex');
}

async function resolveInstitution(id) {
  if (!mongoose.isValidObjectId(id)) {
    throw new Error('Por segurança, informe o ID MongoDB completo da instituição.');
  }
  const institution = await Instituicao.findById(id).select('_id nome slug sigla ativo ativa').lean();
  if (!institution) throw new Error(`Instituição não encontrada: ${id}`);
  if (institution.ativo === false || institution.ativa === false) {
    throw new Error('A instituição informada está inativa.');
  }
  return institution;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(usage());
    return;
  }

  const dryRun = Boolean(args['dry-run']);
  const confirmed = Boolean(args.confirmar);
  if (dryRun === confirmed) throw new Error('Use exatamente um modo: --dry-run ou --confirmar.');
  if (!args.instituicao) throw new Error('Informe --instituicao com o ID MongoDB.');

  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!mongoUri) throw new Error('MONGODB_URI/MONGO_URI não configurada no arquivo .env.');

  await mongoose.connect(mongoUri, {
    serverSelectionTimeoutMS: 30000,
    maxPoolSize: 10,
    autoIndex: false,
  });

  const institution = await resolveInstitution(String(args.instituicao));
  const institutionId = institution._id;

  const query = {
    tipo: 'professor',
    $or: [
      { instituicao: institutionId },
      { tenantId: institutionId },
    ],
  };

  if (!args['incluir-inativos']) query.ativo = { $ne: false };

  const users = await Usuario.find(query)
    .select('_id nome email whatsapp ativo createdAt updatedAt')
    .sort({ nome: 1, email: 1 })
    .lean();

  if (!users.length) throw new Error('Nenhum professor foi encontrado nessa instituição.');

  const outputDir = path.resolve(args.saida || path.join(__dirname, '..', '_saidas_redefinicao_professores'));
  await fsp.mkdir(outputDir, { recursive: true, mode: 0o700 });

  const stamp = timestamp();
  const part = safeFilePart(institution.slug || institution.sigla || institution.nome);
  const prefix = dryRun ? `simulacao_redefinicao_professores_${part}_${stamp}` : `redefinicao_professores_${part}_${stamp}`;
  const csvPath = path.join(outputDir, `${prefix}.csv`);
  const jsonPath = path.join(outputDir, `${prefix}.json`);

  const reportRows = users.map((user) => ({
    id: String(user._id),
    nome: user.nome || '',
    email: user.email || '',
    whatsapp: user.whatsapp || '',
    ativo: user.ativo !== false,
    status: dryRun ? 'SERÁ REDEFINIDA' : 'PENDENTE',
  }));

  if (dryRun) {
    await writeCsv(csvPath, reportRows);
    await fsp.writeFile(jsonPath, `${JSON.stringify({
      modo: 'simulacao',
      geradoEm: new Date().toISOString(),
      instituicao: { id: String(institution._id), nome: institution.nome, slug: institution.slug || null },
      totalProfessores: reportRows.length,
      incluiInativos: Boolean(args['incluir-inativos']),
      alterouBanco: false,
      relatorioCsv: csvPath,
    }, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });

    console.log('SIMULAÇÃO CONCLUÍDA - nenhuma senha foi alterada.');
    console.log(`Instituição: ${institution.nome} (${institution.slug || institution._id})`);
    console.log(`Professores que seriam afetados: ${reportRows.length}`);
    console.log(`Relatório CSV: ${csvPath}`);
    console.log(`Manifesto: ${jsonPath}`);
    return;
  }

  const pdfPassword = String(process.env.REDEFINICAO_PDF_SENHA || '').trim();
  if (!pdfPassword) throw new Error('Defina REDEFINICAO_PDF_SENHA para proteger o PDF.');

  const used = new Set();
  const credentials = users.map((user) => ({
    id: String(user._id),
    nome: user.nome || '',
    email: user.email || '',
    whatsapp: user.whatsapp || '',
    ativo: user.ativo !== false,
    senhaTemporaria: generateSecureTemporaryPassword(used),
  }));

  const finalPdfPath = path.join(outputDir, `credenciais_professores_${part}_${stamp}.pdf`);
  const tempPdfPath = `${finalPdfPath}.tmp`;

  // O PDF temporário é produzido antes de alterar o banco. Se qualquer etapa falhar,
  // ele é excluído e nenhuma senha fica sem credencial correspondente.
  await writePdf(tempPdfPath, institution, credentials, pdfPassword);

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      for (const item of credentials) {
        const user = await Usuario.findOne({
          _id: item.id,
          tipo: 'professor',
          $or: [
            { instituicao: institutionId },
            { tenantId: institutionId },
          ],
        }).session(session).select('+senha');

        if (!user) throw new Error(`Professor não encontrado durante a transação: ${item.email}`);
        user.senha = item.senhaTemporaria;
        user.onboardingProfessor = user.onboardingProfessor || {};
        user.onboardingProfessor.obrigarTrocaSenha = true;
        user.onboardingProfessor.senhaTemporariaDefinidaEm = new Date();
        user.onboardingProfessor.senhaAlteradaEm = null;
        await user.save({ session });
      }
    }, {
      readConcern: { level: 'snapshot' },
      writeConcern: { w: 'majority' },
    });
  } catch (error) {
    await fsp.rm(tempPdfPath, { force: true }).catch(() => null);
    throw error;
  } finally {
    await session.endSession();
  }

  await fsp.rename(tempPdfPath, finalPdfPath);

  for (const row of reportRows) row.status = 'SENHA REDEFINIDA';
  await writeCsv(csvPath, reportRows);
  const pdfHash = await sha256(finalPdfPath);
  await fsp.writeFile(jsonPath, `${JSON.stringify({
    modo: 'confirmado',
    geradoEm: new Date().toISOString(),
    instituicao: { id: String(institution._id), nome: institution.nome, slug: institution.slug || null },
    totalProfessores: reportRows.length,
    incluiInativos: Boolean(args['incluir-inativos']),
    alterouBanco: true,
    pdfCredenciais: finalPdfPath,
    pdfSha256: pdfHash,
    relatorioCsv: csvPath,
  }, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });

  console.log('REDEFINIÇÃO CONCLUÍDA COM SUCESSO.');
  console.log(`Instituição: ${institution.nome} (${institution.slug || institution._id})`);
  console.log(`Senhas redefinidas: ${reportRows.length}`);
  console.log(`PDF protegido: ${finalPdfPath}`);
  console.log(`Relatório CSV: ${csvPath}`);
  console.log(`Manifesto: ${jsonPath}`);
  console.log('As senhas anteriores deixaram de funcionar.');
}

main()
  .catch((error) => {
    console.error(`ERRO: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect().catch(() => null);
    }
  });
