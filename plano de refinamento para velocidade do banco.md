## Plano de refinamento para velocidade do banco

Data: 2026-05-05

### Objetivo

Mapear as causas mais provaveis de lentidao de leitura no app, executar os refinamentos de menor risco primeiro e registrar o que ainda depende de validacao no ambiente em uso.

### Estado atual da execucao

Ja executado com baixo risco:

- `useDailyLogs` foi refatorado para consultas simples em paralelo, sem o `select` aninhado pesado do PostgREST na lista
- `usePendingMenuBadgeCount` foi trocado para RPC agregada
- `usePendingItems` deixou de depender do feed completo de `daily_logs`
- `DashboardScreen`, `PresenceScreen` e `DailyScreen` passaram a pedir menos relacoes do que antes
- a funcao SQL `public.get_project_pending_badge_count` foi aplicada no remoto de forma aditiva

Ainda pendente de consolidacao operacional:

- reconciliar a migration da RPC no historico remoto quando houver execucao formal de migrations com a senha do banco
- reavaliar `pg_stat_statements` depois de exercitar as telas com o codigo novo em uso real

### Achados medidos no remoto

Medicoes executadas via CLI no projeto linkado `hjxvjmcdrsiifukmtjig` em 2026-05-05.

Volume atual:

- `daily_logs`: 17
- `weekly_updates`: 2
- `schedule_stages`: 3
- `payments`: 0
- `project_documents`: 0

Confirmacoes estruturais:

- `daily_logs` ja tem indice implicito util por `UNIQUE(project_id, date)`
- `weekly_updates` nao tem composto por `project_id + date`
- `schedule_stages` nao tem composto por `project_id + planned_start`
- `payments` nao tem composto por `project_id + request_date`
- `project_documents` hoje so tem PK visivel na medicao atual

Leitura dos `EXPLAIN`:

- com o volume atual, o planner ainda prefere `Seq Scan` em `daily_logs`, `weekly_updates` e `schedule_stages`
- o custo absoluto atual e baixo, porque as tabelas ainda sao pequenas
- isso significa que o ganho imediato maior continua sendo reduzir payload no frontend, nao criar indice as cegas agora

Leitura do `pg_stat_statements`:

- a query mais cara em tempo total hoje e justamente a leitura ampla de `daily_logs` com relacoes aninhadas
- `weekly_updates` aparece atras, mas bem abaixo de `daily_logs`
- `schedule_stages` tem custo menor e nao e hoje o gargalo principal
- `payments` existe no trafego, mas ainda com custo baixo e sem volume de dados

Conclusao operacional desta rodada:

- a prioridade P0 foi confirmada
- a prioridade P1 continua valida, mas como preparacao para crescimento e nao como urgencia imediata de banco
- `schedule_stages` nao esta pressionando o banco hoje
- `daily_logs` continua sendo o principal alvo de refatoracao de leitura

### Segunda medicao apos a primeira onda de refatoracao

Medicoes complementares executadas via CLI no mesmo dia, ja com o codigo local refatorado.

Leitura atual do remoto:

- `pg_stat_statements` ainda mostra como topo a query historica pesada de `daily_logs` com `daily_log_employees`, `daily_log_rooms` e `daily_log_service_items`
- essa leitura historica ainda nao prova falha da refatoracao nova; ela mistura trafego antigo com o que ja rodou antes da mudanca local
- a query de `schedule_stages` continua leve, com media baixa e sem sinal de gargalo operacional
- a RPC `get_project_pending_badge_count` respondeu corretamente e com custo baixo para o volume atual

Leitura do `EXPLAIN` direto:

- `daily_logs` base por `project_id` ordenado por `date desc` continua barato com o volume atual
- o planner ainda usa `Seq Scan` em `daily_logs`, o que e esperado com 17 linhas
- o ganho estrutural mais importante desta fase nao foi "forcar indice", e sim parar de pedir o payload aninhado pesado onde ele nao era necessario

Conclusao operacional da segunda medicao:

- o corte de payload foi a decisao correta e continua segura
- ainda nao existe evidencia para mexer estruturalmente em `schedule_stages`
- a proxima medicao realmente util depende de exercitar as telas refatoradas contra o remoto e so depois reler `pg_stat_statements`

### Diagnostico atual

