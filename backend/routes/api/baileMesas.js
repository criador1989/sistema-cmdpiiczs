'use strict';

const express = require('express');

const BaileMesa = require('../../models/BaileMesa');
const BaileContrato = require('../../models/BaileContrato');

const { autenticar } = require('../../middleware/autenticacao');
const { requireTenant } = require('../../middleware/tenantScope');

const router = express.Router();

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

function embaralhar(lista) {
  const arr = [...lista];

  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }

  return arr;
}

function resumoMesa(mesa) {
  return mesa.resumo ? mesa.resumo() : mesa.toObject();
}

async function buscarMesas(instituicao, anoLetivo) {
  const mesas = await BaileMesa.find({
    instituicao,
    anoLetivo,
    ativa: { $ne: false },
  }).sort({ ordem: 1, numeroMesa: 1 });

  return mesas;
}

async function buscarParticipantes(instituicao, anoLetivo) {
  return BaileContrato.find({
    instituicao,
    anoLetivo,
    statusParticipacao: { $ne: 'nao_participa' },
    status: { $nin: ['desistente', 'cancelado'] },
  }).sort({ turma: 1, alunoNome: 1 });
}

router.get('/', autenticar, requireTenant, async (req, res) => {
  try {
    const instituicao = getInstituicaoId(req);
    const anoLetivo = Number(req.query.anoLetivo || 2026);

    const mesas = await buscarMesas(instituicao, anoLetivo);
    const participantes = await buscarParticipantes(instituicao, anoLetivo);

    const contratosAlocados = new Set();

    mesas.forEach((mesa) => {
      (mesa.ocupantes || []).forEach((ocupante) => {
        if (ocupante.contrato) contratosAlocados.add(String(ocupante.contrato));
      });
    });

    const naoAlocados = participantes.filter(
      (c) => !contratosAlocados.has(String(c._id))
    );

    const capacidadeTotal = mesas.reduce((acc, mesa) => acc + Number(mesa.capacidade || 0), 0);

    const lugaresOcupados = mesas.reduce((acc, mesa) => {
      return acc + (mesa.ocupantes || []).reduce((soma, ocupante) => {
        return soma + Number(ocupante.quantidadeLugares || 0);
      }, 0);
    }, 0);

    res.json({
      ok: true,
      resumo: {
        mesas: mesas.length,
        capacidadeTotal,
        lugaresOcupados,
        lugaresDisponiveis: Math.max(capacidadeTotal - lugaresOcupados, 0),
        participantes: participantes.length,
        naoAlocados: naoAlocados.length,
      },
      mesas: mesas.map(resumoMesa),
      naoAlocados: naoAlocados.map((c) => ({
        _id: c._id,
        aluno: c.aluno,
        alunoNome: c.alunoNome,
        turma: c.turma,
        quantidadeIngressos: Number(c.quantidadeIngressos || 0),
        ingressosIniciais: Number(c.ingressosIniciais || c.quantidadeIngressos || 0),
        ingressosAdicionais: Number(c.ingressosAdicionais || 0),
      })),
    });
  } catch (err) {
    console.error('[BAILE_MESAS][LISTAR]', err);
    res.status(500).json({
      ok: false,
      message: 'Erro ao listar mesas do baile.',
    });
  }
});

