#!/usr/bin/env node
'use strict';

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');
const mongoose = require('mongoose');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const Usuario = require('../models/Usuario');
const Instituicao = require('../models/Instituicao');
const {
  normalizarTelefoneBrasil,
  formatarTelefoneBrasil,
  somenteDigitos,
  BRAZIL_DDDS,
} = require('../utils/telefone');
const { validatePasswordStrength } = require('../utils/passwordPolicy');

const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HEADER_ALIASES = {
  nome: new Set(['nome', 'nome completo', 'professor', 'docente', 'nome do professor', 'nome professor']),
  email: new Set(['email', 'e mail', 'e-mail', 'email institucional', 'e mail institucional', 'correio eletronico', 'correio eletrônico']),
  whatsapp: new Set(['whatsapp', 'whats app', 'whatsapp do professor', 'telefone', 'telefone whatsapp', 'celular', 'celular whatsapp', 'contato', 'numero whatsapp', 'numero de whatsapp', 'número whatsapp']),
  turmas: new Set(['turma', 'turmas', 'classes', 'classe']),
};
const PASSWORD_WORDS = [
  'Acesso', 'Agenda', 'Campus', 'Classe', 'Diario', 'Equipe', 'Escola', 'Estudo',
  'Materia', 'Portal', 'Projeto', 'Registro', 'Sala', 'Turma', 'Professor', 'Conteudo',
];
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const LOWER = 'abcdefghjkmnpqrstuvwxyz';
const DIGITS = '23456789';

function usage() {
  return `
Importador seguro de professores do Axoriin

Simulação:
  node scripts/importar-professores.js --arquivo "C:\\caminho\\professores.xlsx" --instituicao "cmdpii-czs" --dry-run

Importação definitiva:
  node scripts/importar-professores.js --arquivo "C:\\caminho\\professores.xlsx" --instituicao "cmdpii-czs" --confirmar

Opções:
  --arquivo <caminho>                  Planilha .xlsx ou .csv (obrigatório)
  --instituicao <id|slug|sigla|nome>   Instituição de destino (obrigatório)
  --aba <nome>                         Aba da planilha (opcional)
  --saida <pasta>                      Pasta dos relatórios (opcional)
  --dry-run                            Simula sem alterar o banco
  --confirmar                          Executa a importação
  --permitir-parcial                   Importa linhas válidas mesmo havendo linhas inválidas
  --sem-transacao                      Executa sem transação MongoDB (somente quando necessário)
  --corrigir-celular-antigo            Acrescenta o nono dígito em celular brasileiro antigo
  --ddd-padrao <DDD>                   Completa números sem DDD (use somente quando todos forem do mesmo DDD)
  --help                               Mostra esta ajuda

Segurança do PDF:
  Defina IMPORTACAO_PDF_SENHA no ambiente para criptografar o PDF de credenciais.
  As senhas temporárias não são exibidas no terminal nem gravadas no CSV técnico.
`;
}

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

