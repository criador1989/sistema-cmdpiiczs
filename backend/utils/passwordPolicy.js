"use strict";

// Regras de senha e gerador de senhas temporárias legíveis
// - mínimo 8 caracteres
// - pelo menos 1 maiúscula, 1 minúscula e 1 número
// - evita dígitos 0 e 1 e letras maiúsculas ambíguas 'I' e 'O' nos gerados temporários
// - prioriza legibilidade para responsáveis/alunos

const COMMON_PASSWORDS = [
  '123456', '12345678', 'senha123', 'admin123', 'qwerty'
];

function validatePasswordStrength(pw) {
  const senha = String(pw || '');
  if (senha.length < 8) {
    return { ok: false, message: 'A senha deve ter pelo menos 8 caracteres.' };
  }

  if (!/[A-Z]/.test(senha)) {
    return { ok: false, message: 'A senha deve conter ao menos uma letra maiúscula.' };
  }

  if (!/[a-z]/.test(senha)) {
    return { ok: false, message: 'A senha deve conter ao menos uma letra minúscula.' };
  }

  if (!/[0-9]/.test(senha)) {
    return { ok: false, message: 'A senha deve conter ao menos um número.' };
  }

  const low = senha.toLowerCase();
  for (const bad of COMMON_PASSWORDS) {
    if (low === bad.toLowerCase()) {
      return { ok: false, message: 'Senha muito comum. Escolha outra senha.' };
    }
  }

  return { ok: true };
}

// Gera senhas temporárias legíveis para entrega manual
function generateTemporaryPassword() {
  // Lista de palavras legíveis (sem caracteres especiais difíceis)
  const WORDS = [
    'Escola','Aluno','Portal','Campus','Projeto','Estudo','Agenda','Servico','Turma','Acesso',
    'Cursos','Materia','Mentor','Equipe','Grupos','Bancos','Sistemas','Registro','Horario','Conteudo',
    'Professor','Sala','Classe','Noticia','Diario','Atividade'
  ];

  const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // sem I, O
  const DIGITS = '23456789'; // sem 0 e 1

  function rand(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  // Escolhe uma palavra legível e remove caracteres indesejados
  let stem = rand(WORDS);
  stem = String(stem || '').replace(/[^A-Za-z]/g, '');
  if (!stem) stem = 'Usuario';

  const upper = UPPER.charAt(Math.floor(Math.random() * UPPER.length));
  const digit = DIGITS.charAt(Math.floor(Math.random() * DIGITS.length));

  // Monta: Stem (capitalizada) + Upper + Digit  -> ex: EscolaA7
  const candidate = `${stem}${upper}${digit}`;

  // Garantir tamanho mínimo; se menor que 8, pad com dígitos permitidos
  if (candidate.length >= 8) return candidate;

  let extra = '';
  while ((candidate + extra).length < 8) {
    extra += DIGITS.charAt(Math.floor(Math.random() * DIGITS.length));
  }

  return candidate + extra;
}

module.exports = {
  validatePasswordStrength,
  generateTemporaryPassword,
  COMMON_PASSWORDS
};
