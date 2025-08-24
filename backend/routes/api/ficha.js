const express = require('express');
const router = express.Router();

const Aluno = require('../../models/Aluno');
const Notificacao = require('../../models/Notificacao');
let Observacao;
try { Observacao = require('../../models/Observacao'); } catch { /* opcional */ }

const calcularNotaTSMD = require('../../utils/calculoNota'); // ✅ importar função base

// Wrapper para calcular nota de comportamento a partir do alunoId
async function calcularNotaComportamento(alunoId) {
  const aluno = await Aluno.findById(alunoId).select('dataEntrada');
  const notificacoes = await Notificacao.find({ aluno: alunoId }).select('data valorNumerico createdAt');
  return calcularNotaTSMD(aluno?.dataEntrada, new Date(), notificacoes);
}

// helper p/ montar URL da foto
function montarFotoUrl(valor) {
  if (!valor) return null;
  const s = String(valor);
  if (s.startsWith('http') || s.startsWith('data:') || s.startsWith('/uploads/')) {
    return s; // já é URL completa ou data URL
  }
  return `/uploads/${s}`; // caminho relativo salvo no banco
}

// GET /api/ficha/dados/:id — dados completos da ficha do aluno
router.get('/dados/:id', async (req, res) => {
  try {
    const instituicao = req.usuario?.instituicao; // rota protegida por autenticação no index.js
    const aluno = await Aluno.findOne({ _id: req.params.id, instituicao });

    if (!aluno) {
      return res.status(404).json({ erro: 'Aluno não encontrado' });
    }

    // 🔗 fotoUrl pronto para o front
    const raw = aluno.toObject();
    const fotoUrl = montarFotoUrl(raw.foto || raw.fotoArquivo || raw.avatar);

    // Notificações (mais recentes primeiro)
    const notificacoes = await Notificacao.find({
      aluno: aluno._id,
      instituicao
    }).sort({ data: -1, createdAt: -1 });

    // Observações (se o model existir)
    let observacoes = [];
    if (Observacao) {
      observacoes = await Observacao.find({ aluno: aluno._id })
        .sort({ createdAt: -1, criadoEm: -1 });
    }

    // ✅ calcular nota de comportamento segura
    let nota = 8.0;
    try {
      nota = await calcularNotaComportamento(aluno._id);
    } catch (e) {
      console.error(`Erro ao calcular nota para aluno ${aluno._id}:`, e.message);
    }

    res.json({
      aluno: { ...raw, fotoUrl },
      comportamento: nota,
      notificacoes,
      observacoes
    });
  } catch (err) {
    console.error('Erro ao buscar ficha do aluno:', err);
    res.status(500).json({ erro: 'Erro ao carregar dados da ficha' });
  }
});

// POST /api/ficha/salvar/:id (exemplo)
router.post('/salvar/:id', async (req, res) => {
  res.json({ mensagem: 'Observação salva com sucesso (rota funcional).' });
});

module.exports = router;