function normalizeText(value) {
  return String(value ?? '')
    .replace(/\u00a0/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function normalizeHeader(value) {
  return normalizeText(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[_/\\-]+/g, ' ')
    .replace(/[^a-z0-9 ]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function cellToText(cell) {
  if (!cell) return '';
  const value = cell.value;
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    if (Array.isArray(value.richText)) return normalizeText(value.richText.map(item => item.text || '').join(''));
    if (Object.prototype.hasOwnProperty.call(value, 'result')) return normalizeText(value.result);
    if (value.text) return normalizeText(value.text);
    if (value.hyperlink) return normalizeText(value.text || value.hyperlink);
  }
  return normalizeText(value);
}

function detectDelimiter(filePath) {
  const content = fs.readFileSync(filePath, 'utf8').slice(0, 8192);
  const firstLine = content.split(/\r?\n/).find(line => line.trim()) || '';
  const candidates = [';', ',', '\t'];
  let best = ';';
  let bestCount = -1;
  for (const delimiter of candidates) {
    const count = firstLine.split(delimiter).length - 1;
    if (count > bestCount) {
      best = delimiter;
      bestCount = count;
    }
  }
  return best;
}

async function loadWorksheet(filePath, sheetName) {
  const extension = path.extname(filePath).toLowerCase();
  const workbook = new ExcelJS.Workbook();

  if (extension === '.xlsx') {
    await workbook.xlsx.readFile(filePath);
  } else if (extension === '.csv') {
    const delimiter = detectDelimiter(filePath);
    await workbook.csv.readFile(filePath, {
      parserOptions: { delimiter, quote: '"', headers: false, ignoreEmpty: true, trim: true },
    });
  } else {
    throw new Error('Formato não suportado. Use uma planilha .xlsx ou .csv.');
  }

  if (!workbook.worksheets.length) throw new Error('A planilha não possui abas ou dados legíveis.');

  if (sheetName) {
    const target = workbook.worksheets.find(ws => ws.name.toLowerCase() === String(sheetName).toLowerCase());
    if (!target) throw new Error(`A aba "${sheetName}" não foi encontrada.`);
    return target;
  }

  for (const ws of workbook.worksheets) {
    try {
      findHeaderRow(ws);
      return ws;
    } catch {
      // tenta a próxima aba
    }
  }

  throw new Error('Nenhuma aba contém as colunas obrigatórias: nome, e-mail e WhatsApp.');
}

function findHeaderRow(worksheet) {
  const max = Math.min(Math.max(worksheet.rowCount, 1), 20);
  for (let rowNumber = 1; rowNumber <= max; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const mapping = {};
    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const header = normalizeHeader(cellToText(cell));
      for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
        if (!mapping[field] && aliases.has(header)) mapping[field] = colNumber;
      }
    });
    if (mapping.nome && mapping.email && mapping.whatsapp) return { rowNumber, mapping };
  }
  throw new Error(`A aba "${worksheet.name}" não contém as colunas obrigatórias: nome, e-mail e WhatsApp.`);
}

function parseTurmas(value) {
  return [...new Set(
    normalizeText(value)
      .split(/[;,|]/)
      .map(item => normalizeText(item))
      .filter(Boolean)
  )];
}

function normalizeEmail(value) {
  return normalizeText(value).toLowerCase();
}

function normalizeName(value) {
  return normalizeText(value);
}

function normalizeDdd(value) {
  const ddd = somenteDigitos(value);
  if (!ddd) return null;
  if (ddd.length !== 2 || !BRAZIL_DDDS.has(ddd)) throw new Error(`DDD padrão inválido: ${value}`);
  return ddd;
}

function tryNormalizeWhatsapp(value, options = {}) {
  const original = normalizeText(value);
  let info = normalizarTelefoneBrasil(original);
  if (info.valido) return info;

  let digits = somenteDigitos(original);
  if (!digits) return info;

  while (digits.startsWith('00')) digits = digits.slice(2);
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55')) digits = digits.slice(2);
  if (/^0\d{10,11}$/.test(digits)) digits = digits.slice(1);
  if (/^0\d{2}\d{10,11}$/.test(digits)) digits = digits.slice(3);

  if ((digits.length === 8 || digits.length === 9) && options.dddPadrao) {
    digits = `${options.dddPadrao}${digits}`;
  }

  if (options.corrigirCelularAntigo && digits.length === 10) {
    const ddd = digits.slice(0, 2);
    const assinante = digits.slice(2);
    if (BRAZIL_DDDS.has(ddd) && /^[6-9]\d{7}$/.test(assinante)) {
      digits = `${ddd}9${assinante}`;
    }
  }

  info = normalizarTelefoneBrasil(digits);
  return info;
}

function randomChar(chars) {
  return chars[crypto.randomInt(0, chars.length)];
}