Os warnings do Supabase Advisor sao uteis como triagem, mas o gargalo mais provavel do app hoje nao parece ser um problema isolado de RLS.

O padrao mais forte no codigo atual e:

- consultas amplas por `project_id`
- joins aninhados trazendo muita estrutura de uma vez
- ordenacao sem indice composto claro para os caminhos quentes
- agregacoes feitas no frontend em vez de no banco

### Rotas quentes confirmadas no app

#### 1. Feed de diarios

Historicamente, em [src/hooks/useDailyLogs.ts](C:/Users/gabri/Projetos/obra-conectada-mobile/src/hooks/useDailyLogs.ts:97), o app buscava todos os `daily_logs` do projeto com:

- `daily_log_employees`
- `daily_log_rooms`
- `daily_log_service_items`
- filtro por `project_id`
- ordenacao por `date desc`
- sem paginacao

Esse era o candidato mais forte a gargalo de leitura e ja foi parcialmente mitigado na camada do app.

#### 2. Badge de pendencias

Historicamente, em [src/hooks/usePendingMenuBadgeCount.ts](C:/Users/gabri/Projetos/obra-conectada-mobile/src/hooks/usePendingMenuBadgeCount.ts:8), o app:

- busca todos os `daily_logs` do projeto com `daily_log_service_items`
- busca `schedule_stages` abertas por `project_id`
- soma tudo no frontend

O badge nao depende de carregar logs completos. Ele depende de uma contagem agregada:

- quantidade de frentes abertas
- quantidade de etapas com status `em_andamento`, `atrasado` ou `bloqueado`

Esse ponto ja foi implementado com RPC dedicada.

#### 3. Listas ordenadas por projeto

Outros fluxos relevantes:

- [src/hooks/useUpdates.ts](C:/Users/gabri/Projetos/obra-conectada-mobile/src/hooks/useUpdates.ts:37): `weekly_updates` por `project_id`, ordenado por `date desc`
- [src/hooks/useStages.ts](C:/Users/gabri/Projetos/obra-conectada-mobile/src/hooks/useStages.ts:84): `schedule_stages` por `project_id`, ordenado por `planned_start`
- [src/hooks/usePayments.ts](C:/Users/gabri/Projetos/obra-conectada-mobile/src/hooks/usePayments.ts:55): `payments` por `project_id`, ordenado por `request_date desc`, com paginacao
- [src/hooks/useDocuments.ts](C:/Users/gabri/Projetos/obra-conectada-mobile/src/hooks/useDocuments.ts:37): `project_documents` por `project_id`, ordenado por `created_at desc`

### Guardrails de seguranca operacional

Para este plano nao criar risco de indisponibilidade ou regressao estrutural, as mudancas devem obedecer estas restricoes:

- nao alterar colunas existentes de `schedule_stages`
- nao alterar tipo de coluna, enum, constraint ou trigger de `schedule_stages`
- nao fazer `drop index`, `drop column`, `alter type` ou `rewrite` de tabela nesta frente
- nao mexer em policy de `schedule_stages` nesta fase
- nao trocar chave primaria, FKs, ou semantica de escrita das etapas
- qualquer mudanca em banco deve ser aditiva e reversivel
- qualquer indice novo so entra depois de medicao e apenas se nao for redundante

Regra especifica para `schedule_stages`:

- nesta frente, o escopo seguro para etapas e leitura
- isso significa:
  - medir a query atual
  - eventualmente adicionar indice
  - nao mudar o contrato da tabela
  - nao mudar o fluxo de insert, update ou delete das etapas

Com essas restricoes, o plano nao inclui nenhuma alteracao que, por si so, deva "derrubar" o banco.

### Prioridades reais

#### P0. Reduzir leitura bruta no app

Maior ganho provavel.

Ajustes a planejar:

- transformar `useDailyLogs` para leitura paginada por cursor de `date`
- separar leitura de lista e leitura de detalhe, para evitar carregar payload completo sempre
- mover contagens e somas do badge para consulta agregada no banco
- evitar trazer relacoes aninhadas completas quando a tela so precisa de resumo

Resultado esperado:

- menos dados trafegados
- menos trabalho no React Query
- menos custo de serializacao e processamento no cliente

#### P1. Criar indices compostos nas rotas quentes

Maior ganho provavel no banco depois de reduzir payload.