router.post('/', autenticar, requireTenant, async (req, res) => {
  try {
    const instituicao = getInstituicaoId(req);
    const usuarioId = getUsuarioId(req);
    const usuarioNome = getUsuarioNome(req);

    const {
      anoLetivo = 2026,
      numeroMesa,
      capacidade = 6,
      ordem = 0,
      setor = '',
      observacoes = '',
    } = req.body;

    if (!numeroMesa) {
      return res.status(400).json({
        ok: false,
        message: 'Informe o número ou identificação da mesa.',
      });
    }

    if (![6, 8, 10].includes(Number(capacidade))) {
      return res.status(400).json({
        ok: false,
        message: 'A capacidade da mesa deve ser 6, 8 ou 10 lugares.',
      });
    }

    const mesa = await BaileMesa.create({
      instituicao,
      anoLetivo: Number(anoLetivo),
      numeroMesa: String(numeroMesa).trim(),
      capacidade: Number(capacidade),
      ordem: Number(ordem || 0),
      setor,
      observacoes,
      criadaPor: usuarioId,
      criadaPorNome: usuarioNome,
      atualizadaPor: usuarioId,
      atualizadaPorNome: usuarioNome,
    });

    res.status(201).json({
      ok: true,
      message: 'Mesa criada com sucesso.',
      mesa: resumoMesa(mesa),
    });
  } catch (err) {
    console.error('[BAILE_MESAS][CRIAR]', err);

    if (err.code === 11000) {
      return res.status(409).json({
        ok: false,
        message: 'Já existe uma mesa com essa identificação neste ano letivo.',
      });
    }

    res.status(500).json({
      ok: false,
      message: 'Erro ao criar mesa.',
    });
  }
});

router.post('/lote', autenticar, requireTenant, async (req, res) => {
  try {
    const instituicao = getInstituicaoId(req);
    const usuarioId = getUsuarioId(req);
    const usuarioNome = getUsuarioNome(req);

    const {
      anoLetivo = 2026,
      quantidadeMesas6 = 0,
      quantidadeMesas8 = 0,
      quantidadeMesas10 = 0,
      prefixo = 'Mesa',
      setor = '',
    } = req.body;

    const ano = Number(anoLetivo);

    const existentes = await BaileMesa.countDocuments({
      instituicao,
      anoLetivo: ano,
      ativa: { $ne: false },
    });

    let ordem = existentes + 1;
    const novas = [];

    function adicionar(qtd, capacidade) {
      const total = Math.max(0, Number(qtd || 0));

      for (let i = 0; i < total; i += 1) {
        novas.push({
          instituicao,
          anoLetivo: ano,
          numeroMesa: `${prefixo} ${ordem}`,
          capacidade,
          ordem,
          setor,
          criadaPor: usuarioId,
          criadaPorNome: usuarioNome,
          atualizadaPor: usuarioId,
          atualizadaPorNome: usuarioNome,
        });

        ordem += 1;
      }
    }

    adicionar(quantidadeMesas6, 6);
    adicionar(quantidadeMesas8, 8);
    adicionar(quantidadeMesas10, 10);

    if (!novas.length) {
      return res.status(400).json({
        ok: false,
        message: 'Informe ao menos uma mesa para criar.',
      });
    }

    const criadas = await BaileMesa.insertMany(novas, { ordered: true });

    res.status(201).json({
      ok: true,
      message: 'Mesas criadas com sucesso.',
      total: criadas.length,
      mesas: criadas.map(resumoMesa),
    });
  } catch (err) {
    console.error('[BAILE_MESAS][LOTE]', err);
    res.status(500).json({
      ok: false,
      message: 'Erro ao criar mesas em lote.',
    });
  }
});