function generateSecureTemporaryPassword(used) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const firstWordIndex = crypto.randomInt(0, PASSWORD_WORDS.length);
    let secondWordIndex = crypto.randomInt(0, PASSWORD_WORDS.length - 1);
    if (secondWordIndex >= firstWordIndex) secondWordIndex += 1;
    const firstWord = PASSWORD_WORDS[firstWordIndex];
    const secondWord = PASSWORD_WORDS[secondWordIndex];
    const password = `${firstWord}${secondWord}${randomChar(UPPER)}${randomChar(DIGITS)}${randomChar(LOWER)}${randomChar(DIGITS)}${randomChar(UPPER)}${randomChar(DIGITS)}${randomChar(LOWER)}${randomChar(DIGITS)}`;
    if (!used.has(password) && validatePasswordStrength(password).ok) {
      used.add(password);
      return password;
    }
  }
  throw new Error('Não foi possível gerar uma senha temporária única.');
}

function statusLabel(status) {
  const labels = {
    PRONTO: 'Pronto para importar',
    CRIADO: 'Criado',
    JA_EXISTENTE: 'Já existente',
    EMAIL_EM_OUTRA_INSTITUICAO: 'E-mail em outra instituição',
    DUPLICADO_NA_PLANILHA: 'Duplicado na planilha',
    INVALIDO: 'Inválido',
    IGNORADO: 'Ignorado',
    FALHA: 'Falha',
    CANCELADO_POR_VALIDACAO: 'Cancelado por validação',
  };
  return labels[status] || status;
}

