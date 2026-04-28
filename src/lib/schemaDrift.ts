import { getErrorMessage } from "./errorMessage";

const SCHEMA_DRIFT_MESSAGE =
  "O banco Supabase parece estar desatualizado em relacao ao app. Aplique as migrations de supabase/migrations antes de publicar ou testar este fluxo.";

const SCHEMA_TERMS = [
  "room_id",
  "room_ids",
  "rooms",
  "daily_log_rooms",
  "daily_log_service_items",
  "weekly_update_rooms",
  "daily_log_employees",
  "user_id",
  "photos_urls",
  "videos_urls",
  "p_room_id",
  "p_room_ids",
  "p_service_items",
  "p_photos_urls",
  "p_videos_urls",
  "p_user_ids",
  "upsert_daily_log_with_profiles",
  "upsert_weekly_update_with_rooms",
  "upsert_full_project",
];

const SCHEMA_ERROR_CODES = new Set([
  "PGRST200",
  "PGRST201",
  "PGRST202",
  "PGRST204",
  "42703",
  "42883",
  "42P01",
]);

export function withSchemaDriftContext(error: unknown, context: string) {
  if (!isLikelySchemaDrift(error)) {
    return error;
  }

  return new Error(`${SCHEMA_DRIFT_MESSAGE} Contexto: ${context}. Detalhe: ${getErrorMessage(error)}`);
}

function isLikelySchemaDrift(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const maybeError = error as {
    code?: unknown;
    message?: unknown;
    details?: unknown;
    hint?: unknown;
  };

  const code = typeof maybeError.code === "string" ? maybeError.code : "";
  if (SCHEMA_ERROR_CODES.has(code)) {
    return true;
  }

  const searchable = [maybeError.message, maybeError.details, maybeError.hint]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();

  return SCHEMA_TERMS.some((term) => searchable.includes(term.toLowerCase()));
}