Indices candidatos prioritarios:

- `daily_logs (project_id, date desc)`
- `weekly_updates (project_id, date desc)`
- `schedule_stages (project_id, planned_start)`
- `payments (project_id, request_date desc)`
- possivelmente `project_documents (project_id, created_at desc)` se a lista crescer

Observacao:

O foco aqui nao e indexar tudo que o Advisor listar como FK sem indice. O foco e indexar primeiro os filtros e ordenacoes que o app realmente usa hoje.

#### P2. Medir antes de mexer em RLS

O warning de `Auth RLS Initialization Plan` e plausivel, mas ainda e hipotese.

Antes de alterar policy, o ideal e medir:

- `EXPLAIN (ANALYZE, BUFFERS)` nas queries mais lentas
- `pg_stat_statements`, se estiver habilitado
- tempo real das consultas mais usadas no app

Objetivo:

- confirmar se o custo maior esta no scan/sort/join
- ou se existe peso real de policy/RLS por linha

#### P3. Refino de RLS e policies

So entra se as medicoes mostrarem impacto relevante.

A revisar depois:

- policies permissivas duplicadas, se realmente existirem no remoto
- padroes que levem a reavaliacao excessiva em `USING` e `WITH CHECK`
- simplificacao de policies nas tabelas mais lidas

### Fragilidades identificadas

#### 1. Dependencia forte de `profiles.project_id`

As helpers de autorizacao atuais foram simplificadas para `profiles.project_id`, `is_owner` e `is_employee`, em [supabase/migrations/20260425144012_move_project_context_to_profiles.sql](C:/Users/gabri/Projetos/obra-conectada-mobile/supabase/migrations/20260425144012_move_project_context_to_profiles.sql:54).

Isso ajuda a simplificar leitura e permissao, mas deixa o modelo mais rigido se houver necessidade futura de multiobra por usuario.

#### 2. Mistura de consulta operacional com payload completo

Hoje algumas telas usam consultas que servem ao mesmo tempo para:

- calendario
- resumo
- detalhe
- presenca
- frentes

Essa mistura tende a inflar leitura desnecessariamente.

#### 3. Warning de seguranca nao deve contaminar prioridade de performance

Itens como:

- `SECURITY DEFINER`
- bucket publico
- `policy always true`
- leaked password protection disabled

devem ser tratados como trilha separada. Eles podem ser validos como endurecimento, mas nao sao a alavanca principal de velocidade de leitura neste momento.

### Ordem recomendada de execucao

1. Mapear queries que podem virar resumo/agregacao em vez de lista completa.
2. Planejar paginacao real de `daily_logs`.
3. Planejar indices compostos das rotas quentes.
4. Medir consultas reais com `EXPLAIN ANALYZE`.
5. So depois decidir se vale mexer em RLS/policies.

### Checklist tecnico

#### A. Confirmar o que ja existe antes de propor indice novo

Antes de criar qualquer indice, validar no banco remoto:

- `pg_indexes` para cada tabela quente
- constraints `UNIQUE` que ja criam indice implicitamente
- se o planner ja consegue usar scan reverso em indice existente

Ponto importante:

- `daily_logs` ja possui `UNIQUE(project_id, date)` em [supabase/migrations/20260401204835_c53016bf-761d-41bf-bb18-c26decbf2eb9.sql](C:/Users/gabri/Projetos/obra-conectada-mobile/supabase/migrations/20260401204835_c53016bf-761d-41bf-bb18-c26decbf2eb9.sql:17)

Isso significa que ja existe um indice B-tree implicito cobrindo `project_id, date`. Como a ordenacao atual e `date desc`, esse indice pode ja ser suficiente. Nao faz sentido assumir um novo indice para `daily_logs` sem medir antes.

SQL de conferencia:

```sql
select
  schemaname,
  tablename,
  indexname,
  indexdef
from pg_indexes
where schemaname = 'public'
  and tablename in (
    'daily_logs',
    'weekly_updates',
    'schedule_stages',
    'payments',
    'project_documents'
  )
order by tablename, indexname;
```

#### B. Queries que deveriam sair de leitura ampla para resumo/agregacao

##### 1. `daily_logs` resumo paginado

Problema atual:

