# Bancada OS - Planner de Roteiros

Versao compartilhavel do projeto para estudo em sala.

## O que foi removido

- Credenciais reais do Supabase.
- `node_modules/`, que deve ser recriado com `npm install`.
- `dist/`, que deve ser recriado com `npm run build`.
- Logs locais do Vite.
- Arquivos legados nao usados pela versao React/Vite.

## Como rodar

1. Instale as dependencias:

```bash
npm install
```

2. Crie um arquivo `.env` a partir do exemplo:

```bash
cp .env.example .env
```

No Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

3. Preencha o `.env` com a URL e a chave publica do projeto Supabase que sera usado em aula.

4. Inicie o projeto:

```bash
npm run dev
```

## Observacao

Use apenas chave publica `anon` ou `publishable` no frontend. Nunca coloque `service_role`, senha de banco ou qualquer chave secreta neste projeto.
