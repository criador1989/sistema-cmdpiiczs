'use strict';

const BRAZIL_COUNTRY_CODE = '55';

// Códigos Nacionais (DDDs) atualmente atribuídos no Brasil.
// Lista fechada para evitar aceitar números com DDD inexistente.
const BRAZIL_DDDS = new Set([
  '11','12','13','14','15','16','17','18','19',
  '21','22','24','27','28',
  '31','32','33','34','35','37','38',
  '41','42','43','44','45','46','47','48','49',
  '51','53','54','55',
  '61','62','63','64','65','66','67','68','69',
  '71','73','74','75','77','79',
  '81','82','83','84','85','86','87','88','89',
  '91','92','93','94','95','96','97','98','99',
]);

function texto(value) {
  return value === null || value === undefined ? '' : String(value).trim();
}

function somenteDigitos(value) {
  return texto(value).replace(/\D+/g, '');
}

function removerPrefixoInternacional(digits) {
  let value = String(digits || '');
  while (value.startsWith('00')) value = value.slice(2);
  return value;
}

function removerPrefixoOperadoraBrasil(digits) {
  const value = String(digits || '');

  // 0 + código da operadora (2 dígitos) + DDD + número (10 ou 11 dígitos nacionais)
  if (/^0\d{2}\d{10,11}$/.test(value)) return value.slice(3);

  // 0 + DDD + número (10 ou 11 dígitos nacionais)
  if (/^0\d{10,11}$/.test(value)) return value.slice(1);

  return value;
}

function validarNacionalBrasil(nacional) {
  if (!/^\d{10,11}$/.test(nacional)) {
    return { valido: false, motivo: 'O telefone deve conter DDD e 8 ou 9 dígitos.' };
  }

  const ddd = nacional.slice(0, 2);
  const assinante = nacional.slice(2);

  if (!BRAZIL_DDDS.has(ddd)) {
    return { valido: false, motivo: 'DDD inexistente ou não atribuído no Brasil.' };
  }

  if (/^(\d)\1+$/.test(nacional)) {
    return { valido: false, motivo: 'Número repetitivo inválido.' };
  }

  if (nacional.length === 11 && !/^9\d{8}$/.test(assinante)) {
    return { valido: false, motivo: 'Celular com 11 dígitos deve começar com 9 após o DDD.' };
  }

  if (nacional.length === 10 && !/^[2-5]\d{7}$/.test(assinante)) {
    return {
      valido: false,
      motivo: 'Número com 8 dígitos deve ser telefone fixo (início de 2 a 5). Não foi acrescentado nono dígito automaticamente.',
    };
  }

  return { valido: true, motivo: null, ddd, assinante };
}

/**
 * Normaliza telefones brasileiros sem inventar DDD ou nono dígito.
 *
 * Aceita, entre outros:
 *   (68) 99999-9999
 *   68 99999 9999
 *   68999999999
 *   +55 (68) 99999-9999
 *   55 68 99999-9999
 *   0055 68 99999-9999
 *   0XX 68 99999-9999
 */
function normalizarTelefoneBrasil(value) {
  const original = texto(value);
  let digits = somenteDigitos(original);

  const base = {
    original,
    digitsInformados: digits,
    valido: false,
    e164: null,
    digitsE164: null,
    whatsappAddress: null,
    pais: 'BR',
    codigoPais: BRAZIL_COUNTRY_CODE,
    ddd: null,
    numeroNacional: null,
    motivo: null,
  };

  if (!digits) {
    return { ...base, motivo: 'Telefone não informado.' };
  }

  digits = removerPrefixoInternacional(digits);
  digits = removerPrefixoOperadoraBrasil(digits);

  let nacional = digits;

  // Só interpreta 55 como DDI quando o comprimento já é internacional.
  // Assim, um número nacional do DDD 55 não é confundido com país.
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith(BRAZIL_COUNTRY_CODE)) {
    nacional = digits.slice(2);
  } else if (digits.length !== 10 && digits.length !== 11) {
    if (digits.length === 8 || digits.length === 9) {
      return { ...base, motivo: 'Número sem DDD. Corrija o cadastro antes do envio.' };
    }
    return { ...base, motivo: 'Quantidade de dígitos inválida para telefone brasileiro.' };
  }

  const validacao = validarNacionalBrasil(nacional);
  if (!validacao.valido) {
    return { ...base, numeroNacional: nacional, motivo: validacao.motivo };
  }

  const digitsE164 = `${BRAZIL_COUNTRY_CODE}${nacional}`;
  const e164 = `+${digitsE164}`;

  return {
    ...base,
    valido: true,
    e164,
    digitsE164,
    whatsappAddress: `whatsapp:${e164}`,
    ddd: validacao.ddd,
    numeroNacional: nacional,
    motivo: null,
  };
}

function normalizarListaTelefones(values = []) {
  const entrada = Array.isArray(values) ? values : [values];
  const validos = [];
  const invalidos = [];
  const vistos = new Set();

  for (const value of entrada.flat(Infinity)) {
    const info = normalizarTelefoneBrasil(value);
    if (!info.original) continue;

    if (!info.valido) {
      invalidos.push(info);
      continue;
    }

    if (vistos.has(info.e164)) continue;
    vistos.add(info.e164);
    validos.push(info);
  }

  return { validos, invalidos };
}

function formatarTelefoneBrasil(value) {
  const info = normalizarTelefoneBrasil(value);
  if (!info.valido) return texto(value);

  const nacional = info.numeroNacional;
  const ddd = nacional.slice(0, 2);
  const assinante = nacional.slice(2);

  if (assinante.length === 9) {
    return `+55 (${ddd}) ${assinante.slice(0, 5)}-${assinante.slice(5)}`;
  }

  return `+55 (${ddd}) ${assinante.slice(0, 4)}-${assinante.slice(4)}`;
}

module.exports = {
  BRAZIL_COUNTRY_CODE,
  BRAZIL_DDDS,
  somenteDigitos,
  normalizarTelefoneBrasil,
  normalizarListaTelefones,
  formatarTelefoneBrasil,
};
