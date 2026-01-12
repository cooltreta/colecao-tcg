export function nowIso() {
  return new Date().toISOString();
}

export function randomId(prefix = "id") {
  return `${prefix}_${Math.random().toString(16).slice(2)}${Date.now().toString(16)}`;
}

