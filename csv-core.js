(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.MobileCsv = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  class CsvError extends Error {
    constructor(message, line) {
      super(message);
      this.name = "CsvError";
      this.line = line;
    }
  }

  function parseCsv(source) {
    const text = String(source || "").replace(/^\uFEFF/, "");
    const rows = [];
    let row = [], field = "", quoted = false, afterQuote = false, line = 1;
    let rowLine = 1;
    const pushRow = () => { row.push(field); rows.push({ values: row, line: rowLine }); row = []; field = ""; };

    for (let i = 0; i < text.length; i += 1) {
      const char = text[i];
      if (quoted) {
        if (char === '"') {
          if (text[i + 1] === '"') { field += '"'; i += 1; }
          else { quoted = false; afterQuote = true; }
        } else {
          field += char;
        }
        continue;
      }
      if (afterQuote) {
        if (char === ",") { row.push(field); field = ""; afterQuote = false; continue; }
        if (char === "\r" || char === "\n") {
          pushRow(); afterQuote = false;
          if (char === "\r" && text[i + 1] === "\n") i += 1;
          line += 1; rowLine = line; continue;
        }
        throw new CsvError("閉じ引用符の後に不正な文字があります", line);
      }
      if (char === '"') {
        if (field !== "") throw new CsvError("フィールド途中の引用符です", line);
        quoted = true;
      } else if (char === ",") {
        row.push(field); field = "";
      } else if (char === "\r" || char === "\n") {
        pushRow();
        if (char === "\r" && text[i + 1] === "\n") i += 1;
        line += 1; rowLine = line;
      } else {
        field += char;
      }
    }
    if (quoted) throw new CsvError("引用符が閉じられていません", line);
    if (afterQuote || field !== "" || row.length > 0) pushRow();
    return rows;
  }

  function normalizeRows(text, fileName) {
    const parsed = parseCsv(text);
    if (!parsed.length) return [];
    const headers = parsed[0].values.map((value) => value.trim());
    if (!headers.some(Boolean)) throw new CsvError("ヘッダーがありません", parsed[0].line);
    const rows = [];
    for (const entry of parsed.slice(1)) {
      if (entry.values.length !== headers.length) {
        throw new CsvError(`列数がヘッダーと一致しません（${entry.values.length}/${headers.length}列）`, entry.line);
      }
      const raw = Object.create(null);
      headers.forEach((key, index) => { if (key) raw[key] = entry.values[index]; });
      const asin = (raw.asin || "").trim();
      const suppliedKeepa = (raw.keepa_url || "").trim();
      const image = (raw.image_url || "").trim();
      rows.push({
        asin,
        currentPriceYen: (raw.current_price_yen || "").trim(),
        categoryRank: ((raw.category_rank || "").trim() || (raw.sales_rank || "").trim()),
        grade: (raw.grade || "").trim().toUpperCase(),
        title: (raw.title || "").trim(),
        imageUrl: /^https?:\/\//i.test(image) ? image : "",
        keepaUrl: /^https:\/\/(?:www\.)?keepa\.com\//i.test(suppliedKeepa)
          ? suppliedKeepa
          : (asin ? `https://keepa.com/#!product/5-${encodeURIComponent(asin)}` : ""),
        fileName,
        line: entry.line,
      });
    }
    return rows;
  }

  // Header is logical row 1; embedded cell newlines never increment it.
  function normalizeCsv(text, fileName) {
    try { return normalizeRows(text, fileName); }
    catch (error) {
      error.fileName = fileName;
      error.message = `${fileName}・論理行${error.line || 1}: ${error.message}`;
      throw error;
    }
  }

  function duplicateCounts(rows) {
    const counts = new Map();
    rows.forEach((row) => { if (row.asin) counts.set(row.asin, (counts.get(row.asin) || 0) + 1); });
    return counts;
  }

  return { CsvError, parseCsv, normalizeCsv, duplicateCounts };
});
