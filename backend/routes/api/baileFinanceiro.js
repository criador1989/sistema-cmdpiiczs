'use strict';

const express = require('express');
const multer = require('multer');

const BaileMovimentoFinanceiro = require('../../models/BaileMovimentoFinanceiro');
const BaileContrato = require('../../models/BaileContrato');

const { autenticar } = require('../../middleware/autenticacao');
const { requireTenant } = require('../../middleware/tenantScope');
const { uploadArquivoBaile, deletarArquivoBaile } = require('../../utils/s3BaileUpload');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 12 * 1024 * 1024,
  },
});

function getInstituicaoId(req) {
  return (
    req.instituicao?._id ||
    req.instituicaoId ||
    req.tenant?._id ||
    req.usuario?.instituicao ||
    req.user?.instituicao
  );
}

function getUsuarioId(req) {
  return req.usuario?._id || req.user?._id || null;
}

function getUsuarioNome(req) {
  return req.usuario?.nome || req.user?.nome || req.usuario?.email || req.user?.email || '';
}

function numeroSeguro(valor, padrao = 0) {
  const n = Number(valor);
  return Number.isFinite(n) ? n : padrao;
}

function dataOuNull(valor) {
  if (!valor) return null;
  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? null : d;
}

function resumoMovimento(movimento) {
  return movimento.resumo ? movimento.resumo() : movimento.toObject();
}

function limparCsv(valor) {
  const texto = String(valor ?? '')
    .replace(/\r?\n|\r/g, ' ')
    .replace(/"/g, '""');

  return `"${texto}"`;
}

function gerarCsv(linhas = [], colunas = []) {
  const cabecalho = colunas.map((c) => limparCsv(c.label)).join(';');

  const corpo = linhas.map((linha) => {
    return colunas.map((c) => limparCsv(c.valor(linha))).join(';');
  });

  return [cabecalho, ...corpo].join('\n');
}

function enviarCsv(res, nomeArquivo, conteudo) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${nomeArquivo}"`
  );

  res.send(`\uFEFF${conteudo}`);
}

async function obterFinanceiroAlunos(instituicao, anoLetivo) {
  const contratos = await BaileContrato.find({
    instituicao,
    anoLetivo,
  }).lean();

  let valorPrevistoAlunos = 0;
  let valorRecebidoAlunos = 0;
  let valorPendenteAlunos = 0;

  const pagamentos = [];

  contratos.forEach((contrato) => {
    const totalContrato = numeroSeguro(contrato.valorTotal, 0);

    const totalPagoContrato = (contrato.pagamentos || []).reduce((acc, pg) => {
      return acc + numeroSeguro(pg.valor, 0);
    }, 0);

    valorPrevistoAlunos += totalContrato;
    valorRecebidoAlunos += totalPagoContrato;
    valorPendenteAlunos += Math.max(totalContrato - totalPagoContrato, 0);

    (contrato.pagamentos || []).forEach((pg) => {
      pagamentos.push({
        contratoId: contrato._id,
        alunoNome: contrato.alunoNome,
        turma: contrato.turma,
        dataPagamento: pg.dataPagamento,
        valor: numeroSeguro(pg.valor, 0),
        formaPagamento: pg.formaPagamento,
        referenciaParcela: pg.referenciaParcela,
        observacao: pg.observacao,
        comprovanteUrl: pg.comprovanteUrl,
        registradoPorNome: pg.registradoPorNome,
      });
    });
  });

  return {
    contratos,
    pagamentos,
    valorPrevistoAlunos,
    valorRecebidoAlunos,
    valorPendenteAlunos,
  };
}

router.get('/', autenticar, requireTenant, async (req, res) => {
  try {
    const instituicao = getInstituicaoId(req);

    const {
      anoLetivo = 2026,
      tipo,
      origem,
      categoria,
      status,
      busca,
    } = req.query;

    const filtro = {
      instituicao,
      anoLetivo: Number(anoLetivo),
    };

    if (tipo) filtro.tipo = tipo;
    if (origem) filtro.origem = origem;
    if (categoria) filtro.categoria = categoria;
    if (status) filtro.status = status;

    if (busca) {
      filtro.$or = [
        { descricao: { $regex: busca, $options: 'i' } },
        { categoria: { $regex: busca, $options: 'i' } },
        { pessoaNome: { $regex: busca, $options: 'i' } },
        { observacoes: { $regex: busca, $options: 'i' } },
      ];
    }

    const movimentos = await BaileMovimentoFinanceiro.find(filtro).sort({
      dataPagamento: -1,
      dataVencimento: 1,
      createdAt: -1,
    });

    res.json({
      ok: true,
      total: movimentos.length,
      movimentos: movimentos.map(resumoMovimento),
    });
  } catch (err) {
    console.error('[BAILE_FINANCEIRO][LISTAR]', err);
    res.status(500).json({
      ok: false,
      message: 'Erro ao listar movimentos financeiros do baile.',
    });
  }
});

