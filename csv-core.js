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

  function firstRawValue(raw, aliases) {
    for (const alias of aliases) {
      if (Object.prototype.hasOwnProperty.call(raw, alias) && String(raw[alias]).trim() !== "") {
        return raw[alias];
      }
    }
    return "";
  }

  function finiteNumber(value) {
    if (value == null || String(value).trim() === "") return null;
    const number = Number(String(value).replace(/,/g, "").trim());
    return Number.isFinite(number) ? number : null;
  }

  function normalizeChoice(value, choices) {
    const text = String(value == null ? "" : value).trim().toLowerCase();
    for (const [normalized, aliases] of Object.entries(choices)) {
      if (aliases.includes(text)) return normalized;
    }
    return "unknown";
  }

  function normalizeSuccessorStatus(value) {
    return normalizeChoice(value, {
      none: ["none", "no_successor", "なし", "後継品なし"],
      major_change: ["major_change", "大幅変更", "容量変更", "容量ダウン", "パケ大幅変更", "成分変更", "香り変更"],
      similar: ["similar", "ほぼ同じ", "軽微変更", "パケ変のみ"],
    });
  }

  function normalizeLevel(value) {
    return normalizeChoice(value, {
      high: ["high", "高"],
      medium: ["medium", "中"],
      low: ["low", "低"],
    });
  }

  function normalizeNeedType(value) {
    return normalizeChoice(value, {
      minus_to_zero: ["minus_to_zero", "-to0", "－→0", "マイナスからゼロ"],
      zero_to_plus: ["zero_to_plus", "0to+", "0→+", "ゼロからプラス"],
      neutral: ["neutral", "中間"],
    });
  }

  function premiumRankFromScore(score) {
    if (score >= 80) return "S";
    if (score >= 65) return "A";
    if (score >= 50) return "B";
    return "C";
  }

  function calculatePremiumPotential(input) {
    const data = input || {};
    const explicitScoreNumber = finiteNumber(data.explicitScore);
    const explicitScore = explicitScoreNumber === null
      ? null : Math.min(100, Math.max(0, explicitScoreNumber));
    const candidateRank = String(data.explicitRank || "").trim().toUpperCase();
    const explicitRank = ["S", "A", "B", "C"].includes(candidateRank) ? candidateRank : "";
    const categoryRank = finiteNumber(data.categoryRank);
    const productYears = finiteNumber(data.productYears);
    const reviewCount = finiteNumber(data.reviewCount);
    const salesAgeDays = finiteNumber(data.salesAgeDays);
    const successorStatus = normalizeSuccessorStatus(data.successorStatus);
    const uniquenessLevel = normalizeLevel(data.uniquenessLevel);
    const needType = normalizeNeedType(data.needType);
    const userDependency = normalizeLevel(data.userDependency);
    const reviewDependency = normalizeLevel(data.reviewDependency);
    const hasEvidence = successorStatus !== "unknown" || uniquenessLevel !== "unknown" ||
      needType !== "unknown" || userDependency !== "unknown" || reviewDependency !== "unknown" ||
      productYears !== null;

    if (explicitScore === null && !explicitRank && !hasEvidence) {
      return {
        premiumScore: null, premiumRank: "", premiumNote: "",
        successorStatus, uniquenessLevel, needType, userDependency, reviewDependency,
        reviewCount, salesAgeDays, productYears,
      };
    }

    let score = 0;
    score += { none: 18, major_change: 12, similar: 3 }[successorStatus] || 0;
    score += { high: 12, medium: 6 }[uniquenessLevel] || 0;
    if (categoryRank !== null && categoryRank > 0) {
      if (categoryRank <= 3000) score += 25;
      else if (categoryRank <= 5000) score += 18;
      else if (categoryRank <= 7000) score += 12;
      else if (categoryRank <= 10000) score += 6;
    }
    score += { minus_to_zero: 12, neutral: 6, zero_to_plus: 3 }[needType] || 0;
    score += { high: 8, medium: 4 }[userDependency] || 0;
    score += { high: 8, medium: 4 }[reviewDependency] || 0;
    if (reviewCount !== null && reviewCount > 0 && salesAgeDays !== null && salesAgeDays > 0) {
      const density = reviewCount / salesAgeDays;
      if (density >= 1) score += 7;
      else if (density >= 0.3) score += 5;
      else if (density >= 0.1) score += 3;
      else score += 1;
    }
    if (productYears !== null) {
      if (productYears >= 5) score += 10;
      else if (productYears >= 3) score += 7;
      else if (productYears >= 1) score += 4;
      else if (productYears > 0) score += 1;
    }
    score = explicitScore === null ? score : explicitScore;

    let rank = explicitRank || premiumRankFromScore(score);
    let premiumNote = "";
    if (categoryRank !== null && categoryRank > 0 && rank !== "C") {
      const capReasons = [];
      if (successorStatus === "none" && categoryRank > 10000) capReasons.push("後継品なし・1万位超");
      if (successorStatus === "major_change" && categoryRank > 5000) capReasons.push("大幅変更・5000位超");
      if (successorStatus === "similar" && !(categoryRank <= 999 && reviewDependency === "high")) {
        capReasons.push("後継品がほぼ同じ");
      }
      if (needType === "minus_to_zero" && categoryRank > 7000) capReasons.push("必要性高・7000位超");
      if (needType === "zero_to_plus" && categoryRank > 5000) capReasons.push("嗜好品・5000位超");
      if (capReasons.length) {
        rank = "C";
        premiumNote = `${capReasons.join("／")}のためC上限`;
      }
    }

    return {
      premiumScore: score, premiumRank: rank, premiumNote,
      successorStatus, uniquenessLevel, needType, userDependency, reviewDependency,
      reviewCount, salesAgeDays, productYears,
    };
  }

  function premiumPotentialFromRaw(raw, categoryRank) {
    return calculatePremiumPotential({
      explicitScore: firstRawValue(raw, ["premium_score", "プレミアスコア"]),
      explicitRank: firstRawValue(raw, ["premium_rank", "プレミアランク", "プレミア期待度"]),
      successorStatus: firstRawValue(raw, ["successor_status", "後継品状態"]),
      uniquenessLevel: firstRawValue(raw, ["uniqueness_level", "唯一無二"]),
      needType: firstRawValue(raw, ["need_type", "必要性タイプ"]),
      userDependency: firstRawValue(raw, ["user_dependency", "使用者依存度"]),
      reviewDependency: firstRawValue(raw, ["review_dependency", "レビュー依存度"]),
      reviewCount: firstRawValue(raw, ["review_count", "レビュー数"]),
      salesAgeDays: firstRawValue(raw, ["sales_age_days", "販売日数"]),
      productYears: firstRawValue(raw, ["product_years", "販売年数"]),
      categoryRank,
    });
  }

  const PREMIUM_TEMPLATE_FIELDS = [
    "premium_template_gate", "premium_template_strength", "premium_template_reason", "premium_need_fit",
  ];

  // Independent of premium score/rank. Keep rules and reasons aligned with premium.py.
  function calculatePremiumTemplate(input = {}) {
    const number = finiteNumber(input.categoryRank);
    const rank = number !== null && number > 0 ? number : null;
    const successor = normalizeSuccessorStatus(input.successorStatus);
    const need = normalizeNeedType(input.needType);
    const needLimit = { minus_to_zero: 7000, zero_to_plus: 5000 }[need];
    const fit = rank === null ? "UNKNOWN" : need === "neutral" ? "NEUTRAL"
      : needLimit == null ? "UNKNOWN" : rank <= needLimit ? "FIT" : "OUT";
    let gate = "UNKNOWN", strength = "UNKNOWN", reason;
    if (rank === null) {
      reason = "ランキング不明のため未判定";
    } else if (successor === "none" || successor === "major_change") {
      const limit = successor === "none" ? 10000 : 5000;
      const label = successor === "none" ? "後継品なし" : "後継品大幅変更";
      if (rank <= limit) {
        gate = "MATCH";
        strength = rank <= 3000 ? "STRONG" : "MATCH";
        reason = `${label}・${strength === "STRONG" ? 3000 : limit}位以内`;
      } else {
        gate = strength = "OUT";
        reason = `${label}・${limit}位超`;
      }
    } else if (successor === "similar") {
      if (rank <= 999 && normalizeLevel(input.reviewDependency) === "high") {
        gate = "MATCH";
        strength = "EXCEPTION";
        reason = "後継品ほぼ同じ・999位以内・レビュー依存度高の例外";
      } else {
        gate = strength = "OUT";
        reason = "後継品ほぼ同じ・例外条件に非該当";
      }
    } else if (rank > 10000) {
      gate = strength = "OUT";
      reason = "後継品不明・10000位超";
    } else {
      reason = "後継品不明のため未判定";
    }
    if (gate === "MATCH" && fit === "OUT") {
      gate = strength = "OUT";
      reason += `／必要性条件の${needLimit}位超で非該当`;
    } else if (gate === "MATCH" && fit === "UNKNOWN") {
      reason += "／必要性は未判定";
    }
    return { premium_template_gate: gate, premium_template_strength: strength,
      premium_template_reason: reason, premium_need_fit: fit };
  }

  // Preserve explicit fields, including UNKNOWN and blank values, during restore.
  function premiumTemplateForRow(row, explicit = row) {
    const result = calculatePremiumTemplate(row);
    const aliases = ["元note判定", "元note強度", "元note理由", "必要性適合"];
    PREMIUM_TEMPLATE_FIELDS.forEach((key, index) => {
      const source = [key, aliases[index]].find((name) => Object.prototype.hasOwnProperty.call(explicit, name));
      if (source !== undefined) result[key] = String(explicit[source] ?? "").trim();
    });
    return result;
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
      const categoryRank = ((raw.category_rank || "").trim() || (raw.sales_rank || "").trim());
      const premium = premiumPotentialFromRaw(raw, categoryRank);
      rows.push({
        asin,
        jan,
        currentPriceYen: (raw.current_price_yen || "").trim(),
        categoryRank,
        grade: (raw.grade || "").trim().toUpperCase(),
        title: (raw.title || "").trim(),
        category,
        procurementCategory: procurement,
        recommendedStores: recommendedStores(procurement, explicitStores),
        amazonStatus,
        ...premium,
        ...premiumTemplateForRow({ ...premium, categoryRank }, raw),
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

  function favoriteKey(row) {
    const asin = String((row || {}).asin || "").trim().toUpperCase();
    if (asin) return `asin:${asin}`;
    const jan = String((row || {}).jan || "").trim();
    if (jan) return `jan:${jan}`;
    const fileName = String((row || {}).fileName || "").trim();
    const line = String((row || {}).line || "").trim();
    return `row:${fileName}:${line}`;
  }

  function normalizeMemo(value, maxLength = 50) {
    const limit = Number.isInteger(maxLength) && maxLength > 0 ? maxLength : 50;
    return String(value == null ? "" : value).slice(0, limit);
  }

  function csvCell(value) {
    const text = Array.isArray(value) ? value.join("｜") : String(value == null ? "" : value);
    const escaped = text.replace(/"/g, '""');
    return /[",\r\n]/.test(text) ? `"${escaped}"` : escaped;
  }

  function favoriteExportCsv(rows) {
    const headers = [
      "お気に入りジャンル", "仕入れカテゴリー", "Amazonカテゴリー", "商品名",
      "ASIN", "JAN", "メモ", "Amazon本体", "現在価格", "ランキング",
      "判定ランク", "プレミア期待度", "プレミアスコア", "プレミア注意",
      "Keepa URL", "モノトレーサーURL", "仕入れ店舗候補",
      "元note判定", "元note強度", "元note理由", "必要性適合",
    ];
    const body = (rows || []).map((row) => [
      row.category || "未分類",
      row.procurementCategory || "未分類",
      row.category || "未分類",
      row.title || "",
      row.asin || "",
      row.jan || "",
      normalizeMemo(row.favoriteMemo || "", 50),
      row.amazonStatus === "absent" ? "Amazon不在" : row.amazonStatus === "present" ? "Amazonあり" : "不明",
      row.currentPriceYen || "",
      row.categoryRank || "",
      row.grade || "",
      row.premiumRank || "未判定",
      row.premiumScore == null ? "" : row.premiumScore,
      row.premiumNote || "",
      row.keepaUrl || "",
      row.monotracerUrl || "",
      Array.isArray(row.recommendedStores) ? row.recommendedStores : [],
      ...PREMIUM_TEMPLATE_FIELDS.map((key) => premiumTemplateForRow(row)[key]),
    ]);
    return "\uFEFF" + [headers, ...body].map((line) => line.map(csvCell).join(",")).join("\r\n") + "\r\n";
  }

  function withoutFile(files, fileId) {
    return files.filter((file) => file.id !== fileId);
  }

  return { PREMIUM_TEMPLATE_FIELDS, calculatePremiumTemplate, premiumTemplateForRow, CsvError, parseCsv, normalizeCsv, duplicateCounts, categoryCounts, filterRows, filterByCategory, procurementCategory, recommendedStores, amazonStatusCounts, calculatePremiumPotential, premiumPotentialFromRaw, favoriteKey, normalizeMemo, favoriteExportCsv, withoutFile };
});