- [src/hooks/useDailyLogs.ts](C:/Users/gabri/Projetos/obra-conectada-mobile/src/hooks/useDailyLogs.ts:102) carrega payload amplo com relacoes aninhadas
- a mesma query abastece calendario, resumo e parte de detalhe

Planejamento tecnico:

- separar query de lista da query de detalhe
- a lista deve trazer somente os campos usados na listagem
- paginacao por cursor de `date`, com `id` como desempate se necessario

Formato desejado da query de lista:

```sql
select
  id,
  project_id,
  date,
  activities,
  weather,
  observations,
  no_work_reason,
  no_work_note,
  created_by,
  room_id
from public.daily_logs
where project_id = :project_id
  and (
    :cursor_date is null
    or date < :cursor_date
  )
order by date desc
limit :page_size;
```

Se houver risco de datas repetidas em outra tabela, ou cursor mais robusto no futuro:

- usar cursor composto `date + id`

##### 2. `daily_logs` detalhe isolado

O detalhe pode continuar trazendo:

- `daily_log_employees`
- `daily_log_rooms`
- `daily_log_service_items`

Mas so quando o usuario abrir um registro especifico.

##### 3. Badge de pendencias

Problema atual:

- [src/hooks/usePendingMenuBadgeCount.ts](C:/Users/gabri/Projetos/obra-conectada-mobile/src/hooks/usePendingMenuBadgeCount.ts:16) carrega `daily_logs` com itens aninhados e soma no frontend

Planejamento tecnico:

- trocar por uma consulta agregada unica
- preferencialmente via RPC ou view de seguranca adequada

Formato desejado da agregacao:

```sql
select
  (
    select count(*)
    from public.daily_log_service_items items
    join public.daily_logs logs on logs.id = items.log_id
    where logs.project_id = :project_id
      and items.status <> 'concluido'
  ) as open_fronts,
  (
    select count(*)
    from public.schedule_stages stages
    where stages.project_id = :project_id
      and stages.status in ('em_andamento', 'atrasado', 'bloqueado')
  ) as open_stages;
```

Resultado esperado:

- o front passa a receber um numero pequeno e direto
- elimina leitura de colecoes inteiras so para montar um badge

#### C. Indices candidatos, em ordem de prioridade

##### 1. `weekly_updates`

Uso atual:

- [src/hooks/useUpdates.ts](C:/Users/gabri/Projetos/obra-conectada-mobile/src/hooks/useUpdates.ts:46)
- filtro por `project_id`
- ordenacao por `date desc`

Indice candidato:

```sql
create index if not exists weekly_updates_project_id_date_idx
  on public.weekly_updates (project_id, date desc);
```

##### 2. `payments`

Uso atual:

- [src/hooks/usePayments.ts](C:/Users/gabri/Projetos/obra-conectada-mobile/src/hooks/usePayments.ts:74)
- filtro por `project_id`
- ordenacao por `request_date desc`
- paginacao com `range`

Indice candidato:

```sql
create index if not exists payments_project_id_request_date_idx
  on public.payments (project_id, request_date desc);
```

##### 3. `schedule_stages`

Uso atual:

- [src/hooks/useStages.ts](C:/Users/gabri/Projetos/obra-conectada-mobile/src/hooks/useStages.ts:103)
- filtro por `project_id`
- ordenacao por `planned_start asc`

Indice candidato:

```sql
create index if not exists schedule_stages_project_id_planned_start_idx
  on public.schedule_stages (project_id, planned_start);
```

Restricao de seguranca:

- esse e o unico tipo de alteracao aceitavel em `schedule_stages` nesta frente
- nenhuma alteracao de schema funcional deve acompanhar esse indice
- antes de criar, precisa validar no remoto se ja existe indice equivalente

##### 4. `project_documents`

Uso atual:

- [src/hooks/useDocuments.ts](C:/Users/gabri/Projetos/obra-conectada-mobile/src/hooks/useDocuments.ts:46)
- filtro por `project_id`
- ordenacao por `created_at desc`

Observacao:

- ja existe `project_documents_project_id_idx`
- se a tabela crescer, pode valer um composto para evitar sort adicional

Indice candidato, apenas se `EXPLAIN` mostrar ganho:

```sql
create index if not exists project_documents_project_id_created_at_idx
  on public.project_documents (project_id, created_at desc);
```

##### 5. `daily_logs`