router.get('/dashboard', autenticar, requireTenant, async (req, res) => {
  try {
    const instituicao = getInstituicaoId(req);
    const anoLetivo = Number(req.query.anoLetivo || 2026);

    const movimentos = await BaileMovimentoFinanceiro.find({
      instituicao,
      anoLetivo,
      status: { $ne: 'cancelado' },
    }).lean();

    const financeiroAlunos = await obterFinanceiroAlunos(instituicao, anoLetivo);

    const entradasAvulsas = movimentos.filter((m) => m.tipo === 'entrada');
    const saidas = movimentos.filter((m) => m.tipo === 'saida');

    const totalEntradasAvulsasPrevisto = entradasAvulsas.reduce(
      (acc, m) => acc + numeroSeguro(m.valorPrevisto, 0),
      0
    );

    const totalEntradasAvulsasRecebido = entradasAvulsas.reduce(
      (acc, m) => acc + numeroSeguro(m.valorPago, 0),
      0
    );

    const totalEntradasAvulsasPendente = entradasAvulsas.reduce(
      (acc, m) => acc + numeroSeguro(m.valorPendente, 0),
      0
    );

    const totalSaidasPrevisto = saidas.reduce(
      (acc, m) => acc + numeroSeguro(m.valorPrevisto, 0),
      0
    );

    const totalSaidasPago = saidas.reduce(
      (acc, m) => acc + numeroSeguro(m.valorPago, 0),
      0
    );

    const totalSaidasPendente = saidas.reduce(
      (acc, m) => acc + numeroSeguro(m.valorPendente, 0),
      0
    );

    const receitaTotalPrevista =
      financeiroAlunos.valorPrevistoAlunos + totalEntradasAvulsasPrevisto;

    const receitaTotalRecebida =
      financeiroAlunos.valorRecebidoAlunos + totalEntradasAvulsasRecebido;

    const saldoAtual = receitaTotalRecebida - totalSaidasPago;
    const saldoProjetado = receitaTotalPrevista - totalSaidasPrevisto;

    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    const despesasVencidas = saidas.filter((m) => {
      if (!m.dataVencimento) return false;
      const venc = new Date(m.dataVencimento);
      venc.setHours(0, 0, 0, 0);
      return m.status !== 'pago' && venc < hoje;
    }).length;

    res.json({
      ok: true,
      resumo: {
        valorPrevistoAlunos: financeiroAlunos.valorPrevistoAlunos,
        valorRecebidoAlunos: financeiroAlunos.valorRecebidoAlunos,
        valorPendenteAlunos: financeiroAlunos.valorPendenteAlunos,

        totalEntradasAvulsasPrevisto,
        totalEntradasAvulsasRecebido,
        totalEntradasAvulsasPendente,

        receitaTotalPrevista,
        receitaTotalRecebida,

        totalSaidasPrevisto,
        totalSaidasPago,
        totalSaidasPendente,

        saldoAtual,
        saldoProjetado,

        quantidadeEntradasAvulsas: entradasAvulsas.length,
        quantidadeSaidas: saidas.length,
        despesasVencidas,
      },
      entradasAvulsas,
      saidas,
    });
  } catch (err) {
    console.error('[BAILE_FINANCEIRO][DASHBOARD]', err);
    res.status(500).json({
      ok: false,
      message: 'Erro ao montar dashboard financeiro do baile.',
    });
  }
});