function csvEscape(value) {
  const text = String(value ?? '');
  if (/[;"\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

async function writeTechnicalCsv(filePath, rows) {
  const headers = [
    'Linha', 'Nome', 'E-mail', 'WhatsApp informado', 'WhatsApp normalizado',
    'Turmas', 'Status', 'Observação', 'ID do usuário',
  ];
  const lines = [headers.map(csvEscape).join(';')];
  for (const row of rows) {
    lines.push([
      row.linha,
      row.nome,
      row.email,
      row.whatsappOriginal,
      row.whatsappFormatado || row.whatsappE164 || '',
      (row.turmas || []).join(', '),
      statusLabel(row.status),
      row.observacao || '',
      row.usuarioId || '',
    ].map(csvEscape).join(';'));
  }
  await fsp.writeFile(filePath, `\uFEFF${lines.join('\r\n')}\r\n`, { encoding: 'utf8', mode: 0o600 });
}

function documentOptions(pdfPassword) {
  const options = {
    size: 'A4',
    margins: { top: 42, right: 42, bottom: 42, left: 42 },
    info: {
      Title: 'Credenciais de acesso dos professores — Axoriin',
      Author: 'Axoriin',
      Subject: 'Credenciais temporárias de professores',
      Keywords: 'Axoriin, professores, credenciais',
      CreationDate: new Date(),
    },
  };
  if (pdfPassword) {
    options.userPassword = pdfPassword;
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
  const y = doc.page.height - 30;
  doc.font('Helvetica').fontSize(7).fillColor('#555555')
    .text(`Axoriin • Documento confidencial • Página ${pageNumber}`, 42, y, {
      width: doc.page.width - 84,
      align: 'center',
      lineBreak: false,
    });
  doc.fillColor('#000000');
}

function addCover(doc, institution, meta) {
  doc.font('Helvetica-Bold').fontSize(22).text('CREDENCIAIS DE ACESSO', { align: 'center' });
  doc.moveDown(0.25);
  doc.font('Helvetica').fontSize(14).text('PROFESSORES — AXORIIN', { align: 'center' });
  doc.moveDown(1.5);
  doc.roundedRect(55, 150, doc.page.width - 110, 175, 8).lineWidth(1).stroke('#333333');
  doc.font('Helvetica-Bold').fontSize(12).fillColor('#111111').text('Instituição', 75, 175);
  doc.font('Helvetica').fontSize(12).text(institution.nome || institution.slug || String(institution._id), 75, 195, { width: doc.page.width - 150 });
  doc.font('Helvetica-Bold').text('Gerado em', 75, 235);
  doc.font('Helvetica').text(meta.generatedAt, 75, 255);
  doc.font('Helvetica-Bold').text('Quantidade de credenciais', 75, 290);
  doc.font('Helvetica').text(String(meta.credentialCount), 245, 290);
  doc.moveDown(3);
  doc.font('Helvetica-Bold').fontSize(11).fillColor('#8b0000').text('DOCUMENTO CONFIDENCIAL', 55, 365, {
    width: doc.page.width - 110,
    align: 'center',
  });
  doc.moveDown(0.7);
  doc.font('Helvetica').fontSize(9).fillColor('#222222').text(
    'Este arquivo contém senhas temporárias. Guarde-o em local seguro, entregue cada credencial somente ao respectivo professor e exclua o arquivo quando não for mais necessário.',
    70,
    400,
    { width: doc.page.width - 140, align: 'justify', lineGap: 3 }
  );
  doc.moveDown(1);
  doc.text(
    meta.encrypted
      ? 'O PDF foi protegido por senha.'
      : 'O PDF não foi protegido por senha. Para criptografá-lo, defina IMPORTACAO_PDF_SENHA antes da execução definitiva.',
    70,
    470,
    { width: doc.page.width - 140, align: 'center' }
  );
}

function drawCredentialCard(doc, item, institution, top) {
  const x = 48;
  const width = doc.page.width - 96;
  const height = 285;
  doc.roundedRect(x, top, width, height, 8).lineWidth(1).stroke('#2f2f2f');

  doc.font('Helvetica-Bold').fontSize(13).fillColor('#111111')
    .text('ACESSO TEMPORÁRIO — PROFESSOR', x + 18, top + 18, { width: width - 36, align: 'center' });

  const labelX = x + 22;
  const valueX = x + 145;
  const valueWidth = width - 175;
  let y = top + 62;

  const field = (label, value, options = {}) => {
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#333333').text(label, labelX, y, { width: 115 });
    doc.font(options.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(options.size || 10).fillColor('#000000')
      .text(value || '—', valueX, y, { width: valueWidth, lineBreak: true });
    y += options.gap || 31;
  };

  field('Nome', item.nome);
  field('E-mail', item.email);
  field('WhatsApp', item.whatsappFormatado || item.whatsappE164);
  field('Senha temporária', item.senhaTemporaria, { bold: true, size: 15, gap: 39 });
  field('Perfil', 'Professor');
  field('Instituição', institution.nome || institution.slug || String(institution._id), { gap: 34 });

  doc.moveTo(x + 20, top + height - 58).lineTo(x + width - 20, top + height - 58).stroke('#b0b0b0');
  doc.font('Helvetica').fontSize(8).fillColor('#333333').text(
    'Orientação: faça o primeiro acesso e altere a senha assim que possível. Não compartilhe esta credencial.',
    x + 22,
    top + height - 45,
    { width: width - 44, align: 'center' }
  );
}

async function writeCredentialsPdf(filePath, items, institution, pdfPassword) {
  await new Promise((resolve, reject) => {
    const output = fs.createWriteStream(filePath, { mode: 0o600 });
    const doc = new PDFDocument(documentOptions(pdfPassword));
    let pageNumber = 1;

    output.on('finish', resolve);
    output.on('error', reject);
    doc.on('error', reject);
    doc.pipe(output);

    const generatedAt = new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'full',
      timeStyle: 'medium',
      timeZone: 'America/Rio_Branco',
    }).format(new Date());

    addCover(doc, institution, {
      generatedAt,
      credentialCount: items.length,
      encrypted: Boolean(pdfPassword),
    });
    addFooter(doc, pageNumber);

    for (const item of items) {
      doc.addPage();
      pageNumber += 1;
      drawCredentialCard(doc, item, institution, 90);
      addFooter(doc, pageNumber);
    }

    doc.end();
  });
}

async function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  await new Promise((resolve, reject) => {
    const stream = fs.createReadStream(filePath);
    stream.on('data', chunk => hash.update(chunk));
    stream.on('end', resolve);
    stream.on('error', reject);
  });
  return hash.digest('hex');
}

function timestamp() {
  const d = new Date();
  const pad = value => String(value).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function safeFilePart(value) {
  return normalizeHeader(value).replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').slice(0, 50) || 'instituicao';
}

async function resolveInstitution(value) {
  const term = normalizeText(value);
  if (!term) throw new Error('Informe a instituição com --instituicao.');

  let institution = null;
  if (mongoose.isValidObjectId(term)) {
    institution = await Instituicao.findById(term).lean();
  } else {
    const exact = new RegExp(`^${escapeRegex(term)}$`, 'i');
    const matches = await Instituicao.find({
      $or: [{ slug: exact }, { sigla: exact }, { codigo: exact }, { nome: exact }, { nomeExibicao: exact }],
    }).lean();
    if (matches.length > 1) {
      throw new Error(`Mais de uma instituição corresponde a "${term}". Use o ID ou o slug.`);
    }
    institution = matches[0] || null;
  }

  if (!institution) throw new Error(`Instituição não encontrada: ${term}`);
  if (institution.ativo === false || institution.ativa === false) {
    throw new Error(`A instituição "${institution.nome}" está inativa.`);
  }
  return institution;
}

async function buildRows(worksheet, options) {
  const { rowNumber, mapping } = findHeaderRow(worksheet);
  const rows = [];
  const seenEmails = new Map();

  for (let line = rowNumber + 1; line <= worksheet.rowCount; line += 1) {
    const row = worksheet.getRow(line);
    const raw = {
      nome: cellToText(row.getCell(mapping.nome)),
      email: cellToText(row.getCell(mapping.email)),
      whatsapp: cellToText(row.getCell(mapping.whatsapp)),
      turmas: mapping.turmas ? cellToText(row.getCell(mapping.turmas)) : '',
    };

    if (!raw.nome && !raw.email && !raw.whatsapp && !raw.turmas) continue;

    const item = {
      linha: line,
      nome: normalizeName(raw.nome),
      email: normalizeEmail(raw.email),
      whatsappOriginal: normalizeText(raw.whatsapp),
      whatsappE164: '',
      whatsappFormatado: '',
      turmas: parseTurmas(raw.turmas),
      status: 'PRONTO',
      observacao: '',
      senhaTemporaria: null,
      usuarioId: null,
    };

    const errors = [];
    if (item.nome.length < 2) errors.push('Nome ausente ou muito curto.');
    if (!EMAIL_RX.test(item.email)) errors.push('E-mail inválido.');

    const phone = tryNormalizeWhatsapp(item.whatsappOriginal, options);
    if (!phone.valido) {
      errors.push(`WhatsApp inválido: ${phone.motivo}`);
    } else {
      item.whatsappE164 = phone.e164;
      item.whatsappFormatado = formatarTelefoneBrasil(phone.e164);
    }

    if (item.email && seenEmails.has(item.email)) {
      item.status = 'DUPLICADO_NA_PLANILHA';
      item.observacao = `Mesmo e-mail já informado na linha ${seenEmails.get(item.email)}.`;
    } else if (errors.length) {
      item.status = 'INVALIDO';
      item.observacao = errors.join(' ');
    } else {
      seenEmails.set(item.email, line);
    }

    rows.push(item);
  }

  if (!rows.length) throw new Error('Nenhum professor foi encontrado após o cabeçalho.');
  return rows;
}

async function markExistingUsers(rows, institution) {
  const emails = [...new Set(rows.filter(row => row.email).map(row => row.email))];
  const existing = await Usuario.find({ email: { $in: emails } })
    .select('_id nome email tipo instituicao tenantId whatsapp')
    .lean();

  const byEmail = new Map();
  for (const user of existing) {
    const email = normalizeEmail(user.email);
    if (!byEmail.has(email)) byEmail.set(email, []);
    byEmail.get(email).push(user);
  }

  for (const row of rows) {
    if (row.status !== 'PRONTO') continue;
    const users = byEmail.get(row.email) || [];
    const inTarget = users.find(user => String(user.instituicao || user.tenantId || '') === String(institution._id));
    if (inTarget) {
      row.status = 'JA_EXISTENTE';
      row.usuarioId = String(inTarget._id);
      row.observacao = `Usuário já cadastrado nesta instituição com perfil ${inTarget.tipo || 'não identificado'}. Nenhuma alteração realizada.`;
      continue;
    }
    if (users.length) {
      row.status = 'EMAIL_EM_OUTRA_INSTITUICAO';
      row.observacao = 'Já existe usuário com este e-mail em outra instituição. O importador não cria duplicata nem vínculo automático.';
    }
  }
}

async function insertWithTransaction(items, institution) {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      for (const item of items) {
        const user = new Usuario({
          nome: item.nome,
          email: item.email,
          senha: item.senhaTemporaria,
          whatsapp: item.whatsappE164,
          tipo: 'professor',
          portal: 'institucional',
          instituicao: institution._id,
          tenantId: institution._id,
          turmas: item.turmas,
          ativo: true,
          emailVerificado: true,
          emailVerificadoEm: new Date(),
          onboardingProfessor: {
            obrigarTrocaSenha: true,
            senhaTemporariaDefinidaEm: new Date(),
            senhaAlteradaEm: null,
          },
        });
        await user.save({ session });
        item.usuarioId = String(user._id);
      }
    }, {
      readConcern: { level: 'snapshot' },
      writeConcern: { w: 'majority' },
    });
  } finally {
    await session.endSession();
  }
}