Uso atual:

- [src/hooks/useDailyLogs.ts](C:/Users/gabri/Projetos/obra-conectada-mobile/src/hooks/useDailyLogs.ts:102)
- filtro por `project_id`
- ordenacao por `date desc`

Observacao critica:

- ja existe indice implicito pelo `UNIQUE(project_id, date)`
- so criar indice adicional se `EXPLAIN ANALYZE` provar que o planner nao esta aproveitando bem esse caminho

#### D. Medicao recomendada no banco

Baseado na documentacao oficial do Supabase:

- `Managing Indexes in Postgres`
- `Query Optimization`
- `pg_stat_statements`
- `Understanding Postgres EXPLAIN Output`

Checklist de medicao:

1. Rodar `EXPLAIN (ANALYZE, BUFFERS)` nas queries reais das telas lentas.
2. Verificar se ha `Seq Scan`, `Sort` pesado ou `Nested Loop` custoso.
3. Conferir se os filtros por `project_id` usam indice.
4. Conferir se a ordenacao esta sendo atendida por indice ou por sort em memoria.
5. Inspecionar `pg_stat_statements` para descobrir quais queries mais consomem tempo total.

SQL de apoio para `pg_stat_statements`:

```sql
select
  calls,
  mean_exec_time,
  max_exec_time,
  total_exec_time,
  rows,
  query
from pg_stat_statements
where query ilike '%daily_logs%'
   or query ilike '%weekly_updates%'
   or query ilike '%schedule_stages%'
   or query ilike '%payments%'
order by total_exec_time desc
limit 20;
```

#### E. RLS: quando entra na fila

RLS so deve subir de prioridade se, depois de reduzir payload e validar indices, ainda aparecer:

- `planning time` alto demais
- execucao pesada associada a filtros de policy
- degradacao clara em queries simples com pouco volume retornado

Sem essa evidencia, mexer em RLS antes tende a aumentar risco e dispersar esforco.

#### F. Regras para migrations seguras

Toda migration desta frente deve seguir estes criterios:

1. Ter escopo unico.
   Exemplo: uma migration so de indice, sem misturar policy, trigger, coluna ou RPC.

2. Ser aditiva.
   So `create index`, `create function` nova ou ajuste de leitura sem remover estrutura existente.

3. Ser precedida por medicao.
   Nenhum indice entra por intuicao.

4. Ter validacao antes e depois.
   Antes: `pg_indexes` e `EXPLAIN`.
   Depois: `EXPLAIN` repetido e comparacao de plano.

5. Nao alterar caminho de escrita de `schedule_stages`.
   O hook atual de etapas em [src/hooks/useStages.ts](C:/Users/gabri/Projetos/obra-conectada-mobile/src/hooks/useStages.ts:126) deve continuar funcional sem depender de migracao estrutural.

6. Evitar operacoes destrutivas ou invasivas.
   Fora de escopo desta frente:
   - `drop index`
   - `alter table ... alter column type`
   - `drop constraint`
   - recreacao de tabela
   - mudanca de enum usada por `schedule_stages`

7. Se houver necessidade de indice em tabela grande, preferir janela controlada de aplicacao.
   Mesmo sem mexer em dados, criacao de indice consome recurso. A execucao deve ser programada em horario de baixo uso quando houver volume relevante.

#### G. Revisao dos indices candidatos sob risco de lock

Objetivo:

- minimizar risco de bloqueio perceptivel
- evitar rollout que degrade escrita enquanto o indice e criado
- manter a frente estritamente em performance de leitura

Principio geral:

- indice novo e uma mudanca relativamente segura quando comparada a alteracoes estruturais de tabela
- ainda assim, ele pode consumir CPU, I/O e disputar recursos com leitura e escrita
- por isso, indice nao deve entrar em lote grande nem misturado com outras mudancas

Regras praticas:

1. Um indice por vez nas tabelas mais sensiveis.
   Evita somar custo desnecessario e facilita rollback operacional.

2. Priorizar horarios de baixo uso.
   Especialmente para `schedule_stages`, `daily_logs` e `payments`, que sao tabelas operacionais.

3. Nao empilhar varios indices "preventivos".
   So criar o que tiver justificativa no `EXPLAIN` e no uso real do app.