router.put('/:id', autenticar, requireTenant, async (req, res) => {
  try {
    const instituicao = getInstituicaoId(req);
    const usuarioId = getUsuarioId(req);
    const usuarioNome = getUsuarioNome(req);

    const mesa = await BaileMesa.findOne({
      _id: req.params.id,
      instituicao,
    });

    if (!mesa) {
      return res.status(404).json({
        ok: false,
        message: 'Mesa não encontrada.',
      });
    }

    const {
      numeroMesa,
      capacidade,
      ordem,
      setor,
      observacoes,
    } = req.body;

    if (numeroMesa !== undefined) mesa.numeroMesa = String(numeroMesa).trim();

    if (capacidade !== undefined) {
      if (![6, 8, 10].includes(Number(capacidade))) {
        return res.status(400).json({
          ok: false,
          message: 'A capacidade da mesa deve ser 6, 8 ou 10 lugares.',
        });
      }

      const ocupados = (mesa.ocupantes || []).reduce((acc, ocupante) => {
        return acc + Number(ocupante.quantidadeLugares || 0);
      }, 0);

      if (Number(capacidade) < ocupados) {
        return res.status(400).json({
          ok: false,
          message: `Esta mesa já possui ${ocupados} lugar(es) ocupados. A capacidade não pode ser menor que isso.`,
        });
      }

      mesa.capacidade = Number(capacidade);
    }

    if (ordem !== undefined) mesa.ordem = Number(ordem || 0);
    if (setor !== undefined) mesa.setor = setor;
    if (observacoes !== undefined) mesa.observacoes = observacoes;

    mesa.atualizadaPor = usuarioId;
    mesa.atualizadaPorNome = usuarioNome;

    await mesa.save();

    res.json({
      ok: true,
      message: 'Mesa atualizada com sucesso.',
      mesa: resumoMesa(mesa),
    });
  } catch (err) {
    console.error('[BAILE_MESAS][ATUALIZAR]', err);
    res.status(500).json({
      ok: false,
      message: 'Erro ao atualizar mesa.',
    });
  }
});

router.delete('/limpar/todas', autenticar, requireTenant, async (req, res) => {
  try {
    const instituicao = getInstituicaoId(req);
    const anoLetivo = Number(req.query.anoLetivo || 2026);

    const resultado = await BaileMesa.updateMany(
      {
        instituicao,
        anoLetivo,
        ativa: { $ne: false },
      },
      {
        $set: {
          ativa: false,
          ocupantes: [],
          atualizadaPor: getUsuarioId(req),
          atualizadaPorNome: getUsuarioNome(req),
        },
      }
    );

    await BaileContrato.updateMany(
      {
        instituicao,
        anoLetivo,
      },
      {
        $set: {
          mesaNumero: '',
          cadeiraNumero: '',
          atualizadoPor: getUsuarioId(req),
          atualizadoPorNome: getUsuarioNome(req),
        },
      }
    );

    res.json({
      ok: true,
      message: 'Todas as mesas foram removidas com sucesso.',
      total: resultado.modifiedCount || 0,
    });
  } catch (err) {
    console.error('[BAILE_MESAS][LIMPAR_TODAS]', err);

    res.status(500).json({
      ok: false,
      message: 'Erro ao remover todas as mesas.',
    });
  }
});

router.delete('/:id', autenticar, requireTenant, async (req, res) => {
  try {
    const instituicao = getInstituicaoId(req);

    const mesa = await BaileMesa.findOne({
      _id: req.params.id,
      instituicao,
    });

    if (!mesa) {
      return res.status(404).json({
        ok: false,
        message: 'Mesa não encontrada.',
      });
    }

    mesa.ativa = false;
    mesa.ocupantes = [];

    await mesa.save();

    res.json({
      ok: true,
      message: 'Mesa removida com sucesso.',
    });
  } catch (err) {
    console.error('[BAILE_MESAS][REMOVER]', err);
    res.status(500).json({
      ok: false,
      message: 'Erro ao remover mesa.',
    });
  }
});

