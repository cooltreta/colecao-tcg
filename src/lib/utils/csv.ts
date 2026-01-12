export type Variant = "normal" | "alt" | "parallel";
export type Condition = "NM" | "LP" | "MP" | "HP";
export type Language = "EN" | "JP" | "PT" | "ES" | "FR" | "DE" | "IT" | "OTHER";

export type CsvRow = {
  code: string;
  qty: number;
  variant: Variant;
  condition: Condition;
  language: Language;
};

function clean(s: string) {
  return s.trim().replace(/^"(.*)"$/, "$1").trim();
}

function asVariant(v?: string): Variant {
  const x = (v ?? "").trim().toLowerCase();
  if (x === "alt") return "alt";
  if (x === "parallel") return "parallel";
  return "normal";
}

function asCondition(v?: string): Condition {
  const x = (v ?? "").trim().toUpperCase();
  if (x === "LP" || x === "MP" || x === "HP") return x;
  return "NM";
}

function asLanguage(v?: string): Language {
  const x = (v ?? "").trim().toUpperCase();
  const allowed: Language[] = ["EN", "JP", "PT", "ES", "FR", "DE", "IT", "OTHER"];
  return (allowed.includes(x as Language) ? (x as Language) : "EN");
}

export function parseCsv(text: string): CsvRow[] {
  const raw = (text ?? "").replace(/^\uFEFF/, ""); // remove BOM

  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length === 0) return [];

  // Limite básico para não matar o browser
  const MAX_LINES = 10000;
  if (lines.length > MAX_LINES + 1) {
    throw new Error(`CSV demasiado grande. Máx: ${MAX_LINES} linhas de dados.`);
  }

  // Detect delimiter by header line (very common: ; in PT Excel)
  const headerLine = lines[0];
  const delimiter =
    headerLine.includes(";") && !headerLine.includes(",") ? ";" : ",";

  // Splitter que respeita aspas: a,b,"c,d",e
  const splitRow = (line: string): string[] => {
    const out: string[] = [];
    let cur = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];

      if (ch === '"') {
        // handle escaped quotes ""
        const next = line[i + 1];
        if (inQuotes && next === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
        continue;
      }

      if (!inQuotes && ch === delimiter) {
        out.push(clean(cur));
        cur = "";
        continue;
      }

      cur += ch;
    }

    out.push(clean(cur));
    return out;
  };

  const header = splitRow(lines[0]).map((h) => h.toLowerCase());
  const idx = (name: string) => header.findIndex((h) => h === name);

  const codeIdx =
  idx("code") !== -1
    ? idx("code")
    : idx("cardcode");
  const qtyIdx = header.findIndex((h) => h === "qty" || h === "quantity");
  const variantIdx = idx("variant");
  const conditionIdx = idx("condition");
  const languageIdx = idx("language");

 if (codeIdx === -1 || qtyIdx === -1) {
  throw new Error(
    'CSV inválido. Precisas de colunas "code" ou "cardCode" e "qty".'
  );
}


  const rows: CsvRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = splitRow(lines[i]);

    const code = (cols[codeIdx] ?? "").trim();
    if (!code) continue;

    const qty = Number((cols[qtyIdx] ?? "").trim());
    if (!Number.isFinite(qty) || qty <= 0) continue;

    rows.push({
      code,
      qty,
      variant: asVariant(cols[variantIdx]),
      condition: asCondition(cols[conditionIdx]),
      language: asLanguage(cols[languageIdx]),
    });
  }

  return rows;
}