4. Validar tamanho da tabela antes do rollout.
   Em tabela pequena, o ganho pode ser baixo e o planner pode continuar preferindo `Seq Scan`.

5. Evitar reconstrucoes desnecessarias.
   Se ja existe indice equivalente ou indice implicito util, nao duplicar.

6. Isolar qualquer indice criado para `schedule_stages`.
   Se esse indice entrar, ele deve estar sozinho na migration de performance.

Observacao importante sobre rollout:

- se o volume da tabela justificar uma estrategia de criacao de indice com menor interferencia em escrita, isso deve ser avaliado explicitamente no momento da execucao
- esse tipo de rollout precisa ser tratado como operacao isolada, porque algumas estrategias de criacao de indice tem requisitos operacionais especificos

#### H. Risco por indice candidato

##### 1. `schedule_stages (project_id, planned_start)`

Risco tecnico:

- baixo do ponto de vista funcional, porque nao muda regra de negocio
- baixo a moderado do ponto de vista operacional, dependendo do volume da tabela

Risco de quebra:

- muito baixo, desde que a mudanca seja apenas aditiva

Risco de lock perceptivel:

- tende a ser baixo em base pequena
- pode subir se a tabela crescer e o rollout for feito em horario de uso

Decisao segura:

- medir primeiro
- se justificar, criar isoladamente
- nao misturar com alteracoes de policy, trigger ou escrita

##### 2. `weekly_updates (project_id, date desc)`

Risco tecnico:

- baixo

Risco de quebra:

- muito baixo

Risco operacional:

- normalmente baixo, mas ainda deve seguir rollout isolado se a tabela crescer

##### 3. `payments (project_id, request_date desc)`

Risco tecnico:

- baixo

Risco de quebra:

- muito baixo

Risco operacional:

- moderado se houver escrita frequente durante a criacao do indice
- merece janela controlada se a tabela tiver volume ou uso constante

##### 4. `project_documents (project_id, created_at desc)`

Risco tecnico:

- baixo

Risco de quebra:

- muito baixo

Risco operacional:

- geralmente baixo
- so deve entrar se o `EXPLAIN` realmente mostrar necessidade

##### 5. `daily_logs`

Risco tecnico:

- baixo se for apenas indice

Risco de quebra:

- muito baixo

Risco operacional:

- nao justifica entrar cedo porque ja existe indice implicito por `UNIQUE(project_id, date)`
- criar indice adicional aqui sem evidencia aumenta risco de redundancia e custo de escrita sem ganho claro

Decisao segura:

- deixar `daily_logs` por ultimo
- so considerar novo indice se o plano mostrar necessidade real

### Referencias oficiais usadas neste plano

- Supabase Query Optimization: https://supabase.com/docs/guides/database/query-optimization
- Supabase Managing Indexes in Postgres: https://supabase.com/docs/guides/database/postgres/indexes
- Supabase pg_stat_statements: https://supabase.com/docs/guides/database/extensions/pg_stat_statements
- Supabase Understanding Postgres EXPLAIN Output: https://supabase.com/docs/guides/troubleshooting/understanding-postgresql-explain-output-Un9dqX

### Backlog de execucao

#### Fase 1. Medicao e confirmacao

Objetivo:

- confirmar o que ja existe
- evitar indice redundante
- descobrir a ordem real dos gargalos

Itens:

1. Consultar `pg_indexes` das tabelas quentes.
2. Validar se o indice implicito de `daily_logs` ja atende `project_id + date`.
3. Rodar `EXPLAIN (ANALYZE, BUFFERS)` para:
   - lista de `daily_logs`
   - lista de `weekly_updates`
   - lista de `schedule_stages`
   - lista de `payments`
   - agregacao do badge de pendencias
4. Consultar `pg_stat_statements` para identificar as queries com maior `total_exec_time`.

Saida esperada:

- lista de queries realmente lentas
- lista de indices faltantes com evidencia
- confirmacao se RLS entra ou nao na fila curta

#### Fase 2. Primeira refatoracao de leitura

Objetivo:

- reduzir payload e custo no frontend sem alterar regra de negocio

Itens:

1. Separar `daily_logs` em:
   - query de lista resumida
   - query de detalhe completo
2. Planejar paginacao por cursor em `daily_logs`, usando `date` como eixo principal.
3. Trocar o badge de pendencias por agregacao no banco.
4. Revisar se o dashboard pode consumir resumo em vez de lista completa quando nao precisa de payload detalhado.