router.post(
  '/',
  autenticar,
  requireTenant,
  upload.fields([
    { name: 'comprovante', maxCount: 1 },
    { name: 'contrato', maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const instituicao = getInstituicaoId(req);
      const usuarioId = getUsuarioId(req);
      const usuarioNome = getUsuarioNome(req);

      const {
        anoLetivo = 2026,
        tipo,
        origem = 'outro',
        categoria = '',
        descricao,
        pessoaNome = '',
        pessoaTelefone = '',
        valorPrevisto = 0,
        valorPago = 0,
        dataVencimento,
        dataPagamento,
        formaPagamento = 'pix',
        status,
        observacoes = '',
      } = req.body;

      if (!['entrada', 'saida'].includes(tipo)) {
        return res.status(400).json({
          ok: false,
          message: 'Informe se o movimento é entrada ou saída.',
        });
      }

      if (!descricao || !String(descricao).trim()) {
        return res.status(400).json({
          ok: false,
          message: 'Informe a descrição do movimento financeiro.',
        });
      }

      const movimento = new BaileMovimentoFinanceiro({
        instituicao,
        anoLetivo: Number(anoLetivo),
        tipo,
        origem,
        categoria,
        descricao,
        pessoaNome,
        pessoaTelefone,
        valorPrevisto: numeroSeguro(valorPrevisto, 0),
        valorPago: numeroSeguro(valorPago, 0),
        dataVencimento: dataOuNull(dataVencimento),
        dataPagamento: dataOuNull(dataPagamento),
        formaPagamento,
        observacoes,
        criadoPor: usuarioId,
        criadoPorNome: usuarioNome,
        atualizadoPor: usuarioId,
        atualizadoPorNome: usuarioNome,
      });

      if (status === 'cancelado') movimento.status = 'cancelado';

      const comprovante = req.files?.comprovante?.[0];
      if (comprovante) {
        const up = await uploadArquivoBaile({
          file: comprovante,
          instituicaoId: instituicao,
          alunoId: 'financeiro',
          tipo: `financeiro-${tipo}-comprovante`,
        });

        movimento.comprovanteUrl = up.url;
        movimento.comprovanteKey = up.key;
      }

      const contrato = req.files?.contrato?.[0];
      if (contrato) {
        const up = await uploadArquivoBaile({
          file: contrato,
          instituicaoId: instituicao,
          alunoId: 'financeiro',
          tipo: `financeiro-${tipo}-contrato`,
        });

        movimento.contratoUrl = up.url;
        movimento.contratoKey = up.key;
      }

      await movimento.save();

      res.status(201).json({
        ok: true,
        message: 'Movimento financeiro cadastrado com sucesso.',
        movimento: resumoMovimento(movimento),
      });
    } catch (err) {
      console.error('[BAILE_FINANCEIRO][CRIAR]', err);
      res.status(500).json({
        ok: false,
        message: 'Erro ao cadastrar movimento financeiro.',
      });
    }
  }
);

router.put(
  '/:id',
  autenticar,
  requireTenant,
  upload.fields([
    { name: 'comprovante', maxCount: 1 },
    { name: 'contrato', maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const instituicao = getInstituicaoId(req);
      const usuarioId = getUsuarioId(req);
      const usuarioNome = getUsuarioNome(req);

      const movimento = await BaileMovimentoFinanceiro.findOne({
        _id: req.params.id,
        instituicao,
      });

      if (!movimento) {
        return res.status(404).json({
          ok: false,
          message: 'Movimento financeiro não encontrado.',
        });
      }

      const campos = [
        'tipo',
        'origem',
        'categoria',
        'descricao',
        'pessoaNome',
        'pessoaTelefone',
        'formaPagamento',
        'observacoes',
      ];

      campos.forEach((campo) => {
        if (req.body[campo] !== undefined) {
          movimento[campo] = req.body[campo];
        }
      });

      if (req.body.anoLetivo !== undefined) {
        movimento.anoLetivo = Number(req.body.anoLetivo || 2026);
      }

      if (req.body.valorPrevisto !== undefined) {
        movimento.valorPrevisto = numeroSeguro(req.body.valorPrevisto, 0);
      }

      if (req.body.valorPago !== undefined) {
        movimento.valorPago = numeroSeguro(req.body.valorPago, 0);
      }

      if (req.body.dataVencimento !== undefined) {
        movimento.dataVencimento = dataOuNull(req.body.dataVencimento);
      }

      if (req.body.dataPagamento !== undefined) {
        movimento.dataPagamento = dataOuNull(req.body.dataPagamento);
      }

      if (req.body.status === 'cancelado') {
        movimento.status = 'cancelado';
      } else if (req.body.status && req.body.status !== 'cancelado') {
        movimento.status = req.body.status;
      }

      const comprovante = req.files?.comprovante?.[0];
      if (comprovante) {
        if (movimento.comprovanteKey) {
          await deletarArquivoBaile(movimento.comprovanteKey).catch(() => {});
        }

        const up = await uploadArquivoBaile({
          file: comprovante,
          instituicaoId: instituicao,
          alunoId: 'financeiro',
          tipo: `financeiro-${movimento.tipo}-comprovante`,
        });

        movimento.comprovanteUrl = up.url;
        movimento.comprovanteKey = up.key;
      }

      const contrato = req.files?.contrato?.[0];
      if (contrato) {
        if (movimento.contratoKey) {
          await deletarArquivoBaile(movimento.contratoKey).catch(() => {});
        }

        const up = await uploadArquivoBaile({
          file: contrato,
          instituicaoId: instituicao,
          alunoId: 'financeiro',
          tipo: `financeiro-${movimento.tipo}-contrato`,
        });

        movimento.contratoUrl = up.url;
        movimento.contratoKey = up.key;
      }

      movimento.atualizadoPor = usuarioId;
      movimento.atualizadoPorNome = usuarioNome;

      await movimento.save();

      res.json({
        ok: true,
        message: 'Movimento financeiro atualizado com sucesso.',
        movimento: resumoMovimento(movimento),
      });
    } catch (err) {
      console.error('[BAILE_FINANCEIRO][ATUALIZAR]', err);
      res.status(500).json({
        ok: false,
        message: 'Erro ao atualizar movimento financeiro.',
      });
    }
  }
);

router.delete('/:id', autenticar, requireTenant, async (req, res) => {
  try {
    const instituicao = getInstituicaoId(req);

    const movimento = await BaileMovimentoFinanceiro.findOne({
      _id: req.params.id,
      instituicao,
    });

    if (!movimento) {
      return res.status(404).json({
        ok: false,
        message: 'Movimento financeiro não encontrado.',
      });
    }

    movimento.status = 'cancelado';
    await movimento.save();

    res.json({
      ok: true,
      message: 'Movimento financeiro cancelado com sucesso.',
    });
  } catch (err) {
    console.error('[BAILE_FINANCEIRO][EXCLUIR]', err);
    res.status(500).json({
      ok: false,
      message: 'Erro ao cancelar movimento financeiro.',
    });
  }
});

router.get('/csv/movimentos', autenticar, requireTenant, async (req, res) => {
  try {
    const instituicao = getInstituicaoId(req);
    const anoLetivo = Number(req.query.anoLetivo || 2026);

    const movimentos = await BaileMovimentoFinanceiro.find({
      instituicao,
      anoLetivo,
    }).sort({ tipo: 1, dataPagamento: -1, createdAt: -1 }).lean();

    const csv = gerarCsv(movimentos, [
      { label: 'Tipo', valor: (m) => m.tipo },
      { label: 'Origem', valor: (m) => m.origem },
      { label: 'Categoria', valor: (m) => m.categoria },
      { label: 'Descricao', valor: (m) => m.descricao },
      { label: 'Pessoa/Fornecedor', valor: (m) => m.pessoaNome },
      { label: 'Telefone', valor: (m) => m.pessoaTelefone },
      { label: 'Valor previsto', valor: (m) => numeroSeguro(m.valorPrevisto, 0).toFixed(2) },
      { label: 'Valor pago', valor: (m) => numeroSeguro(m.valorPago, 0).toFixed(2) },
      { label: 'Valor pendente', valor: (m) => numeroSeguro(m.valorPendente, 0).toFixed(2) },
      { label: 'Vencimento', valor: (m) => m.dataVencimento ? new Date(m.dataVencimento).toLocaleDateString('pt-BR') : '' },
      { label: 'Pagamento', valor: (m) => m.dataPagamento ? new Date(m.dataPagamento).toLocaleDateString('pt-BR') : '' },
      { label: 'Forma', valor: (m) => m.formaPagamento },
      { label: 'Status', valor: (m) => m.status },
      { label: 'Comprovante', valor: (m) => m.comprovanteUrl },
      { label: 'Contrato', valor: (m) => m.contratoUrl },
      { label: 'Observacoes', valor: (m) => m.observacoes },
    ]);

    enviarCsv(res, `baile-movimentos-financeiros-${anoLetivo}.csv`, csv);
  } catch (err) {
    console.error('[BAILE_FINANCEIRO][CSV_MOVIMENTOS]', err);
    res.status(500).json({
      ok: false,
      message: 'Erro ao exportar movimentos financeiros.',
    });
  }
});

router.get('/csv/pagamentos-alunos', autenticar, requireTenant, async (req, res) => {
  try {
    const instituicao = getInstituicaoId(req);
    const anoLetivo = Number(req.query.anoLetivo || 2026);

    const { pagamentos } = await obterFinanceiroAlunos(instituicao, anoLetivo);

    const csv = gerarCsv(pagamentos, [
      { label: 'Aluno', valor: (p) => p.alunoNome },
      { label: 'Turma', valor: (p) => p.turma },
      { label: 'Data pagamento', valor: (p) => p.dataPagamento ? new Date(p.dataPagamento).toLocaleDateString('pt-BR') : '' },
      { label: 'Valor', valor: (p) => numeroSeguro(p.valor, 0).toFixed(2) },
      { label: 'Forma', valor: (p) => p.formaPagamento },
      { label: 'Referencia', valor: (p) => p.referenciaParcela },
      { label: 'Observacao', valor: (p) => p.observacao },
      { label: 'Comprovante', valor: (p) => p.comprovanteUrl },
      { label: 'Registrado por', valor: (p) => p.registradoPorNome },
    ]);

    enviarCsv(res, `baile-pagamentos-alunos-${anoLetivo}.csv`, csv);
  } catch (err) {
    console.error('[BAILE_FINANCEIRO][CSV_PAGAMENTOS_ALUNOS]', err);
    res.status(500).json({
      ok: false,
      message: 'Erro ao exportar pagamentos dos alunos.',
    });
  }
});

router.get('/csv/prestacao-contas', autenticar, requireTenant, async (req, res) => {
  try {
    const instituicao = getInstituicaoId(req);
    const anoLetivo = Number(req.query.anoLetivo || 2026);

    const financeiroAlunos = await obterFinanceiroAlunos(instituicao, anoLetivo);

    const movimentos = await BaileMovimentoFinanceiro.find({
      instituicao,
      anoLetivo,
      status: { $ne: 'cancelado' },
    }).lean();

    const linhas = [];

    linhas.push({
      grupo: 'ENTRADA',
      categoria: 'Pagamentos dos alunos',
      descricao: 'Recebimentos registrados nos contratos dos alunos',
      previsto: financeiroAlunos.valorPrevistoAlunos,
      pago: financeiroAlunos.valorRecebidoAlunos,
      pendente: financeiroAlunos.valorPendenteAlunos,
      status: '',
    });

    movimentos.forEach((m) => {
      linhas.push({
        grupo: m.tipo === 'entrada' ? 'ENTRADA' : 'SAIDA',
        categoria: m.categoria,
        descricao: m.descricao,
        previsto: numeroSeguro(m.valorPrevisto, 0),
        pago: numeroSeguro(m.valorPago, 0),
        pendente: numeroSeguro(m.valorPendente, 0),
        status: m.status,
      });
    });

    const totalEntradas = linhas
      .filter((l) => l.grupo === 'ENTRADA')
      .reduce((acc, l) => acc + numeroSeguro(l.pago, 0), 0);

    const totalSaidas = linhas
      .filter((l) => l.grupo === 'SAIDA')
      .reduce((acc, l) => acc + numeroSeguro(l.pago, 0), 0);

    linhas.push({
      grupo: 'RESUMO',
      categoria: 'Saldo atual',
      descricao: 'Entradas recebidas menos saídas pagas',
      previsto: '',
      pago: totalEntradas - totalSaidas,
      pendente: '',
      status: '',
    });

    const csv = gerarCsv(linhas, [
      { label: 'Grupo', valor: (l) => l.grupo },
      { label: 'Categoria', valor: (l) => l.categoria },
      { label: 'Descricao', valor: (l) => l.descricao },
      { label: 'Previsto', valor: (l) => l.previsto === '' ? '' : numeroSeguro(l.previsto, 0).toFixed(2) },
      { label: 'Pago/Recebido', valor: (l) => l.pago === '' ? '' : numeroSeguro(l.pago, 0).toFixed(2) },
      { label: 'Pendente', valor: (l) => l.pendente === '' ? '' : numeroSeguro(l.pendente, 0).toFixed(2) },
      { label: 'Status', valor: (l) => l.status },
    ]);

    enviarCsv(res, `baile-prestacao-contas-${anoLetivo}.csv`, csv);
  } catch (err) {
    console.error('[BAILE_FINANCEIRO][CSV_PRESTACAO]', err);
    res.status(500).json({
      ok: false,
      message: 'Erro ao exportar prestação de contas.',
    });
  }
});

module.exports = router;