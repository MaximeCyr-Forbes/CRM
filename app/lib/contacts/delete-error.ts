// Log identifiers only: PostgREST details can contain contact data or provider tokens.
export function contactDeleteDiagnostic(contactId: string, error: unknown) {
  const value = error && typeof error === "object" ? error as Record<string, unknown> : {};
  const message = typeof value.message === "string" ? value.message : "";
  const identifier = (input: unknown) => typeof input === "string" && /^[a-zA-Z0-9_.-]{1,120}$/.test(input) ? input : null;
  return {
    contactId,
    code: identifier(value.code),
    constraint: identifier(value.constraint) ?? identifier(message.match(/constraint "([^"]+)"/)?.[1]),
    table: identifier(value.table) ?? identifier([...message.matchAll(/on table "([^"]+)"/g)].at(-1)?.[1]),
    kind: error instanceof Error ? error.name : "DatabaseError",
  };
}