Saida esperada:

- menos dados trafegados
- menor custo de renderizacao e transformacao no cliente
- queda de latencia percebida antes mesmo de mexer em indice

#### Fase 3. Primeira migration de performance

Objetivo:

- adicionar apenas indices com justificativa observada em medicao
- manter risco operacional baixo

Ordem sugerida de candidatas:

1. `weekly_updates (project_id, date desc)`
2. `payments (project_id, request_date desc)`
3. `schedule_stages (project_id, planned_start)`
4. `project_documents (project_id, created_at desc)`, se a tabela justificar
5. `daily_logs`: somente se a medicao provar necessidade alem do indice implicito atual

Regras extras de rollout:

- nao aplicar mais de um indice operacional por rodada se o ambiente estiver em uso
- revalidar `EXPLAIN` imediatamente antes da migration
- acompanhar latencia das telas apos cada indice, em vez de aplicar tudo em lote

Saida esperada:

- menor custo de scan e sort
- melhor desempenho nas listas ordenadas do projeto
- nenhum impacto funcional em `schedule_stages`

#### Fase 4. Segunda rodada de medicao

Objetivo:

- verificar ganho real apos refatoracao e indices

Itens:

1. Repetir `EXPLAIN (ANALYZE, BUFFERS)` nas mesmas queries.
2. Comparar:
   - tempo total
   - tipo de scan
   - custo de sort
   - buffers lidos
3. Validar se a query do badge e a lista de `daily_logs` deixaram de ser outliers.

Saida esperada:

- evidencia objetiva do ganho
- base segura para decidir se ainda vale mexer em RLS

#### Fase 5. Refino de RLS, se ainda necessario

Objetivo:

- tratar custo de policy apenas se ele continuar aparecendo como gargalo material

Itens:

1. Revisar policies duplicadas ou sobrepostas no ambiente remoto.
2. Validar se ha custo relevante de policy por linha nas tabelas mais lidas.
3. Simplificar apenas as policies com impacto confirmado.

Saida esperada:

- ganho fino adicional
- menor risco de mexer em autorizacao sem necessidade

### Primeiros entregaveis praticos

Se for executar em ciclos pequenos, a ordem recomendada e:

1. Primeiro pacote:
   - conferir `pg_indexes`
   - rodar `EXPLAIN` das 5 queries principais
   - levantar `pg_stat_statements`
2. Segundo pacote:
   - desenhar a nova query resumida de `daily_logs`
   - desenhar a query agregada do badge
3. Terceiro pacote:
   - criar a primeira migration de indices confirmados
4. Quarto pacote:
   - reexecutar medicoes e decidir se RLS entra ou sai do backlog curto

### Tarefas objetivas por arquivo e migration

#### App

##### 1. [src/hooks/useDailyLogs.ts](C:/Users/gabri/Projetos/obra-conectada-mobile/src/hooks/useDailyLogs.ts:92)

Tarefas:

- separar a query atual em dois fluxos:
  - lista resumida
  - detalhe completo por `logId`
- reduzir o `select` da lista para somente os campos usados em cards, calendario e resumo
- desenhar paginacao por cursor usando `date`
- revisar se o realtime precisa recarregar a colecao inteira ou se pode invalidar apenas a lista atual

Resultado esperado:

- menor payload por leitura
- menos custo de transformacao no frontend

##### 2. [src/hooks/usePendingMenuBadgeCount.ts](C:/Users/gabri/Projetos/obra-conectada-mobile/src/hooks/usePendingMenuBadgeCount.ts:5)

Tarefas:

- remover a dependencia de carregar `daily_logs` completos para montar o badge
- trocar a soma no frontend por uma consulta agregada no banco
- avaliar se a consulta vira:
  - RPC
  - view com seguranca adequada
  - ou query SQL direta via tabela base, se simples o bastante

Resultado esperado:

- leitura leve e direta
- badge deixa de depender de colecoes inteiras

##### 3. [src/screens/DashboardScreen.tsx](C:/Users/gabri/Projetos/obra-conectada-mobile/src/screens/DashboardScreen.tsx:83)

Tarefas:

