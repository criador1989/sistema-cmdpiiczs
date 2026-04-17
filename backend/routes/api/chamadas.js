const express = require('express');
const router = express.Router();
const { sendMail } = require('../../utils/mailer');

const Chamada = require('../../models/Chamada');
const ChamadaConfiguracao = require('../../models/ChamadaConfiguracao');
const Aluno = require('../../models/Aluno');
const { autenticar } = require('../../middleware/autenticacao');

function normalizarTurma(valor) {
  return String(valor || '')
    .trim()
    .replace(/\s+/g, ' ');
}

function getInstituicao(req) {
  return (
    req.usuario?.instituicao ||
    req.usuario?.tenantId ||
    req.tenantId ||
    req.instituicaoId ||
    null
  );
}

function professorPodeAcessarTurma(req, turma) {
  const tipo = String(req.usuario?.tipo || '').toLowerCase();
  if (tipo !== 'professor') return true;

  const turmas = Array.isArray(req.usuario?.turmas) ? req.usuario.turmas : [];
  if (!turmas.length) return true;

  const turmaNormalizada = normalizarTurma(turma).toLowerCase();
  return turmas
    .map(t => normalizarTurma(t).toLowerCase())
    .includes(turmaNormalizada);
}

function hojeISO() {
  const hoje = new Date();
  const yyyy = hoje.getFullYear();
  const mm = String(hoje.getMonth() + 1).padStart(2, '0');
  const dd = String(hoje.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function parseBool(v) {
  if (typeof v === 'boolean') return v;
  const s = String(v || '').trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'sim' || s === 'yes';
}

function csvEscape(v) {
  const s = String(v ?? '');
  if (/[;"\n,]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function formatarLinhaAluno(aluno) {
  return {
    aluno: aluno?.aluno || null,
    nome: String(aluno?.nome || '').trim(),
    presente: !!aluno?.presente,
    faltaJustificada: !!aluno?.faltaJustificada,
    observacao: String(aluno?.observacao || '').trim(),
    origem: aluno?.origem || 'professor',
    marcadoEm: new Date()
  };
}

async function obterOuCriarConfig(instituicao) {
  let config = await ChamadaConfiguracao.findOne({ instituicao });
  if (!config) {
    config = await ChamadaConfiguracao.create({
      instituicao,
      emailDestino: '',
      whatsappDestino: ''
    });
  }
  return config;
}

function montarResumo(chamada) {
  const alunos = Array.isArray(chamada?.alunos) ? chamada.alunos : [];
  const total = alunos.length;
  const presentes = alunos.filter(a => !!a.presente).length;
  const faltas = total - presentes;
  const justificadas = alunos.filter(a => !a.presente && !!a.faltaJustificada).length;

  return { total, presentes, faltas, justificadas };
}

function montarHtmlEmail(chamada) {
  const resumo = montarResumo(chamada);
  const linhas = (chamada.alunos || []).map((a) => `
    <tr>
      <td style="padding:8px;border:1px solid #ddd;">${a.nome || ''}</td>
      <td style="padding:8px;border:1px solid #ddd;">${a.presente ? 'Presente' : 'Falta'}</td>
      <td style="padding:8px;border:1px solid #ddd;">${a.faltaJustificada ? 'Sim' : 'Não'}</td>
      <td style="padding:8px;border:1px solid #ddd;">${String(a.observacao || '').replace(/</g, '&lt;')}</td>
    </tr>
  `).join('');

  return `
    <div style="font-family:Arial,sans-serif;color:#111">
      <h2>Chamada escolar</h2>
      <p><strong>Turma:</strong> ${chamada.turma}</p>
      <p><strong>Data:</strong> ${chamada.data}</p>
      <p><strong>Status:</strong> ${chamada.status}</p>

      <ul>
        <li><strong>Total:</strong> ${resumo.total}</li>
        <li><strong>Presentes:</strong> ${resumo.presentes}</li>
        <li><strong>Faltas:</strong> ${resumo.faltas}</li>
        <li><strong>Justificadas:</strong> ${resumo.justificadas}</li>
      </ul>

      <table style="border-collapse:collapse;width:100%;margin-top:16px">
        <thead>
          <tr>
            <th style="padding:8px;border:1px solid #ddd;text-align:left">Aluno</th>
            <th style="padding:8px;border:1px solid #ddd;text-align:left">Status</th>
            <th style="padding:8px;border:1px solid #ddd;text-align:left">Justificada</th>
            <th style="padding:8px;border:1px solid #ddd;text-align:left">Observação</th>
          </tr>
        </thead>
        <tbody>${linhas}</tbody>
      </table>
    </div>
  `;
}


/* =========================
   CONFIGURAÇÃO DE ENVIO
   ========================= */

router.get('/configuracao', autenticar, async (req, res) => {
  try {
    const instituicao = getInstituicao(req);
    if (!instituicao) {
      return res.status(401).json({ erro: 'Instituição não identificada.' });
    }

    const config = await obterOuCriarConfig(instituicao);
    return res.json({
      emailDestino: config.emailDestino || '',
      whatsappDestino: config.whatsappDestino || ''
    });
  } catch (erro) {
    console.error('Erro ao buscar configuração de chamada:', erro);
    return res.status(500).json({ erro: 'Erro ao buscar configuração.' });
  }
});

router.put('/configuracao', autenticar, async (req, res) => {
  try {
    const instituicao = getInstituicao(req);
    if (!instituicao) {
      return res.status(401).json({ erro: 'Instituição não identificada.' });
    }

    const emailDestino = String(req.body?.emailDestino || '').trim();
    const whatsappDestino = String(req.body?.whatsappDestino || '').trim();

    const config = await obterOuCriarConfig(instituicao);
    config.emailDestino = emailDestino;
    config.whatsappDestino = whatsappDestino;
    await config.save();

    return res.json({
      ok: true,
      configuracao: {
        emailDestino: config.emailDestino || '',
        whatsappDestino: config.whatsappDestino || ''
      }
    });
  } catch (erro) {
    console.error('Erro ao salvar configuração de chamada:', erro);
    return res.status(500).json({ erro: 'Erro ao salvar configuração.' });
  }
});

/* =========================
   CHAMADA DO DIA
   ========================= */

router.get('/turma/:turma', autenticar, async (req, res) => {
  try {
    const turma = normalizarTurma(req.params.turma);
    const instituicao = getInstituicao(req);

    if (!instituicao) {
      return res.status(401).json({ erro: 'Instituição não identificada.' });
    }

    if (!turma) {
      return res.status(400).json({ erro: 'Turma inválida.' });
    }

    if (!professorPodeAcessarTurma(req, turma)) {
      return res.status(403).json({ erro: 'Professor sem permissão para esta turma.' });
    }

    const data = hojeISO();

    let chamada = await Chamada.findOne({
      instituicao,
      turma,
      data
    }).lean();

    if (!chamada) {
      const alunos = await Aluno.find({ instituicao, turma })
        .select('_id nome')
        .sort({ nome: 1 })
        .lean();

      const config = await obterOuCriarConfig(instituicao);

      chamada = await Chamada.create({
        instituicao,
        turma,
        data,
        alunos: alunos.map((a) => ({
          aluno: a._id,
          nome: a.nome,
          presente: true,
          faltaJustificada: false,
          observacao: '',
          origem: 'automatico',
          marcadoEm: null
        })),
        envio: {
          emailDestino: config.emailDestino || '',
          whatsappDestino: config.whatsappDestino || ''
        },
        status: 'aberta'
      });

      chamada = chamada.toObject();
    }

    return res.json(chamada);
  } catch (erro) {
    console.error('Erro ao abrir/criar chamada:', erro);
    return res.status(500).json({ erro: 'Erro ao abrir a chamada.' });
  }
});

/* =========================
   HISTÓRICO / FILTROS
   ========================= */

router.get('/historico', autenticar, async (req, res) => {
  try {
    const instituicao = getInstituicao(req);
    if (!instituicao) {
      return res.status(401).json({ erro: 'Instituição não identificada.' });
    }

    const turma = normalizarTurma(req.query?.turma || '');
    const dataInicio = String(req.query?.dataInicio || '').trim();
    const dataFim = String(req.query?.dataFim || '').trim();
    const status = String(req.query?.status || '').trim();
    const somenteComFaltas = parseBool(req.query?.somenteComFaltas);

    const filtro = { instituicao };

    if (turma) {
      if (!professorPodeAcessarTurma(req, turma)) {
        return res.status(403).json({ erro: 'Professor sem permissão para esta turma.' });
      }
      filtro.turma = turma;
    }

    if (dataInicio || dataFim) {
      filtro.data = {};
      if (dataInicio) filtro.data.$gte = dataInicio;
      if (dataFim) filtro.data.$lte = dataFim;
    }

    if (status === 'aberta' || status === 'fechada') {
      filtro.status = status;
    }

    let chamadas = await Chamada.find(filtro)
      .sort({ data: -1, turma: 1, createdAt: -1 })
      .lean();

    if (!turma && String(req.usuario?.tipo || '').toLowerCase() === 'professor') {
      const permitidas = Array.isArray(req.usuario?.turmas) ? req.usuario.turmas : [];
      if (permitidas.length) {
        const setPermitidas = new Set(permitidas.map(t => normalizarTurma(t).toLowerCase()));
        chamadas = chamadas.filter(c => setPermitidas.has(normalizarTurma(c.turma).toLowerCase()));
      }
    }

    const enriquecidas = chamadas
      .map((c) => ({
        ...c,
        resumo: montarResumo(c)
      }))
      .filter((c) => {
        if (!somenteComFaltas) return true;
        return c.resumo.faltas > 0;
      });

    return res.json({ chamadas: enriquecidas });
  } catch (erro) {
    console.error('Erro ao buscar histórico de chamadas:', erro);
    return res.status(500).json({ erro: 'Erro ao buscar histórico.' });
  }
});

router.get('/:id', autenticar, async (req, res) => {
  try {
    const instituicao = getInstituicao(req);
    if (!instituicao) {
      return res.status(401).json({ erro: 'Instituição não identificada.' });
    }

    const chamada = await Chamada.findOne({
      _id: req.params.id,
      instituicao
    }).lean();

    if (!chamada) {
      return res.status(404).json({ erro: 'Chamada não encontrada.' });
    }

    if (!professorPodeAcessarTurma(req, chamada.turma)) {
      return res.status(403).json({ erro: 'Professor sem permissão para esta turma.' });
    }

    return res.json({
      ...chamada,
      resumo: montarResumo(chamada)
    });
  } catch (erro) {
    console.error('Erro ao buscar chamada por id:', erro);
    return res.status(500).json({ erro: 'Erro ao buscar chamada.' });
  }
});

/* =========================
   SALVAR / EDITAR
   ========================= */

router.put('/:id', autenticar, async (req, res) => {
  try {
    const instituicao = getInstituicao(req);
    const { alunos, emailDestino, whatsappDestino, status } = req.body || {};

    if (!instituicao) {
      return res.status(401).json({ erro: 'Instituição não identificada.' });
    }

    if (!Array.isArray(alunos)) {
      return res.status(400).json({ erro: 'Lista de alunos inválida.' });
    }

    const chamada = await Chamada.findOne({
      _id: req.params.id,
      instituicao
    });

    if (!chamada) {
      return res.status(404).json({ erro: 'Chamada não encontrada.' });
    }

    if (!professorPodeAcessarTurma(req, chamada.turma)) {
      return res.status(403).json({ erro: 'Professor sem permissão para esta turma.' });
    }

    chamada.alunos = alunos.map((a) => formatarLinhaAluno({
      aluno: a.aluno,
      nome: a.nome,
      presente: !!a.presente,
      faltaJustificada: !!a.faltaJustificada,
      observacao: a.observacao || '',
      origem: chamada.status === 'fechada' ? 'historico' : 'professor'
    }));

    if (typeof emailDestino !== 'undefined') {
      chamada.envio.emailDestino = String(emailDestino || '').trim();
    }

    if (typeof whatsappDestino !== 'undefined') {
      chamada.envio.whatsappDestino = String(whatsappDestino || '').trim();
    }

    if (status === 'aberta' || status === 'fechada') {
      chamada.status = status;
    }

    await chamada.save();

    return res.json({
      ok: true,
      chamada,
      resumo: montarResumo(chamada)
    });
  } catch (erro) {
    console.error('Erro ao salvar/editar chamada:', erro);
    return res.status(500).json({ erro: 'Erro ao salvar a chamada.' });
  }
});

router.post('/:id/fechar', autenticar, async (req, res) => {
  try {
    const instituicao = getInstituicao(req);

    if (!instituicao) {
      return res.status(401).json({ erro: 'Instituição não identificada.' });
    }

    const chamada = await Chamada.findOne({
      _id: req.params.id,
      instituicao
    });

    if (!chamada) {
      return res.status(404).json({ erro: 'Chamada não encontrada.' });
    }

    if (!professorPodeAcessarTurma(req, chamada.turma)) {
      return res.status(403).json({ erro: 'Professor sem permissão para esta turma.' });
    }

    chamada.status = 'fechada';
    await chamada.save();

    return res.json({ ok: true });
  } catch (erro) {
    console.error('Erro ao fechar chamada:', erro);
    return res.status(500).json({ erro: 'Erro ao fechar a chamada.' });
  }
});

/* =========================
   EXCLUIR CHAMADA
   ========================= */

router.delete('/:id', autenticar, async (req, res) => {
  try {
    const instituicao = getInstituicao(req);

    if (!instituicao) {
      return res.status(401).json({ erro: 'Instituição não identificada.' });
    }

    const chamada = await Chamada.findOne({
      _id: req.params.id,
      instituicao
    }).lean();

    if (!chamada) {
      return res.status(404).json({ erro: 'Chamada não encontrada.' });
    }

    if (!professorPodeAcessarTurma(req, chamada.turma)) {
      return res.status(403).json({ erro: 'Professor sem permissão para esta turma.' });
    }

    await Chamada.deleteOne({
      _id: req.params.id,
      instituicao
    });

    return res.json({ ok: true });
  } catch (erro) {
    console.error('Erro ao excluir chamada:', erro);
    return res.status(500).json({ erro: 'Erro ao excluir a chamada.' });
  }
});

/* =========================
   ENVIO POR E-MAIL
   ========================= */

router.post('/:id/enviar', autenticar, async (req, res) => {
  try {
    const instituicao = getInstituicao(req);

    if (!instituicao) {
      return res.status(401).json({ erro: 'Instituição não identificada.' });
    }

    const chamada = await Chamada.findOne({
      _id: req.params.id,
      instituicao
    });

    if (!chamada) {
      return res.status(404).json({ erro: 'Chamada não encontrada.' });
    }

    if (!professorPodeAcessarTurma(req, chamada.turma)) {
      return res.status(403).json({ erro: 'Professor sem permissão para esta turma.' });
    }

    const destino = String(
      req.body?.emailDestino ||
      chamada.envio?.emailDestino ||
      ''
    ).trim();

    if (!destino) {
      return res.status(400).json({ erro: 'Nenhum e-mail de destino configurado.' });
    }

    await sendMail({
      to: destino,
      subject: `Chamada - ${chamada.turma} - ${chamada.data}`,
      html: montarHtmlEmail(chamada)
    });

    chamada.envio.emailDestino = destino;
    chamada.envio.enviadaPorEmailEm = new Date();
    chamada.envio.ultimoErroEmail = '';
    await chamada.save();

    return res.json({ ok: true });
  } catch (erro) {
    console.error('Erro ao enviar chamada por e-mail:', erro);

    try {
      const instituicao = getInstituicao(req);
      if (instituicao && req.params.id) {
        const chamada = await Chamada.findOne({ _id: req.params.id, instituicao });
        if (chamada) {
          chamada.envio.ultimoErroEmail = String(erro?.message || erro);
          await chamada.save();
        }
      }
    } catch {}

    return res.status(500).json({ erro: `Erro ao enviar e-mail: ${erro?.message || 'falha desconhecida'}` });
  }
});

/* =========================
   EXPORTAÇÃO CSV
   ========================= */

router.get('/exportar/csv', autenticar, async (req, res) => {
  try {
    const instituicao = getInstituicao(req);
    if (!instituicao) {
      return res.status(401).json({ erro: 'Instituição não identificada.' });
    }

    const turma = normalizarTurma(req.query?.turma || '');
    const dataInicio = String(req.query?.dataInicio || '').trim();
    const dataFim = String(req.query?.dataFim || '').trim();

    const filtro = { instituicao };

    if (turma) {
      if (!professorPodeAcessarTurma(req, turma)) {
        return res.status(403).json({ erro: 'Professor sem permissão para esta turma.' });
      }
      filtro.turma = turma;
    }

    if (dataInicio || dataFim) {
      filtro.data = {};
      if (dataInicio) filtro.data.$gte = dataInicio;
      if (dataFim) filtro.data.$lte = dataFim;
    }

    let chamadas = await Chamada.find(filtro)
      .sort({ data: -1, turma: 1 })
      .lean();

    if (!turma && String(req.usuario?.tipo || '').toLowerCase() === 'professor') {
      const permitidas = Array.isArray(req.usuario?.turmas) ? req.usuario.turmas : [];
      if (permitidas.length) {
        const setPermitidas = new Set(permitidas.map(t => normalizarTurma(t).toLowerCase()));
        chamadas = chamadas.filter(c => setPermitidas.has(normalizarTurma(c.turma).toLowerCase()));
      }
    }

    const linhas = [
      [
        'data',
        'turma',
        'status',
        'aluno',
        'presente',
        'faltaJustificada',
        'observacao'
      ].join(';')
    ];

    chamadas.forEach((chamada) => {
      (chamada.alunos || []).forEach((aluno) => {
        linhas.push([
          csvEscape(chamada.data),
          csvEscape(chamada.turma),
          csvEscape(chamada.status),
          csvEscape(aluno.nome || ''),
          csvEscape(aluno.presente ? 'Sim' : 'Não'),
          csvEscape(aluno.faltaJustificada ? 'Sim' : 'Não'),
          csvEscape(aluno.observacao || '')
        ].join(';'));
      });
    });

    const nome = `chamadas-${turma || 'todas'}-${hojeISO()}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${nome}"`);
    return res.send('\uFEFF' + linhas.join('\n'));
  } catch (erro) {
    console.error('Erro ao exportar chamadas CSV:', erro);
    return res.status(500).json({ erro: 'Erro ao exportar CSV.' });
  }
});

module.exports = router;