router.post('/:id/ocupantes', autenticar, requireTenant, async (req, res) => {
  try {
    const instituicao = getInstituicaoId(req);
    const usuarioId = getUsuarioId(req);
    const usuarioNome = getUsuarioNome(req);

    const {
      contratoId,
      tipoOcupante = 'aluno',
      origem = '',
      alunoNome = '',
      turma = '',
      quantidadeLugares,
      observacao = '',
    } = req.body;

    const mesa = await BaileMesa.findOne({
      _id: req.params.id,
      instituicao,
      ativa: { $ne: false },
    });

    if (!mesa) {
      return res.status(404).json({
        ok: false,
        message: 'Mesa não encontrada.',
      });
    }

    const tiposPermitidos = [
      'aluno',
      'convidado_extra',
      'funcionario',
      'autoridade',
      'comissao',
      'outro',
    ];

    const tipoFinal = tiposPermitidos.includes(tipoOcupante)
      ? tipoOcupante
      : 'outro';

    let contrato = null;

    if (contratoId) {
      contrato = await BaileContrato.findOne({
        _id: contratoId,
        instituicao,
      });

      if (!contrato) {
        return res.status(404).json({
          ok: false,
          message: 'Participante não encontrado.',
        });
      }

      const jaExisteNaMesa = mesa.ocupantes.some(
        (o) => String(o.contrato || '') === String(contrato._id)
      );

      if (jaExisteNaMesa) {
        return res.status(400).json({
          ok: false,
          message: 'Este participante já está nesta mesa.',
        });
      }

      const mesasDoAno = await BaileMesa.find({
        instituicao,
        anoLetivo: mesa.anoLetivo,
        ativa: { $ne: false },
      });

      const jaAlocado = mesasDoAno.some((m) =>
        (m.ocupantes || []).some(
          (o) => String(o.contrato || '') === String(contrato._id)
        )
      );

      if (jaAlocado) {
        return res.status(400).json({
          ok: false,
          message: 'Este participante já está alocado em outra mesa.',
        });
      }
    }

    if (!contrato && !String(alunoNome || '').trim()) {
      return res.status(400).json({
        ok: false,
        message: 'Informe o nome do convidado, servidor, autoridade ou ocupante extra.',
      });
    }

    const lugares = Math.max(
      1,
      Number(
        quantidadeLugares ||
          contrato?.quantidadeIngressos ||
          1
      )
    );

    const ocupados = (mesa.ocupantes || []).reduce((acc, ocupante) => {
      return acc + Number(ocupante.quantidadeLugares || 0);
    }, 0);

    if (ocupados + lugares > Number(mesa.capacidade || 0)) {
      return res.status(400).json({
        ok: false,
        message: 'Não há lugares suficientes nesta mesa.',
      });
    }

    mesa.ocupantes.push({
      tipoOcupante: contrato ? 'aluno' : tipoFinal,
      origem: contrato ? 'contrato_aluno' : origem,
      contrato: contrato ? contrato._id : null,
      aluno: contrato ? contrato.aluno : null,
      alunoNome: contrato ? contrato.alunoNome : String(alunoNome || '').trim(),
      turma: contrato ? contrato.turma : String(turma || '').trim(),
      quantidadeLugares: lugares,
      observacao,
    });

    mesa.atualizadaPor = usuarioId;
    mesa.atualizadaPorNome = usuarioNome;

    if (contrato) {
      contrato.mesaNumero = mesa.numeroMesa;
      contrato.cadeiraNumero = `${lugares} lugar(es)`;
      contrato.atualizadoPor = usuarioId;
      contrato.atualizadoPorNome = usuarioNome;

      await contrato.save();
    }

    await mesa.save();

    res.json({
      ok: true,
      message: contrato
        ? 'Participante alocado na mesa com sucesso.'
        : 'Ocupante extra alocado na mesa com sucesso.',
      mesa: resumoMesa(mesa),
    });
  } catch (err) {
    console.error('[BAILE_MESAS][ADICIONAR_OCUPANTE]', err);
    res.status(500).json({
      ok: false,
      message: 'Erro ao adicionar ocupante na mesa.',
    });
  }
});

