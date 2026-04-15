# Obra Conectada Mobile

Aplicativo mobile em `Expo + React Native + Supabase` para administrar uma unica casa/obra.  
Este repositório passou a ser a base principal do projeto. O app web/remix nao e mais a fonte de verdade.

## Visao geral

O app possui dois perfis principais:

- `Proprietario`: ve e edita as areas administrativas e de configuracao
- `Funcionario`: ve apenas o fluxo operacional

Principio de produto atual:

- existe apenas uma casa
- a casa precisa ser configurada para habilitar o resto do fluxo
- o proprietario administra a casa, equipe, financeiro e configuracoes
- o funcionario trabalha com `Inicio`, `Dia a Dia`, `Crono` e `Perfil`

## Stack

- `Expo`
- `React Native`
- `TypeScript`
- `@tanstack/react-query`
- `Supabase Auth + Database + Storage`
- `PWA/web exportada manualmente`
- `Expo Go` para preview local durante o desenvolvimento

## Estrutura principal

- `src/screens`: telas do app
- `src/navigation`: shell, drawer, navbar e fluxo autenticado
- `src/contexts/AuthContext.tsx`: sessao e operacoes de auth
- `src/hooks`: queries e regras de dados
- `supabase/migrations`: migrations oficiais do banco para este projeto

## Fonte de verdade do banco

As migrations agora devem viver neste repositório, dentro de:

- `supabase/migrations`

Mesmo que alguma migration tenha sido aplicada antes a partir de outra pasta, daqui para frente o historico oficial do schema deve ser mantido aqui.

### Estado atual relevante do banco

- `profiles` guarda `full_name`, `avatar_url`, `is_owner`, `is_employee`
- `daily_logs` possui suporte a:
  - `photos_urls`
  - `videos_urls`
- `rooms` existe como tabela propria para reaproveitamento em outras areas
- bucket `daily-logs` e usado para midia do `Dia a Dia`

## Auth e ocupacao

Regra atual consolidada:

- a ocupacao e escolhida no cadastro, nao no login
- `signIn` apenas autentica
- `signUp` recebe ocupacao e grava os flags necessarios
- o bloqueio de segundo proprietario acontece no fluxo de cadastro
- o app ainda mantem compatibilidade com `is_owner` e `is_employee`

Observacao de seguranca:

- a UI usa `profiles` como fonte de verdade operacional para ocupacao
- nao devemos espalhar decisao de permissao por `user_metadata` em telas novas

## Variaveis de ambiente

Este app Expo usa variaveis `EXPO_PUBLIC_*`, que sao embutidas no bundle do cliente.

Hoje, as variaveis publicas esperadas sao:

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`

Essas duas podem estar no frontend.

Nunca colocar neste app:

- `service_role key`
- senha do banco
- tokens administrativos do Supabase
- segredos privados de backend

Regra pratica:

- se a variavel precisa ficar secreta, ela nao deve existir no app mobile/PWA
- segredos devem ficar apenas em backend ou automacoes seguras

## Dia a Dia e midia

O fluxo de `Dia a Dia` hoje contempla:

- calendario por mes
- abertura do formulario pelo botao `+ Hoje` e pelos dias
- `upsert` por `project_id + date`
- lista filtrada por mes abaixo do calendario
- upload de fotos e videos via Supabase Storage
- remocao visual de midia antes de salvar
- limpeza de uploads temporarios se o modal for fechado sem salvar

Contrato atual da midia:

- bucket: `daily-logs`
- caminho do arquivo: `daily-logs/<project_id>/<arquivo>`
- persistencia no banco:
  - `photos_urls`
  - `videos_urls`

## Resumo do estado funcional

### Ja estruturado

- login
- cadastro
- perfil com edicao
- configuracao da casa
- `Dia a Dia`
- `Crono`
- `Pagamentos`
- `Atualizacoes`
- dashboard com visao diferente para proprietario e funcionario
- drawer lateral + navbar inferior

### Regras de visibilidade atuais

- `Funcionario`:
  - `Inicio`
  - `Dia a Dia`
  - `Crono`
  - `Perfil`

- `Proprietario`:
  - tudo acima
  - `Pagamentos`
  - `Atualizacoes`
  - `Documentos`
  - `Equipe`
  - `Presenca`
  - `Configuracoes`
  - `Configurar casa`

## Atualizacoes recentes

### Consolidacao de auth e ocupacao

- ocupacao removida da tela de login
- criacao de `useProfile` para centralizar nome, avatar e papel
- dashboard, drawer, perfil e configuracao da casa passaram a ler essa fonte central

### Consolidacao do `Dia a Dia`

- upload de fotos e videos ligado ao Storage
- formalizacao das colunas `photos_urls` e `videos_urls`
- formalizacao do bucket `daily-logs`
- limpeza automatica de uploads temporarios ao cancelar o formulario

### Infra de deploy

- branch principal: `main`
- `master` removida
- publicacao web feita manualmente a partir do build exportado
- preview mobile feito localmente com `Expo Go`
- este repositorio nao usa mais `EAS Update`

## Como validar rapidamente

### App

```bash
npx tsc --noEmit
```

### Expo local

```bash
npm start
```

ou

```bash
npm run start:tunnel
```

Para abrir no celular durante o desenvolvimento:

- usar `Expo Go`
- iniciar com `npm start` ou `npm run start:tunnel`
- escanear o QR code exibido pelo Expo

### Banco

Aplicar migrations no projeto Supabase conectado:

```bash
npx supabase db push --db-url "postgresql://postgres:SENHA@db.PROJECT_REF.supabase.co:5432/postgres?sslmode=require" --include-all
```

## Observacoes operacionais

- este README deve ser atualizado sempre que mudarmos regra de permissao, fonte de verdade do banco ou pipeline de deploy
- se surgir uma migration nova, ela deve nascer neste repo
- se uma mudanca for aplicada direto no Supabase, ela precisa voltar para `supabase/migrations` antes de ser considerada concluida
