# Obra Conectada - Mobile

Este projeto é um aplicativo mobile desenvolvido com **Expo** e **React Native**, utilizando **Supabase** como backend e **React Query** para gerenciamento de estado e requisições.

## Stack Tecnológica

- **Framework:** Expo (SDK 54)
- **Linguagem:** TypeScript
- **Backend:** Supabase
- **Gerenciamento de Estado/Cache:** React Query (@tanstack/react-query)
- **Navegação:** React Navigation
- **Estilização:** Native (StyleSheet)

## Diretrizes de Engenharia Sênior

### Prioridades
1.  **Segurança de Dados:** Proteção rigorosa de dados sensíveis entre backend e frontend.
2.  **Robustez e Clareza:** Arquitetura sólida, implementação clara e baixo risco técnico.
3.  **Preservação:** Manutenção de estruturas já validadas e em funcionamento.

### Regras de Implementação
- **Mudanças Conservadoras:** Não propor alterações estruturais em partes validadas sem pedido explícito.
- **Ajustes Cirúrgicos:** Preferir melhorias incrementais e de baixo impacto.
- **Backend First:** Toda lógica sensível, validação crítica e regras de autorização devem residir ou ser validadas no backend.

### Padrão de Código
- **Documentação:** Comentários curtos por bloco explicando a finalidade da lógica.
- **Débito Técnico/Melhorias:** Utilizar o padrão `// future_fix [categoria][prioridade]: descrição` para sinalizar melhorias futuras (ex: `// future_fix [seguranca][alta]: validar input`).

### Mensagens de Commit
- **Formato:** Frases descritivas, claras e diretas.
- **Estilo:** Sem prefixos de comandos (não usar "feat:", "fix:", etc.). Explicar o que foi feito e o porquê.

### Execução de Tarefas
- **Validação:** Fazer perguntas objetivas antes da execução.
- **Planejamento:** Apresentar plano breve e comparar abordagens, recomendando a mais segura.
- **Postura Crítica:** Não concordar automaticamente; apontar riscos, fragilidades e trade-offs com precisão técnica.

## Convenções de Projeto

- **Componentes:** Devem ser funcionais e utilizar Hooks.
- **Hooks Customizados:** Localizados em `src/hooks/`, devem abstrair a lógica de dados usando React Query.
- **Supabase:** Configurações e instâncias em `src/lib/supabase.ts`. Migrações em `supabase/migrations/`.
- **Segurança:** Nunca exponha chaves. Utilize `src/lib/env.ts`.

---
*Estas instruções são mandatórias para a atuação do Gemini CLI neste repositório.*