router.delete('/:id/ocupantes/:ocupanteId', autenticar, requireTenant, async (req, res) => {
  try {
    const instituicao = getInstituicaoId(req);
    const usuarioId = getUsuarioId(req);
    const usuarioNome = getUsuarioNome(req);

    const mesa = await BaileMesa.findOne({
      _id: req.params.id,
      instituicao,
    });

    if (!mesa) {
      return res.status(404).json({
        ok: false,
        message: 'Mesa não encontrada.',
      });
    }

    const ocupante = mesa.ocupantes.id(req.params.ocupanteId);

    if (!ocupante) {
      return res.status(404).json({
        ok: false,
        message: 'Ocupante não encontrado nesta mesa.',
      });
    }

    const contratoId = ocupante.contrato;

    ocupante.deleteOne();

    if (contratoId) {
      await BaileContrato.findOneAndUpdate(
        {
          _id: contratoId,
          instituicao,
        },
        {
          $set: {
            mesaNumero: '',
            cadeiraNumero: '',
            atualizadoPor: usuarioId,
            atualizadoPorNome: usuarioNome,
          },
        }
      );
    }

    mesa.atualizadaPor = usuarioId;
    mesa.atualizadaPorNome = usuarioNome;

    await mesa.save();

    res.json({
      ok: true,
      message: 'Participante removido da mesa.',
      mesa: resumoMesa(mesa),
    });
  } catch (err) {
    console.error('[BAILE_MESAS][REMOVER_OCUPANTE]', err);
    res.status(500).json({
      ok: false,
      message: 'Erro ao remover participante da mesa.',
    });
  }
});

