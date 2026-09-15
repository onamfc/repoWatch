/** Structured JSON logging so entries are searchable in Workers Logs. */
type Fields = Record<string, unknown>;

function emit(level: "info" | "warn" | "error", msg: string, fields: Fields): void {
  const line = JSON.stringify({ level, msg, ...fields });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const log = {
  info: (msg: string, fields: Fields = {}) => emit("info", msg, fields),
  warn: (msg: string, fields: Fields = {}) => emit("warn", msg, fields),
  error: (msg: string, fields: Fields = {}) => emit("error", msg, fields),
};