- revisar quais secoes realmente precisam de `logs` completos
- identificar o que pode ser abastecido por resumo ou contagem
- evitar que o dashboard dependa de um feed operacional completo quando quer apenas metricas

Resultado esperado:

- dashboard mais barato em leitura
- menos acoplamento ao payload de `daily_logs`

##### 4. [src/hooks/useUpdates.ts](C:/Users/gabri/Projetos/obra-conectada-mobile/src/hooks/useUpdates.ts:37)

Tarefas:

- medir a query atual com `weekly_update_rooms`
- validar se precisa de paginacao quando o volume crescer
- confirmar se o indice composto por `project_id + date` traz ganho real

##### 5. [src/hooks/useStages.ts](C:/Users/gabri/Projetos/obra-conectada-mobile/src/hooks/useStages.ts:92)

Tarefas:

- medir custo da ordenacao por `planned_start`
- confirmar se o indice composto por `project_id + planned_start` e suficiente
- verificar se telas futuras vao filtrar por `status`, o que pode mudar o desenho do indice

Limite desta frente:

- nao alterar validacoes de `buildStagePayload`
- nao alterar regras de `status` e `percent_complete`
- nao alterar a mutacao de escrita das etapas
- qualquer ajuste aqui deve ficar restrito ao caminho de leitura

##### 6. [src/hooks/usePayments.ts](C:/Users/gabri/Projetos/obra-conectada-mobile/src/hooks/usePayments.ts:60)

Tarefas:

- medir se a paginacao atual com `range` esta performando bem
- validar se `project_id + request_date desc` resolve scan e sort
- confirmar se filtros futuros por `status` vao exigir indice diferente ou adicional

##### 7. [src/hooks/useDocuments.ts](C:/Users/gabri/Projetos/obra-conectada-mobile/src/hooks/useDocuments.ts:36)

Tarefas:

- medir se `project_documents_project_id_idx` atual e suficiente
- so considerar indice composto com `created_at desc` se houver sort custoso no `EXPLAIN`

#### Banco

##### 8. Medicao SQL

Tarefas:

- levantar `pg_indexes`
- rodar `EXPLAIN (ANALYZE, BUFFERS)` nas queries quentes
- levantar `pg_stat_statements`
- registrar os resultados antes de qualquer migration

Artefatos esperados:

- bloco SQL de conferencia
- bloco SQL de explain
- bloco SQL de estatisticas

##### 9. Primeira migration de indices

Tarefas:

- criar migration apenas para indices confirmados por medicao
- evitar duplicar indice implicito existente
- manter a migration focada em performance, sem misturar mudancas de regra

Ordem mais provavel:

1. `weekly_updates`
2. `payments`
3. `schedule_stages`
4. `project_documents`, se necessario
5. `daily_logs`, somente se comprovado

##### 10. Eventual RPC de badge

Tarefas:

- se a agregacao do badge ficar mais clara como funcao SQL, criar RPC dedicada
- manter escopo pequeno: apenas retornar os totais necessarios
- evitar RPC que devolva payload operacional completo

#### Validacao

##### 11. Comparacao antes e depois

Tarefas:

- comparar tempo das queries antes e depois
- comparar quantidade de linhas lidas
- comparar tipo de scan usado
- comparar custo de sort
- confirmar que create, update e delete de etapas continuam sem mudanca funcional

##### 12. Fila de RLS

Tarefas:

- so entrar nessa frente se a medicao continuar mostrando custo relevante apos as fases anteriores
- mapear policies reais do ambiente remoto, nao apenas as migrations locais
- priorizar tabelas mais lidas, nao revisao global de policy

### Ordem curta de ataque

Se fosse executar isso com o menor risco e maior retorno:

1. Medir `daily_logs`, `badge`, `weekly_updates`, `schedule_stages` e `payments`.
2. Redesenhar `useDailyLogs` e `usePendingMenuBadgeCount`.
3. Criar migration apenas dos indices que o `EXPLAIN` justificar.
4. Repetir medicao.
5. So depois decidir se vale abrir frente de RLS.

### Conclusao

O problema mais provavel de leitura hoje e a combinacao de:

- leitura ampla demais
- joins aninhados
- agregacao no frontend
- ausencia de alguns indices compostos nas consultas quentes

RLS pode ter participacao, mas ainda nao parece ser o primeiro gargalo a atacar.
