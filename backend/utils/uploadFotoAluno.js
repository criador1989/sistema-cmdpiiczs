const cloudinary = require('./cloudinary');

/**
 * Faz upload da foto de aluno para Cloudinary.
 * @param {string} caminhoArquivo - Caminho do arquivo local (ex: req.file.path).
 * @param {string} alunoId - ID do aluno (para organizar no Cloudinary).
 */
async function uploadFotoAluno(caminhoArquivo, alunoId) {
  try {
    const res = await cloudinary.uploader.upload(caminhoArquivo, {
      folder: process.env.CLOUDINARY_FOLDER || 'cmdp/alunos',
      public_id: alunoId,
      overwrite: true,
      transformation: [{ width: 400, height: 400, crop: "fill" }] // foto redimensionada
    });

    return {
      url: res.secure_url,
      publicId: res.public_id
    };
  } catch (err) {
    console.error("❌ Erro no upload para Cloudinary:", err);
    throw err;
  }
}

module.exports = uploadFotoAluno;
