# Obra Conectada Mobile

Aplicacao em `Expo + React Native + Supabase` usada hoje com foco em `web/PWA` para administrar uma unica casa/obra.
Este repositório e a base principal do projeto.

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
- `PWA/web exportada via GitHub Pages`

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
- `project_members` define vinculacao do usuario com a obra e o papel operacional
- `daily_logs` possui suporte a:
  - `photos_urls`
  - `videos_urls`
- `rooms` existe como tabela propria para reaproveitamento em outras areas
- bucket `daily-logs` e usado para midia do `Dia a Dia`
- funcoes de auth relevantes como `has_owner_registered`, `is_member_of_project`, `can_write_project` e `delete_user_account` devem estar versionadas em `supabase/migrations`

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

### Recuperacao de senha

Fluxo atual:

- `Esqueci a senha` envia email pelo Supabase Auth
- o retorno usa `redirectTo` web apontando para a propria PWA
- a tela `ResetPasswordScreen` abre no navegador ao detectar `type=recovery` e a sessao temporaria do link
- a redefinicao e concluida com `supabase.auth.updateUser({ password })`

Para teste local, a `Redirect URL` no Supabase deve incluir:

- `http://localhost:8081/obra-conectada-mobile/`

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
- recuperacao de senha web/PWA
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

### Relatório de Presença Automático

- A tela de `Presença` não possui mais lançamento manual por parte do proprietário.
- Os dados de frequência são derivados automaticamente do `Diário de Obra` (`Daily Logs`).
- Regras de negócio:
  - `Presente`: Funcionário foi selecionado na lista de presença do Diário daquele dia.
  - `Falta`: O Diário do dia foi preenchido, mas o funcionário não foi incluído.
  - `Pendente`: O Diário de Obra para a data selecionada ainda não foi preenchido.
- Objetivo: garantir que o Diário de Obra seja a única fonte de verdade operacional.

### Atualizações recentes

#### Polimento mobile operacional

- base visual compartilhada refinada em `AppScreen`, `SectionCard`, `AnimatedModal` e `theme`
- criação de `AppState` para loading, vazio e erro com linguagem visual unificada
- `Dashboard` ajustado para mobile com melhor densidade, cartões mais compactos e métricas por cômodo em grade `2x2`
- `Updates`, `Documents`, `Team` e `Presence` alinhados ao novo padrão de estados e ritmo visual
- `Daily` entrou em rodada de polimento focada em:
  - header mais seco
  - menos margem lateral acumulada
  - filtros e resumos mais legíveis no mobile
  - modal de registro com menos texto redundante
  - frentes de trabalho com visual mais leve

Diretriz prática atual:

- evitar gradientes e artifícios visuais que deixem a interface com aparência genérica
- priorizar clareza operacional, densidade controlada e leitura rápida em celular
- validar manualmente no mobile antes de consolidar novas rodadas grandes de UI

#### Recuperacao de senha web/PWA

- remocao da estrategia de deep link nativo
- adocao de `redirectTo` web para a propria PWA
- criacao da `ResetPasswordScreen` para redefinicao no navegador
- fluxo validado localmente em `http://localhost:8081/obra-conectada-mobile/`

#### Exclusao de conta endurecida

- listagem da equipe passou a respeitar `project_members` do projeto atual
- migration `20260422004933_harden_account_deletion_functions.sql` criada para versionar e endurecer as funcoes de exclusao
- autoexclusao agora bloqueia apagar o ultimo proprietario
- exclusao de terceiros exige mesmo projeto e nao permite remover outro proprietario por esse fluxo

#### Automacao da Presenca

- transformacao da `PresenceScreen` em um relatorio de leitura
- atualizacao do hook `useDailyLogs` para trazer IDs de presença via join (`daily_log_employees`)
- remocao da necessidade de persistencia manual na tabela `attendance` para o fluxo diario

#### Consolidacao de auth e ocupacao

- ocupacao removida da tela de login
- criacao de `useProfile` para centralizar nome, avatar e papel
- dashboard, drawer, perfil e configuracao da casa passaram a ler essa fonte central

#### Consolidacao do `Dia a Dia`

- upload de fotos e videos ligado ao Storage
- formalizacao das colunas `photos_urls` e `videos_urls`
- formalizacao do bucket `daily-logs`
- limpeza automatica de uploads temporarios ao cancelar o formulario

### Infra de deploy

- branch principal: `main`
- `master` removida
- publicacao web feita a partir do artefato gerado em `dist/`
- `GitHub Pages` deve usar o workflow de Actions deste repositório
- o foco atual de validacao e `web/PWA`
- este repositorio nao usa mais `EAS Update`

## Como validar rapidamente

### App

```bash
npm run quality
```

Comandos individuais:

```bash
npm run typecheck
npm run lint
npm run smoke
```

### Web local

```bash
npm start
```

ou

```bash
npm run start:tunnel
```

Abrir no navegador em:

- `http://localhost:8081/obra-conectada-mobile/`

### Teste da recuperacao de senha

Antes do teste, configurar no Supabase:

- `Authentication` > `URL Configuration`
- adicionar `http://localhost:8081/obra-conectada-mobile/` em `Redirect URLs`

Fluxo de validacao:

- abrir a PWA local
- usar `Esqueci a senha`
- abrir o email recebido
- confirmar retorno para a PWA na tela de redefinicao
- salvar a nova senha
- validar login com a senha nova

### Publicacao web no Pages

Gerar o build web:

```bash
npm run export:web
```

O export gera o site final em `dist/`, incluindo:

- `index.html`
- `manifest.json`
- `sw.js`
- assets estaticos copiados de `public/`

No deploy automatizado, o GitHub Pages publica diretamente `dist/` via workflow em `.github/workflows/deploy-pages.yml`.

### Banco

Aplicar migrations no projeto Supabase conectado:

```bash
npx supabase db push --db-url "postgresql://postgres:SENHA@db.PROJECT_REF.supabase.co:5432/postgres?sslmode=require" --include-all
```

## Observacoes operacionais

- este README deve ser atualizado sempre que mudarmos regra de permissao, fonte de verdade do banco ou pipeline de deploy
- se surgir uma migration nova, ela deve nascer neste repo
- se uma mudanca for aplicada direto no Supabase, ela precisa voltar para `supabase/migrations` antes de ser considerada concluida
