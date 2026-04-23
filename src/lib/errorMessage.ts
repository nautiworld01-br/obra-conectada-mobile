export function getErrorMessage(error: unknown, fallback = "Erro inesperado.") {
  if (error instanceof Error) {
    return error.message || fallback;
  }

  if (typeof error === "string" && error.trim()) {
    return error.trim();
  }

  if (error && typeof error === "object") {
    const maybeError = error as {
      message?: unknown;
      details?: unknown;
      hint?: unknown;
      code?: unknown;
      error_description?: unknown;
    };

    const parts = [
      stringifyPart(maybeError.message),
      stringifyPart(maybeError.details),
      stringifyPart(maybeError.hint),
      stringifyPart(maybeError.error_description),
    ].filter(Boolean);

    if (parts.length) {
      return parts.join(" | ");
    }

    const code = stringifyPart(maybeError.code);
    if (code) {
      return `Erro ${code}`;
    }
  }

  return fallback;
}

function stringifyPart(value: unknown) {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return "";
}
