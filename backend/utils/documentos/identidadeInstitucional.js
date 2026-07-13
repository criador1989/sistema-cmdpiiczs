const ConfiguracaoDocumentos = require('../../models/ConfiguracaoDocumentos');

async function obterIdentidadeInstitucional(req) {
  try {
    const instituicaoId =
      req?.tenant?._id ||
      req?.tenant ||
      req?.usuario?.instituicao ||
      req?.user?.instituicao ||
      null;

    if (!instituicaoId) {
      return identidadePadrao();
    }

    const config = await ConfiguracaoDocumentos.findOne({
      instituicao: instituicaoId,
      ativo: true,
    }).lean();

    if (!config) {
      return identidadePadrao();
    }

    return {
      nomeInstituicao: config.nomeInstituicao || '',
      orgaoSuperior: config.orgaoSuperior || '',
      subtitulo: config.subtitulo || '',
      endereco: config.endereco || '',
      telefone: config.telefone || '',
      email: config.email || '',
      cidadeUf: config.cidadeUf || '',
      rodapePadrao: config.rodapePadrao || '',

      brasaoEsquerdoUrl: config.brasaoEsquerdoUrl || '',
      brasaoDireitoUrl: config.brasaoDireitoUrl || '',
      logoCentralUrl: config.logoCentralUrl || '',

      mostrarBrasaoEsquerdo:
        config.mostrarBrasaoEsquerdo !== false,

      mostrarBrasaoDireito:
        config.mostrarBrasaoDireito !== false,

      mostrarLogoCentral:
        config.mostrarLogoCentral === true,

      mostrarRodape:
        config.mostrarRodape !== false,
    };
  } catch (error) {
    console.error(
      '[IDENTIDADE-INSTITUCIONAL][ERRO]',
      error
    );

    return identidadePadrao();
  }
}

function identidadePadrao() {
  return {
    nomeInstituicao: '',
    orgaoSuperior: '',
    subtitulo: '',
    endereco: '',
    telefone: '',
    email: '',
    cidadeUf: '',
    rodapePadrao: '',

    brasaoEsquerdoUrl: '',
    brasaoDireitoUrl: '',
    logoCentralUrl: '',

    mostrarBrasaoEsquerdo: false,
    mostrarBrasaoDireito: false,
    mostrarLogoCentral: false,
    mostrarRodape: false,
  };
}

module.exports = {
  obterIdentidadeInstitucional,
};