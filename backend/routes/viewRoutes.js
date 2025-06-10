const express = require('express');
const router = express.Router();

// Página de login
router.get('/login', (req, res) => {
  res.send(`
    <html>
      <head>
        <title>Login</title>
        <style>
          body { font-family: Arial; background: #f5f5f5; padding: 20px; max-width: 400px; margin: auto; }
          h1 { text-align: center; }
          form {
            background: #fff;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          }
          input, button {
            display: block;
            width: 100%;
            margin-bottom: 10px;
            padding: 10px;
            border-radius: 5px;
            border: 1px solid #ccc;
          }
          button {
            background-color: #2196F3;
            color: white;
            font-weight: bold;
            cursor: pointer;
          }
          button:hover {
            background-color: #1976D2;
          }
        </style>
      </head>
      <body>
        <h1>Login</h1>
        <form method="POST" action="/login">
          <input type="text" name="usuario" placeholder="Usuário" required />
          <input type="password" name="senha" placeholder="Senha" required />
          <button type="submit">Entrar</button>
        </form>
      </body>
    </html>
  `);
});

module.exports = router;