async function insertWithoutTransaction(items, institution) {
  const created = [];
  try {
    for (const item of items) {
      const user = new Usuario({
        nome: item.nome,
        email: item.email,
        senha: item.senhaTemporaria,
        whatsapp: item.whatsappE164,
        tipo: 'professor',
        portal: 'institucional',
        instituicao: institution._id,
        tenantId: institution._id,
        turmas: item.turmas,
        ativo: true,
        emailVerificado: true,
        emailVerificadoEm: new Date(),
        onboardingProfessor: {
          obrigarTrocaSenha: true,
          senhaTemporariaDefinidaEm: new Date(),
          senhaAlteradaEm: null,
        },
      });
      await user.save();
      item.usuarioId = String(user._id);
      created.push(user._id);
    }
  } catch (error) {
    if (created.length) {
      await Usuario.deleteMany({ _id: { $in: created }, instituicao: institution._id }).catch(() => null);
    }
    throw error;
  }
}

function countStatuses(rows) {
  const counts = {};
  for (const row of rows) counts[row.status] = (counts[row.status] || 0) + 1;
  return counts;
}

async function writeManifest(filePath, data) {
  await fsp.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
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
  if (!args.arquivo) throw new Error('Informe a planilha com --arquivo.');
  if (!args.instituicao) throw new Error('Informe a instituição com --instituicao.');

  const spreadsheetPath = path.resolve(String(args.arquivo));
  await fsp.access(spreadsheetPath, fs.constants.R_OK);

  const dddPadrao = args['ddd-padrao'] ? normalizeDdd(args['ddd-padrao']) : null;
  const worksheet = await loadWorksheet(spreadsheetPath, args.aba);
  const rows = await buildRows(worksheet, {
    dddPadrao,
    corrigirCelularAntigo: Boolean(args['corrigir-celular-antigo']),
  });

  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!mongoUri) throw new Error('MONGODB_URI/MONGO_URI não configurada no arquivo .env.');

  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 30000, maxPoolSize: 10, autoIndex: false });
  const institution = await resolveInstitution(args.instituicao);
  await markExistingUsers(rows, institution);

  const outputDir = path.resolve(args.saida || path.join(__dirname, '..', '_saidas_importacao_professores'));
  await fsp.mkdir(outputDir, { recursive: true, mode: 0o700 });

  const stamp = timestamp();
  const institutionPart = safeFilePart(institution.slug || institution.sigla || institution.nome);
  const prefix = dryRun ? `simulacao_professores_${institutionPart}_${stamp}` : `importacao_professores_${institutionPart}_${stamp}`;
  const csvPath = path.join(outputDir, `${prefix}.csv`);
  const manifestPath = path.join(outputDir, `${prefix}.json`);
  const finalPdfPath = path.join(outputDir, `credenciais_professores_${institutionPart}_${stamp}.pdf`);
  const tempPdfPath = `${finalPdfPath}.tmp`;

  const invalidRows = rows.filter(row => ['INVALIDO', 'DUPLICADO_NA_PLANILHA'].includes(row.status));
  const readyRows = rows.filter(row => row.status === 'PRONTO');

  if (dryRun) {
    await writeTechnicalCsv(csvPath, rows);
    const sourceHash = await sha256File(spreadsheetPath);
    await writeManifest(manifestPath, {
      modo: 'simulacao',
      geradoEm: new Date().toISOString(),
      instituicao: { id: String(institution._id), nome: institution.nome, slug: institution.slug || null },
      planilha: { caminho: spreadsheetPath, sha256: sourceHash, aba: worksheet.name },
      opcoes: { dddPadrao, corrigirCelularAntigo: Boolean(args['corrigir-celular-antigo']) },
      totais: countStatuses(rows),
      relatorioCsv: csvPath,
      alterouBanco: false,
    });

    console.log('SIMULAÇÃO CONCLUÍDA — nenhuma alteração foi feita no banco.');
    console.log(`Instituição: ${institution.nome} (${institution.slug || institution._id})`);
    console.log(`Aba analisada: ${worksheet.name}`);
    console.log(`Total de linhas: ${rows.length}`);
    console.log(`Prontos para criar: ${readyRows.length}`);
    console.log(`Linhas inválidas: ${invalidRows.length}`);
    console.log(`Relatório CSV: ${csvPath}`);
    console.log(`Manifesto: ${manifestPath}`);
    return;
  }

  if (invalidRows.length && !args['permitir-parcial']) {
    for (const row of readyRows) {
      row.status = 'CANCELADO_POR_VALIDACAO';
      row.observacao = 'Importação cancelada porque a planilha contém linhas inválidas. Corrija a planilha ou use --permitir-parcial.';
    }
    await writeTechnicalCsv(csvPath, rows);
    await writeManifest(manifestPath, {
      modo: 'cancelado',
      geradoEm: new Date().toISOString(),
      instituicao: { id: String(institution._id), nome: institution.nome, slug: institution.slug || null },
      planilha: { caminho: spreadsheetPath, sha256: await sha256File(spreadsheetPath), aba: worksheet.name },
      totais: countStatuses(rows),
      motivo: 'Existem linhas inválidas e --permitir-parcial não foi informado.',
      alterouBanco: false,
      relatorioCsv: csvPath,
    });
    throw new Error(`Importação cancelada: ${invalidRows.length} linha(s) inválida(s). Consulte ${csvPath}`);
  }

  if (!readyRows.length) {
    await writeTechnicalCsv(csvPath, rows);
    await writeManifest(manifestPath, {
      modo: 'sem-alteracoes',
      geradoEm: new Date().toISOString(),
      instituicao: { id: String(institution._id), nome: institution.nome, slug: institution.slug || null },
      totais: countStatuses(rows),
      alterouBanco: false,
      relatorioCsv: csvPath,
    });
    console.log('Nenhum professor novo precisa ser criado.');
    console.log(`Relatório CSV: ${csvPath}`);
    return;
  }

  const usedPasswords = new Set();
  for (const row of readyRows) row.senhaTemporaria = generateSecureTemporaryPassword(usedPasswords);

  const pdfPassword = normalizeText(process.env.IMPORTACAO_PDF_SENHA);
  await writeCredentialsPdf(tempPdfPath, readyRows, institution, pdfPassword || null);

  try {
    if (args['sem-transacao']) {
      await insertWithoutTransaction(readyRows, institution);
    } else {
      await insertWithTransaction(readyRows, institution);
    }
  } catch (error) {
    await fsp.rm(tempPdfPath, { force: true }).catch(() => null);
    for (const row of readyRows) {
      row.status = 'FALHA';
      row.observacao = `Nenhum cadastro foi confirmado: ${error.message}`;
      row.usuarioId = null;
      row.senhaTemporaria = null;
    }
    await writeTechnicalCsv(csvPath, rows).catch(() => null);
    await writeManifest(manifestPath, {
      modo: 'falha',
      geradoEm: new Date().toISOString(),
      instituicao: { id: String(institution._id), nome: institution.nome, slug: institution.slug || null },
      totais: countStatuses(rows),
      erro: { nome: error.name, mensagem: error.message, codigo: error.code || null },
      alterouBanco: false,
      observacao: args['sem-transacao']
        ? 'Foi tentada compensação automática dos usuários criados nesta execução.'
        : 'A transação foi abortada.',
      relatorioCsv: csvPath,
    }).catch(() => null);

    const unsupportedTransaction = /Transaction numbers are only allowed|replica set|mongos/i.test(error.message || '');
    if (unsupportedTransaction && !args['sem-transacao']) {
      throw new Error('O MongoDB não oferece transações neste ambiente. Revise o relatório e execute novamente com --sem-transacao somente se estiver seguro.');
    }
    throw error;
  }

  for (const row of readyRows) {
    row.status = 'CRIADO';
    row.observacao = 'Professor criado com sucesso. A senha temporária está somente no PDF protegido/local.';
  }

  await fsp.rename(tempPdfPath, finalPdfPath);
  await writeTechnicalCsv(csvPath, rows);

  const [sourceHash, pdfHash, csvHash] = await Promise.all([
    sha256File(spreadsheetPath),
    sha256File(finalPdfPath),
    sha256File(csvPath),
  ]);

  await writeManifest(manifestPath, {
    modo: 'confirmado',
    geradoEm: new Date().toISOString(),
    instituicao: { id: String(institution._id), nome: institution.nome, slug: institution.slug || null },
    planilha: { caminho: spreadsheetPath, sha256: sourceHash, aba: worksheet.name },
    opcoes: {
      transacao: !args['sem-transacao'],
      permitirParcial: Boolean(args['permitir-parcial']),
      dddPadrao,
      corrigirCelularAntigo: Boolean(args['corrigir-celular-antigo']),
      pdfProtegidoPorSenha: Boolean(pdfPassword),
    },
    totais: countStatuses(rows),
    arquivos: {
      pdfCredenciais: { caminho: finalPdfPath, sha256: pdfHash },
      csvTecnico: { caminho: csvPath, sha256: csvHash, contemSenhas: false },
    },
    alterouBanco: true,
  });

  console.log('IMPORTAÇÃO CONCLUÍDA COM SUCESSO.');
  console.log(`Instituição: ${institution.nome} (${institution.slug || institution._id})`);
  console.log(`Professores criados: ${readyRows.length}`);
  console.log(`PDF de credenciais: ${finalPdfPath}`);
  console.log(`Relatório técnico sem senhas: ${csvPath}`);
  console.log(`Manifesto: ${manifestPath}`);
  if (!pdfPassword) {
    console.warn('ATENÇÃO: o PDF não foi criptografado. Defina IMPORTACAO_PDF_SENHA em uma próxima execução.');
  }
  console.log('As senhas não foram exibidas no terminal.');
}

if (require.main === module) {
  main()
    .catch(error => {
      console.error(`ERRO: ${error.message}`);
      process.exitCode = 1;
    })
    .finally(async () => {
      await mongoose.disconnect().catch(() => null);
    });
}

module.exports = {
  parseArgs,
  normalizeHeader,
  detectDelimiter,
  findHeaderRow,
  parseTurmas,
  normalizeEmail,
  tryNormalizeWhatsapp,
  generateSecureTemporaryPassword,
  statusLabel,
  buildRows,
};