router.post('/sortear', autenticar, requireTenant, async (req, res) => {
  try {
    const instituicao = getInstituicaoId(req);
    const usuarioId = getUsuarioId(req);
    const usuarioNome = getUsuarioNome(req);

    const {
      anoLetivo = 2026,
      limparMesasAntes = true,
    } = req.body;

    const ano = Number(anoLetivo);

    const mesas = await buscarMesas(instituicao, ano);
    const participantes = await buscarParticipantes(instituicao, ano);

    if (!mesas.length) {
      return res.status(400).json({
        ok: false,
        message: 'Cadastre as mesas antes de fazer o sorteio.',
      });
    }

    if (!participantes.length) {
      return res.status(400).json({
        ok: false,
        message: 'Nenhum participante encontrado para sortear.',
      });
    }

    if (limparMesasAntes) {
      for (const mesa of mesas) {
        mesa.ocupantes = [];
        mesa.atualizadaPor = usuarioId;
        mesa.atualizadaPorNome = usuarioNome;
        await mesa.save();
      }

      await BaileContrato.updateMany(
        {
          instituicao,
          anoLetivo: ano,
        },
        {
          $set: {
            mesaNumero: '',
            cadeiraNumero: '',
            atualizadoPor: usuarioId,
            atualizadoPorNome: usuarioNome,
          },
        }
      );
    }

    const mesasOrdenadas = [...mesas].sort((a, b) => {
      if (Number(b.capacidade || 0) !== Number(a.capacidade || 0)) {
        return Number(b.capacidade || 0) - Number(a.capacidade || 0);
      }

      return Number(a.ordem || 0) - Number(b.ordem || 0);
    });

    let gruposDisponiveis = embaralhar(participantes).map((contrato) => ({
      contrato,
      lugares: Math.max(1, Number(contrato.quantidadeIngressos || 1)),
    }));

    function encontrarCombinacaoExata(lista, alvo) {
      const ordenados = [...lista].sort((a, b) => b.lugares - a.lugares);

      function backtrack(inicio, soma, escolhidos) {
        if (soma === alvo) return escolhidos;
        if (soma > alvo) return null;

        for (let i = inicio; i < ordenados.length; i += 1) {
          const item = ordenados[i];

          const resultado = backtrack(i + 1, soma + item.lugares, [
            ...escolhidos,
            item,
          ]);

          if (resultado) return resultado;
        }

        return null;
      }

      return backtrack(0, 0, []);
    }

    function encontrarMelhorCombinacao(lista, alvo) {
      const ordenados = [...lista].sort((a, b) => b.lugares - a.lugares);
      let melhor = [];
      let melhorSoma = 0;

      function backtrack(inicio, soma, escolhidos) {
        if (soma > alvo) return;

        if (soma > melhorSoma) {
          melhorSoma = soma;
          melhor = escolhidos;
        }

        if (soma === alvo) return;

        for (let i = inicio; i < ordenados.length; i += 1) {
          const item = ordenados[i];

          backtrack(i + 1, soma + item.lugares, [
            ...escolhidos,
            item,
          ]);
        }
      }

      backtrack(0, 0, []);

      return melhor;
    }

    function removerSelecionados(lista, selecionados) {
      const idsSelecionados = new Set(
        selecionados.map((item) => String(item.contrato._id))
      );

      return lista.filter(
        (item) => !idsSelecionados.has(String(item.contrato._id))
      );
    }

    for (const mesa of mesasOrdenadas) {
      const capacidade = Number(mesa.capacidade || 0);

      if (!capacidade || !gruposDisponiveis.length) continue;

      let selecionados = encontrarCombinacaoExata(gruposDisponiveis, capacidade);

      if (!selecionados || !selecionados.length) {
        selecionados = encontrarMelhorCombinacao(gruposDisponiveis, capacidade);
      }

      if (!selecionados || !selecionados.length) continue;

      for (const item of selecionados) {
        const contrato = item.contrato;
        const lugares = item.lugares;

        mesa.ocupantes.push({
          contrato: contrato._id,
          aluno: contrato.aluno,
          alunoNome: contrato.alunoNome,
          turma: contrato.turma,
          quantidadeLugares: lugares,
          observacao: 'Alocado automaticamente por sorteio com preenchimento otimizado.',
        });

        contrato.mesaNumero = mesa.numeroMesa;
        contrato.cadeiraNumero = `${lugares} lugar(es)`;
        contrato.atualizadoPor = usuarioId;
        contrato.atualizadoPorNome = usuarioNome;

        await contrato.save();
      }

      mesa.atualizadaPor = usuarioId;
      mesa.atualizadaPorNome = usuarioNome;
      await mesa.save();

      gruposDisponiveis = removerSelecionados(gruposDisponiveis, selecionados);
    }

    const naoAlocados = gruposDisponiveis.map((item) => ({
      contrato: item.contrato._id,
      alunoNome: item.contrato.alunoNome,
      turma: item.contrato.turma,
      quantidadeIngressos: item.lugares,
    }));

    const mesasAtualizadas = await buscarMesas(instituicao, ano);

    res.json({
      ok: true,
      message: naoAlocados.length
        ? 'Sorteio realizado com preenchimento otimizado. Alguns participantes ficaram sem mesa por falta de lugares compatíveis.'
        : 'Sorteio realizado com preenchimento otimizado.',
      naoAlocados,
      mesas: mesasAtualizadas.map(resumoMesa),
    });
  } catch (err) {
    console.error('[BAILE_MESAS][SORTEAR]', err);
    res.status(500).json({
      ok: false,
      message: 'Erro ao sortear mesas.',
    });
  }
});

router.post('/limpar', autenticar, requireTenant, async (req, res) => {
  try {
    const instituicao = getInstituicaoId(req);
    const usuarioId = getUsuarioId(req);
    const usuarioNome = getUsuarioNome(req);

    const anoLetivo = Number(req.body.anoLetivo || 2026);

    const mesas = await buscarMesas(instituicao, anoLetivo);

    for (const mesa of mesas) {
      mesa.ocupantes = [];
      mesa.atualizadaPor = usuarioId;
      mesa.atualizadaPorNome = usuarioNome;
      await mesa.save();
    }

    await BaileContrato.updateMany(
      {
        instituicao,
        anoLetivo,
      },
      {
        $set: {
          mesaNumero: '',
          cadeiraNumero: '',
          atualizadoPor: usuarioId,
          atualizadoPorNome: usuarioNome,
        },
      }
    );

    res.json({
      ok: true,
      message: 'Mapa de mesas limpo com sucesso.',
    });
  } catch (err) {
    console.error('[BAILE_MESAS][LIMPAR]', err);
    res.status(500).json({
      ok: false,
      message: 'Erro ao limpar mapa de mesas.',
    });
  }
});

module.exports = router;