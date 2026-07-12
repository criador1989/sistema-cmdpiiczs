'use strict';

const AssociacaoCampanha = require('../models/AssociacaoCampanha');
const AssociacaoMensagemFila = require('../models/AssociacaoMensagemFila');
const AssociacaoPessoa = require('../models/AssociacaoPessoa');
const { sendMail } = require('../utils/mailer');

function preencherTemplate(texto, pessoa = {}) {
  return String(texto || '')
    .replaceAll('{nome}', pessoa.nome || '')
    .replaceAll('{aluno}', pessoa.alunoNome || '')
    .replaceAll('{turma}', pessoa.alunoTurma || '')
    .replaceAll('{email}', pessoa.email || '')
    .replaceAll('{telefone}', pessoa.whatsapp || pessoa.telefone || '');
}

function destinoDaPessoa(pessoa, canal) {
  if (canal === 'E-mail') return pessoa.email || '';
  if (canal === 'WhatsApp') return pessoa.whatsapp || pessoa.telefone || '';
  if (canal === 'SMS') return pessoa.telefone || pessoa.whatsapp || '';
  return '';
}

async function prepararFilaCampanha(campanhaId, tenantId, usuarioId = null) {
  const campanha = await AssociacaoCampanha.findOne({ _id: campanhaId, tenantId });
  if (!campanha) throw new Error('Campanha não encontrada.');

  const filtro = { tenantId, status: 'Ativo' };
  const publico = campanha.publico || {};

  if (Array.isArray(publico.tipos) && publico.tipos.length) filtro.tipo = { $in: publico.tipos };
  if (Array.isArray(publico.turmas) && publico.turmas.length) filtro.alunoTurma = { $in: publico.turmas };
  if (publico.apenasAutorizados !== false) filtro.autorizacaoComunicacao = true;

  if (publico.apenasAniversariantes) {
    const hoje = new Date();
    const mes = hoje.getMonth() + 1;
    const dia = hoje.getDate();
    filtro.$expr = {
      $and: [
        { $eq: [{ $month: '$dataNascimento' }, mes] },
        { $eq: [{ $dayOfMonth: '$dataNascimento' }, dia] },
      ],
    };
  }

  const pessoas = await AssociacaoPessoa.find(filtro).lean();
  const operations = [];

  for (const pessoa of pessoas) {
    const destino = destinoDaPessoa(pessoa, campanha.canal);
    if (!destino) continue;

    operations.push({
      updateOne: {
        filter: { tenantId, campanha: campanha._id, pessoa: pessoa._id },
        update: {
          $setOnInsert: {
            instituicao: tenantId,
            tenantId,
            campanha: campanha._id,
            pessoa: pessoa._id,
            destinatarioNome: pessoa.nome,
            destino,
            canal: campanha.canal,
            assunto: preencherTemplate(campanha.assunto || campanha.titulo, pessoa),
            conteudo: preencherTemplate(campanha.conteudo, pessoa),
            status: 'Pendente',
            agendadaPara: campanha.agendadaPara || new Date(),
            createdBy: usuarioId,
            updatedBy: usuarioId,
          },
        },
        upsert: true,
      },
    });
  }

  if (operations.length) await AssociacaoMensagemFila.bulkWrite(operations, { ordered: false });

  const total = await AssociacaoMensagemFila.countDocuments({ tenantId, campanha: campanha._id });
  campanha.totalDestinatarios = total;
  campanha.status = campanha.agendadaPara && campanha.agendadaPara > new Date() ? 'Programada' : 'Preparada';
  campanha.updatedBy = usuarioId;
  await campanha.save();

  return { campanha, total };
}

async function processarFilaCampanha({ campanhaId, tenantId, limite = 50, mensageria = null }) {
  const campanha = await AssociacaoCampanha.findOne({ _id: campanhaId, tenantId });
  if (!campanha) throw new Error('Campanha não encontrada.');

  campanha.status = 'Em processamento';
  await campanha.save();

  const agora = new Date();
  const itens = await AssociacaoMensagemFila.find({
    tenantId,
    campanha: campanha._id,
    status: { $in: ['Pendente', 'Erro'] },
    $or: [{ agendadaPara: null }, { agendadaPara: { $lte: agora } }],
    tentativas: { $lt: 4 },
  }).sort({ createdAt: 1 }).limit(Math.min(Math.max(Number(limite) || 50, 1), 200));

  let enviadas = 0;
  let erros = 0;

  for (const item of itens) {
    item.status = 'Processando';
    item.tentativas += 1;
    await item.save();

    try {
      if (item.canal === 'E-mail') {
        const sender = mensageria?.sendEmail
          ? mensageria.sendEmail.bind(mensageria)
          : async (payload) => sendMail(payload);

        const result = await sender({
          to: item.destino,
          subject: item.assunto || campanha.titulo,
          text: item.conteudo,
          html: `<div style="font-family:Arial,sans-serif;line-height:1.6;white-space:pre-line">${String(item.conteudo).replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))}</div>`,
        });

        if (result && result.ok === false) throw new Error(result.erro || 'Falha no envio do e-mail.');
        item.provedor = result?.provider || result?.details?.providerUsed || 'Axoriin Mailer';
      } else if (item.canal === 'WhatsApp') {
        throw new Error('WhatsApp ainda não configurado neste tenant.');
      } else {
        throw new Error('Canal ainda não configurado.');
      }

      item.status = 'Enviada';
      item.enviadaEm = new Date();
      item.erro = null;
      enviadas += 1;
    } catch (error) {
      item.status = 'Erro';
      item.erro = String(error.message || error).slice(0, 1000);
      erros += 1;
    }

    await item.save();
  }

  const [pendentes, totalEnviadas, totalErros] = await Promise.all([
    AssociacaoMensagemFila.countDocuments({ tenantId, campanha: campanha._id, status: { $in: ['Pendente', 'Processando'] } }),
    AssociacaoMensagemFila.countDocuments({ tenantId, campanha: campanha._id, status: 'Enviada' }),
    AssociacaoMensagemFila.countDocuments({ tenantId, campanha: campanha._id, status: 'Erro' }),
  ]);

  campanha.totalEnviadas = totalEnviadas;
  campanha.totalErros = totalErros;
  campanha.status = pendentes === 0 ? 'Concluída' : 'Preparada';
  await campanha.save();

  return { processadas: itens.length, enviadas, erros, pendentes, campanha };
}

module.exports = {
  preencherTemplate,
  prepararFilaCampanha,
  processarFilaCampanha,
};
