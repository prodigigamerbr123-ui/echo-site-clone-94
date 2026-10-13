/** Errors from the database may be plain objects rather than Error instances. */
export function errorMessage(error: unknown, fallback = "Não foi possível concluir a operação."): string {
  if (error && typeof error === "object" && "message" in error &&
      typeof error.message === "string" && error.message.trim()) {
    return error.message;
  }
  return fallback;
}
