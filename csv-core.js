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

  const PROCUREMENT_ORDER = [
    "家電", "美容", "ドラッグストア", "食品", "日用品", "DIY・工具",
    "ホビー", "ベビー", "ペット", "スポーツ", "ファッション",
    "自動車", "メディア・ゲーム", "その他", "未分類",
  ];

  function procurementCategory(category, explicit) {
    const chosen = String(explicit || "").trim();
    if (chosen) return chosen;
    const original = String(category || "").trim();
    if (!original || original === "未分類") return "未分類";
    const value = original.toLowerCase().replace(/[\s_&/・-]+/g, " ");
    const has = (...words) => words.some((word) => value.includes(word));

    if (has("baby", "ベビー", "乳幼児")) return "ベビー";
    if (has("pet", "ペット", "犬用品", "猫用品")) return "ペット";
    if (has("grocery", "gourmet food", "food and beverage", "食品", "飲料", "お菓子")) return "食品";
    if (has("drugstore", "health and beauty", "health care", "healthcare", "ドラッグ", "ヘルスケア", "衛生")) return "ドラッグストア";
    if (has("beauty", "luxury beauty", "personal care appliance", "美容", "ビューティー", "コスメ", "化粧")) return "美容";
    if (has("video game", "software", "book", "dvd", "music", "movie", "ゲーム", "書籍", "洋書", "本", "dvd", "音楽", "ミュージック", "pcソフト", "kindle", "audible")) return "メディア・ゲーム";
    if (has("electronics", "consumer electronics", "camera", "wireless", "personal computer", "computer", "major appliance", "amazonデバイス", "家電", "パソコン", "カメラ", "テレビ")) return "家電";
    if (has("home improvement", "tools", "tool", "biss", "hardware", "diy", "工具", "資材", "産業", "研究開発")) return "DIY・工具";
    if (has("kitchen", "home", "office product", "lawn and garden", "household", "日用品", "キッチン", "文房具", "オフィス")) return "日用品";
    if (has("toys", "toy", "hobby", "collectible", "ホビー", "おもちゃ", "玩具", "楽器", "手芸", "画材")) return "ホビー";
    if (has("sports", "outdoors", "sporting goods", "スポーツ", "アウトドア")) return "スポーツ";
    if (has("apparel", "shoes", "jewelry", "watch", "luggage", "ファッション", "服", "靴", "ジュエリー", "時計", "バッグ")) return "ファッション";
    if (has("automotive", "car", "カー用品", "自動車", "車", "バイク")) return "自動車";
    return "その他";
  }

  const STORE_CANDIDATES = {
    "家電": ["ヤマダデンキ", "エディオン", "ケーズデンキ", "ジョーシン", "ドン・キホーテ"],
    "美容": ["マツキヨココカラ", "スギ薬局", "ウエルシア", "コスモス", "ドン・キホーテ"],
    "ドラッグストア": ["コスモス", "スギ薬局", "ウエルシア", "マツキヨココカラ", "ドン・キホーテ"],
    "食品": ["トライアル", "コストコ", "イオン系", "スーパー", "ドン・キホーテ"],
    "日用品": ["トライアル", "ドン・キホーテ", "ホームセンター", "ドラッグストア", "イオン系"],
    "DIY・工具": ["コーナン", "DCM", "コメリ", "カインズ", "ナフコ"],
    "ホビー": ["ジョーシン", "エディオン", "ヤマダデンキ", "トイザらス", "ドン・キホーテ"],
    "ベビー": ["西松屋", "アカチャンホンポ", "ベビーザらス", "ドラッグストア", "イオン系"],
    "ペット": ["ホームセンター", "ペット専門店", "イオン系", "トライアル", "ドン・キホーテ"],
    "スポーツ": ["スポーツデポ", "ゼビオ", "ヒマラヤ", "アルペン", "ドン・キホーテ"],
    "ファッション": ["しまむら", "イオン系", "ドン・キホーテ", "アウトレット", "ABC-MART"],
    "自動車": ["オートバックス", "イエローハット", "ジェームス", "ホームセンター", "ドン・キホーテ"],
    "メディア・ゲーム": ["ゲオ", "ブックオフ", "ヤマダデンキ", "エディオン", "ジョーシン"],
    "その他": ["ドン・キホーテ", "トライアル", "ホームセンター", "イオン系", "地方店"],
    "未分類": ["ドン・キホーテ", "トライアル", "ホームセンター", "ドラッグストア", "家電量販店"],
  };

  function recommendedStores(procurement, explicit) {
    const chosen = String(explicit || "").trim();
    if (chosen) return chosen.split(/[|｜、,]/).map((value) => value.trim()).filter(Boolean);
    return (STORE_CANDIDATES[procurement] || STORE_CANDIDATES["未分類"]).slice();
  }

  function parseBoolean(value) {
    const text = String(value == null ? "" : value).trim().toLowerCase();
    if (["1", "true", "yes", "y", "あり", "在庫あり", "amazonあり", "amazon本体あり"].includes(text)) return true;
    if (["0", "false", "no", "n", "なし", "不在", "在庫切れ", "amazon不在", "amazon本体不在"].includes(text)) return false;
    return null;
  }

  function amazonStatusFromRaw(raw) {
    const presentKeys = ["amazon_present", "amazonPresent", "Amazon本体", "Amazon本体在庫", "Amazon在庫"];
    for (const key of presentKeys) {
      if (Object.prototype.hasOwnProperty.call(raw, key) && String(raw[key]).trim() !== "") {
        const value = parseBoolean(raw[key]);
        if (value !== null) return value ? "present" : "absent";
      }
    }
    const absentKeys = ["amazon_absent", "amazonAbsent", "Amazon不在", "Amazon本体不在"];
    for (const key of absentKeys) {
      if (Object.prototype.hasOwnProperty.call(raw, key) && String(raw[key]).trim() !== "") {
        const value = parseBoolean(raw[key]);
        if (value !== null) return value ? "absent" : "present";
      }
    }
    const status = String(raw.amazon_status || raw["Amazon状態"] || "").trim().toLowerCase();
    if (["absent", "不在", "在庫切れ", "amazon不在"].includes(status)) return "absent";
    if (["present", "あり", "在庫あり", "amazonあり"].includes(status)) return "present";
    return "unknown";
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
      const asin = (raw.asin || raw.ASIN || "").trim();
      const jan = (raw.jan || raw.JAN || raw.jan_code || raw["JANコード"] || raw.ean || raw.EAN || "").trim();
      const suppliedKeepa = (raw.keepa_url || "").trim();
      const image = (raw.image_url || "").trim();
      const fallbackImage = /^[A-Z0-9]{10}$/.test(asin)
        ? `https://images-na.ssl-images-amazon.com/images/P/${asin}.09.LZZZZZZZ.jpg`
        : "";
      const category = (raw.category || raw["カテゴリー"] || raw["カテゴリ"] ||
        raw.product_category || raw.product_group || raw.productGroup || "").trim() || "未分類";
      const explicitProcurement = (raw.procurement_category || raw["仕入れカテゴリー"] || raw["大分類"] || "").trim();
      const procurement = procurementCategory(category, explicitProcurement);
      const explicitStores = (raw.recommended_stores || raw["推奨仕入れ店舗"] || raw["仕入れ店舗候補"] || "").trim();
      const amazonStatus = amazonStatusFromRaw(raw);
      rows.push({
        asin,
        jan,
        currentPriceYen: (raw.current_price_yen || "").trim(),
        categoryRank: ((raw.category_rank || "").trim() || (raw.sales_rank || "").trim()),
        grade: (raw.grade || "").trim().toUpperCase(),
        title: (raw.title || "").trim(),
        category,
        procurementCategory: procurement,
        recommendedStores: recommendedStores(procurement, explicitStores),
        amazonStatus,
        imageUrl: /^https?:\/\//i.test(image) ? image : fallbackImage,
        keepaUrl: /^https:\/\/(?:www\.)?keepa\.com\//i.test(suppliedKeepa)
          ? suppliedKeepa
          : (asin ? `https://keepa.com/#!product/5-${encodeURIComponent(asin)}` : ""),
        monotracerUrl: /^[A-Z0-9]{10}$/.test(asin)
          ? `https://www.mono-tracer.com/#/product/${encodeURIComponent(asin)}` : "",
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

  function categoryCounts(rows, field = "category") {
    const counts = new Map();
    rows.forEach((row) => {
      const category = row[field] || "未分類";
      counts.set(category, (counts.get(category) || 0) + 1);
    });
    const order = new Map(PROCUREMENT_ORDER.map((value, index) => [value, index]));
    return Array.from(counts, ([category, count]) => ({ category, count }))
      .sort((a, b) => field === "procurementCategory"
        ? (order.get(a.category) ?? 999) - (order.get(b.category) ?? 999) || a.category.localeCompare(b.category, "ja")
        : a.category.localeCompare(b.category, "ja"));
  }

  function filterRows(rows, procurement, category, amazonStatus = "__ALL__") {
    return rows.filter((row) => {
      const procurementOk = !procurement || procurement === "__ALL__" ||
        (row.procurementCategory || "未分類") === procurement;
      const categoryOk = !category || category === "__ALL__" ||
        (row.category || "未分類") === category;
      const amazonOk = !amazonStatus || amazonStatus === "__ALL__" ||
        (row.amazonStatus || "unknown") === amazonStatus;
      return procurementOk && categoryOk && amazonOk;
    });
  }

  function amazonStatusCounts(rows) {
    const counts = { absent: 0, present: 0, unknown: 0 };
    rows.forEach((row) => {
      const status = ["absent", "present"].includes(row.amazonStatus) ? row.amazonStatus : "unknown";
      counts[status] += 1;
    });
    return counts;
  }

  function filterByCategory(rows, category) {
    return filterRows(rows, "__ALL__", category);
  }

  function withoutFile(files, fileId) {
    return files.filter((file) => file.id !== fileId);
  }

  return { CsvError, parseCsv, normalizeCsv, duplicateCounts, categoryCounts, filterRows, filterByCategory, procurementCategory, recommendedStores, amazonStatusCounts, withoutFile };
});
