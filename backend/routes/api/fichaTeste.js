
<!DOCTYPE html>
<html lang="pt-br">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Ficha do Aluno (Teste)</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      background-color: #f8f8f8;
      padding: 20px;
    }
    .ficha {
      max-width: 600px;
      margin: auto;
      background-color: white;
      border-radius: 8px;
      padding: 20px;
      box-shadow: 0 0 10px rgba(0,0,0,0.1);
    }
    h1 {
      text-align: center;
      color: #8B0000;
    }
    .erro {
      color: red;
      text-align: center;
      margin-top: 20px;
    }
    ul {
      padding-left: 20px;
    }
  </style>
</head>
<body>
  <div class="ficha">
    <h1>Ficha do Aluno</h1>
    <div id="conteudo"></div>
  </div>

  <script>
    async function carregarFicha() {
      const url = new URL(window.location.href);
      const codigo = url.searchParams.get("codigo") || "TESTE01";

      try {
        const resposta = await fetch(`/api/teste/${codigo}`);
        if (!resposta.ok) throw new Error("Código inválido");

        const dados = await resposta.json();

        const container = document.getElementById("conteudo");
        container.innerHTML = `
          <p><strong>Nome:</strong> ${dados.aluno.nome}</p>
          <p><strong>Turma:</strong> ${dados.aluno.turma}</p>
          <p><strong>Comportamento:</strong> ${dados.aluno.comportamento.toFixed(2)}</p>
          <h3>Notificações:</h3>
          <ul>
            ${dados.notificacoes.map(n => `
              <li>
                <strong>${n.tipo}</strong> - ${n.tipoMedida} (${n.motivo}) - Perda: ${n.valorNumerico}
              </li>
            `).join('')}
          </ul>
        `;
      } catch (erro) {
        document.getElementById("conteudo").innerHTML = '<p class="erro">Código inválido ou aluno não encontrado.</p>';
      }
    }

    carregarFicha();
  </script>
</body>
</html>
