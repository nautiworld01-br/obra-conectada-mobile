# Repository Guidelines

## Project Structure & Module Organization
`src/` contains the app code: `screens/` for user flows, `components/` for shared UI, `hooks/` for data access and feature logic, `contexts/` and `providers/` for app-wide state, `navigation/` for routing, and `lib/` for Supabase, validation, and utilities. Static assets live in `assets/` and `public/`. Build output goes to `dist/` and should not be edited manually. Database history lives in `supabase/migrations/`; Edge Functions live in `supabase/functions/`.

## Build, Test, and Development Commands
Use `npm start` to run the Expo app locally, or `npm run web` for the browser target. `npm run start:tunnel` exposes Expo through a tunnel when local networking is unreliable. `npm run typecheck` runs strict TypeScript checks. `npm run lint` runs repository-specific guardrails such as blocking `console.log`, `debugger`, and SQL files outside `supabase/migrations/`. `npm run smoke` verifies critical files, env keys, deploy workflow, service worker hooks, and schema contracts. Run `npm run quality` before opening a PR. Use `npm run export:web` to generate the deployable PWA in `dist/`.

## Coding Style & Naming Conventions
Write TypeScript with strict typing and 2-space/standard Prettier-style indentation as already used in `src/`. Prefer double quotes and semicolons. Use PascalCase for screens and components (`DashboardScreen.tsx`, `SectionCard.tsx`), camelCase for hooks and helpers (`useDailyLogs.ts`, `storageUpload.ts`), and descriptive migration names such as `20260423042201_fix_employee_sync_and_daily_delete.sql`. Keep business rules in hooks/lib code, not inline in screen components.

## Testing Guidelines
This repository currently relies on static quality gates rather than a unit-test suite. Treat `npm run quality` as the required local check. When changing schema or push flows, also verify the affected files under `supabase/` and confirm `.env.example` stays in sync with any new public env var.

## Commit & Pull Request Guidelines
Recent history favors short, imperative commit subjects such as `Fix employee sync and daily log delete` or `Improve room selectors and room list scroll`. Keep commits focused and avoid mixing app, schema, and deployment changes unless they ship together. PRs should include a concise summary, linked issue or task when available, screenshots for UI changes, and notes for any migration, env, or deployment impact.

## Security & Configuration Tips
Only expose `EXPO_PUBLIC_*` variables in the app bundle. Never commit service-role keys, database passwords, or admin tokens. If you change database behavior, add a migration in `supabase/migrations/`; do not leave schema changes only in the remote Supabase project.
