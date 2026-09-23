"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeCsv, duplicateCounts, withoutFile } = require("./csv-core.js");

test("multiple CSV rows combine and duplicate ASINs stay present", () => {
  const first = normalizeCsv("asin,current_price_yen\nA1,1000\nA1,1200\n", "p01.csv");
  const second = normalizeCsv("asin,current_price_yen\nA1,1300\nB2,2000\n", "p02.csv");
  const rows = [...first, ...second];
  assert.equal(rows.length, 4);
  assert.equal(duplicateCounts(rows).get("A1"), 3);
});

test("RFC4180 quotes preserve commas, quotes, and embedded newlines", () => {
  const [row] = normalizeCsv('asin,title,current_price_yen\r\nX,"商品, \"\"特価\"\"\r\n二行目",3000\r\n', "quoted.csv");
  assert.equal(row.title, '商品, "特価"\r\n二行目');
  assert.equal(row.line, 2);
});

test("category rank falls back to sales_rank", () => {
  const [row] = normalizeCsv("asin,category_rank,sales_rank\nX,,12476\n", "rank.csv");
  assert.equal(row.categoryRank, "12476");
});

test("JAN code is normalized from current and common header aliases", () => {
  const [a] = normalizeCsv("asin,jan\nA,4901234567894\n", "jan.csv");
  const [b] = normalizeCsv("ASIN,JANコード\nB,0123456789012\n", "jan-ja.csv");
  assert.equal(a.jan, "4901234567894");
  assert.equal(b.jan, "0123456789012");
  assert.equal(b.asin, "B");
});

test("Keepa URL is generated from ASIN and valid supplied URL wins", () => {
  const [generated] = normalizeCsv("asin\nB000000001\n", "a.csv");
  const [supplied] = normalizeCsv("asin,keepa_url\nB000000002,https://keepa.com/custom\n", "b.csv");
  assert.equal(generated.keepaUrl, "https://keepa.com/#!product/5-B000000001");
  assert.equal(supplied.keepaUrl, "https://keepa.com/custom");
});

test("MonoTracer URL is generated only for a valid ASIN", () => {
  const [valid] = normalizeCsv("asin\nB000000001\n", "mono.csv");
  const [invalid] = normalizeCsv("asin\nBAD\n", "mono-invalid.csv");
  assert.equal(valid.monotracerUrl, "https://www.mono-tracer.com/#/product/B000000001");
  assert.equal(invalid.monotracerUrl, "");
});

test("missing image stays blank", () => {
  const [row] = normalizeCsv("asin,image_url\nX,\n", "empty.csv");
  assert.equal(row.imageUrl, "");
});

test("UTF-8 BOM and logical row numbers survive embedded newlines", () => {
  const rows = normalizeCsv('\uFEFFasin,title\r\nA,"one\r\ntwo"\r\nB,last\r\n', "bom.csv");
  assert.deepEqual(rows.map(row => row.line), [2, 3]);
  assert.equal(rows[0].asin, "A");
});

test("blank records and every grade remain, without a row cap", () => {
  assert.equal(normalizeCsv("asin\n\n", "blank.csv").length, 1);
  assert.equal(normalizeCsv("asin,grade\n,\n", "blank.csv").length, 1);
  const rows = normalizeCsv("asin,grade\n" + Array.from({length: 120}, (_, i) =>
    `A,${["S", "A", "B", "C", "D"][i % 5]}\n`).join(""), "all.csv");
  assert.equal(rows.length, 120);
  assert.equal(duplicateCounts(rows).get("A"), 120);
});

test("syntax and column errors identify file and logical record", () => {
  for (const tail of ['B,"open', 'B,"closed"x', 'B,b"ad', 'B,too,many']) {
    assert.throws(() => normalizeCsv('asin,title\nA,"one\ntwo"\n' + tail, "broken.csv"),
      error => error.line === 3 && error.fileName === "broken.csv"
        && error.message.includes("broken.csv・論理行3"));
  }
});

test("rank prefers category, including zero, and whitespace falls back", () => {
  const rows = normalizeCsv("asin,category_rank,sales_rank\nA,12,99\nB, ,99\nC,0,99", "rank.csv");
  assert.deepEqual(rows.map(row => row.categoryRank), ["12", "99", "0"]);
});

test("image URL passes through and product-page or executable links cannot become Keepa buttons", () => {
  const [row] = normalizeCsv("asin,image_url,keepa_url\nA,https://example.com/image.jpg,https://amazon.co.jp/dp/A", "image.csv");
  assert.equal(row.imageUrl, "https://example.com/image.jpg");
  assert.equal(row.keepaUrl, "https://keepa.com/#!product/5-A");
  const [unsafe] = normalizeCsv("asin,image_url,keepa_url\nA,javascript:alert(1),javascript:alert(1)", "unsafe.csv");
  assert.equal(unsafe.imageUrl, "");
  assert.equal(unsafe.keepaUrl, "https://keepa.com/#!product/5-A");
});

test("empty files and header-only files import zero rows", () => {
  assert.equal(normalizeCsv("", "empty.csv").length, 0);
  assert.equal(normalizeCsv("asin,title\r\n", "header.csv").length, 0);
});

test("one selected file can be removed without changing rows from other files", () => {
  const files = [
    { id: "first", rows: normalizeCsv("asin\nA1\nA1\n", "first.csv") },
    { id: "second", rows: normalizeCsv("asin\nA1\nB2\n", "second.csv") },
  ];
  const remaining = withoutFile(files, "first");
  assert.deepEqual(remaining[0].rows.map((row) => row.asin), ["A1", "B2"]);
  assert.equal(files[0].rows.length + files[1].rows.length, 4);
});


test("missing image_url falls back to legacy Amazon image URL for a valid ASIN", () => {
  const [row] = normalizeCsv("asin,image_url\nB0H3Z6V7WM,\n", "old.csv");
  assert.equal(row.imageUrl, "https://images-na.ssl-images-amazon.com/images/P/B0H3Z6V7WM.09.LZZZZZZZ.jpg");
  const [invalid] = normalizeCsv("asin,image_url\nBAD,\n", "old.csv");
  assert.equal(invalid.imageUrl, "");
});

test("category aliases normalize and missing values become 未分類", () => {
  const rows = normalizeCsv("asin,category,カテゴリー,カテゴリ,product_group\nA,Beauty,,,\nB,,家電,,\nC,,,食品,\nD,,,,Toy\nE,,,,\n", "category.csv");
  assert.deepEqual(rows.map(row => row.category), ["Beauty", "家電", "食品", "Toy", "未分類"]);
});

test("category counts and filtering keep all rows intact", () => {
  const rows = normalizeCsv("asin,category\nA,家電\nB,食品\nC,家電\nD,\n", "category.csv");
  assert.deepEqual(MobileCsv.categoryCounts(rows), [
    { category: "家電", count: 2 },
    { category: "食品", count: 1 },
    { category: "未分類", count: 1 },
  ]);
  assert.deepEqual(MobileCsv.filterByCategory(rows, "家電").map(row => row.asin), ["A", "C"]);
  assert.equal(MobileCsv.filterByCategory(rows, "__ALL__").length, 4);
  assert.equal(rows.length, 4);
});

test("Amazon categories map to sourcing-friendly broad categories", () => {
  const cases = [
    ["Electronics", "家電"], ["Beauty", "美容"], ["Health and Beauty", "ドラッグストア"],
    ["Grocery", "食品"], ["Kitchen", "日用品"], ["Home Improvement", "DIY・工具"],
    ["Toys", "ホビー"], ["Baby Product", "ベビー"], ["Pet Products", "ペット"],
    ["Sports", "スポーツ"], ["Apparel", "ファッション"], ["Automotive", "自動車"],
    ["Video Games", "メディア・ゲーム"], ["Something Unknown", "その他"], ["", "未分類"],
  ];
  for (const [input, expected] of cases) assert.equal(MobileCsv.procurementCategory(input), expected, input);
});

test("explicit sourcing category overrides automatic mapping", () => {
  const [row] = normalizeCsv("asin,category,仕入れカテゴリー\nA,Electronics,重点家電\n", "override.csv");
  assert.equal(row.category, "Electronics");
  assert.equal(row.procurementCategory, "重点家電");
});

test("combined sourcing and Amazon category filters work together", () => {
  const rows = normalizeCsv("asin,category\nA,Electronics\nB,Beauty\nC,Camera\nD,Grocery\n", "filters.csv");
  assert.deepEqual(MobileCsv.filterRows(rows, "家電", "__ALL__").map(row => row.asin), ["A", "C"]);
  assert.deepEqual(MobileCsv.filterRows(rows, "家電", "Camera").map(row => row.asin), ["C"]);
  assert.deepEqual(MobileCsv.categoryCounts(rows, "procurementCategory"), [
    { category: "家電", count: 2 }, { category: "美容", count: 1 }, { category: "食品", count: 1 },
  ]);
});

test("sourcing categories provide deterministic store candidates", () => {
  assert.deepEqual(MobileCsv.recommendedStores("家電"), [
    "ヤマダデンキ", "エディオン", "ケーズデンキ", "ジョーシン", "ドン・キホーテ",
  ]);
  assert.deepEqual(MobileCsv.recommendedStores("DIY・工具"), [
    "コーナン", "DCM", "コメリ", "カインズ", "ナフコ",
  ]);
  assert.deepEqual(MobileCsv.recommendedStores("不明カテゴリー"), [
    "ドン・キホーテ", "トライアル", "ホームセンター", "ドラッグストア", "家電量販店",
  ]);
});

test("CSV can explicitly override recommended store candidates", () => {
  const [row] = normalizeCsv(
    "asin,category,推奨仕入れ店舗\nA,Electronics,店舗A｜店舗B、店舗C\n", "stores.csv");
  assert.deepEqual(row.recommendedStores, ["店舗A", "店舗B", "店舗C"]);
});

test("normalized rows receive store candidates from sourcing category", () => {
  const rows = normalizeCsv("asin,category\nA,Beauty\nB,Grocery\n", "stores.csv");
  assert.equal(rows[0].procurementCategory, "美容");
  assert.ok(rows[0].recommendedStores.includes("スギ薬局"));
  assert.equal(rows[1].procurementCategory, "食品");
  assert.ok(rows[1].recommendedStores.includes("トライアル"));
});

test("Japanese Amazon root categories map to sourcing groups", () => {
  const cases = [
    ["家電＆カメラ", "家電"], ["ドラッグストア", "ドラッグストア"], ["ビューティー", "美容"],
    ["ホーム＆キッチン", "日用品"], ["DIY・工具・ガーデン", "DIY・工具"],
    ["おもちゃ", "ホビー"], ["楽器", "ホビー"], ["ファッション", "ファッション"],
    ["車＆バイク", "自動車"], ["本", "メディア・ゲーム"],
  ];
  for (const [input, expected] of cases) assert.equal(MobileCsv.procurementCategory(input), expected, input);
});

test("observed Japanese media and hobby roots map correctly", () => {
  assert.equal(MobileCsv.procurementCategory("洋書"), "メディア・ゲーム");
  assert.equal(MobileCsv.procurementCategory("ミュージック"), "メディア・ゲーム");
  assert.equal(MobileCsv.procurementCategory("PCソフト"), "メディア・ゲーム");
  assert.equal(MobileCsv.procurementCategory("手芸・画材"), "ホビー");
  assert.equal(MobileCsv.procurementCategory("Amazonデバイス・アクセサリ"), "家電");
});

test("Amazon presence fields normalize to absent present and unknown", () => {
  const rows = normalizeCsv(
    "asin,amazon_present,amazon_absent,Amazon状態\n" +
    "A,False,,\nB,True,,\nC,,1,\nD,,0,\nE,,,不在\nF,,,あり\nG,,,\n", "amazon.csv");
  assert.deepEqual(rows.map(row => row.amazonStatus), [
    "absent", "present", "absent", "present", "absent", "present", "unknown",
  ]);
});

test("Amazon status filter and counts work with category filters", () => {
  const rows = normalizeCsv(
    "asin,category,amazon_present\nA,Electronics,False\nB,Electronics,True\nC,Beauty,False\nD,Beauty,\n", "amazon.csv");
  assert.deepEqual(MobileCsv.amazonStatusCounts(rows), { absent: 2, present: 1, unknown: 1 });
  assert.deepEqual(MobileCsv.filterRows(rows, "家電", "__ALL__", "absent").map(row => row.asin), ["A"]);
  assert.deepEqual(MobileCsv.filterRows(rows, "__ALL__", "__ALL__", "present").map(row => row.asin), ["B"]);
  assert.deepEqual(MobileCsv.filterRows(rows, "__ALL__", "Beauty", "unknown").map(row => row.asin), ["D"]);
});

test("favorite key prefers ASIN then JAN and is stable across duplicate rows", () => {
  assert.equal(MobileCsv.favoriteKey({ asin: "b0abc12345", jan: "4900000000000", fileName: "a.csv", line: 2 }), "asin:B0ABC12345");
  assert.equal(MobileCsv.favoriteKey({ asin: "", jan: "4900000000000", fileName: "a.csv", line: 2 }), "jan:4900000000000");
  assert.equal(MobileCsv.favoriteKey({ asin: "", jan: "", fileName: "a.csv", line: 7 }), "row:a.csv:7");
  assert.equal(MobileCsv.favoriteKey({ asin: "B0ABC12345", fileName: "p01.csv", line: 2 }),
    MobileCsv.favoriteKey({ asin: "B0ABC12345", fileName: "p09.csv", line: 99 }));
});

test("favorite memo is capped at 50 characters without trimming content", () => {
  const source = "あ".repeat(55);
  assert.equal(MobileCsv.normalizeMemo(source).length, 50);
  assert.equal(MobileCsv.normalizeMemo("  店舗在庫を確認  "), "  店舗在庫を確認  ");
});

test("favorite export CSV contains all requested fields and escapes text", () => {
  const csv = MobileCsv.favoriteExportCsv([{
    category: "おもちゃ", procurementCategory: "ホビー", title: '商品,"特価"', asin: "B000000001",
    jan: "4900000000000", favoriteMemo: "ワゴン,棚を確認", amazonStatus: "absent",
    currentPriceYen: "1980", categoryRank: "71", grade: "A",
    keepaUrl: "https://keepa.com/#!product/5-B000000001",
    monotracerUrl: "https://www.mono-tracer.com/#/product/B000000001",
    recommendedStores: ["ジョーシン", "ドン・キホーテ"],
  }]);
  assert.ok(csv.startsWith("\uFEFFお気に入りジャンル,仕入れカテゴリー,Amazonカテゴリー"));
  assert.ok(csv.includes('おもちゃ,ホビー,おもちゃ,"商品,""特価""",B000000001,4900000000000,"ワゴン,棚を確認",Amazon不在,1980,71,A'));
  assert.ok(csv.includes("ジョーシン｜ドン・キホーテ"));
});

test("favorite export CSV caps memo at 50 characters", () => {
  const csv = MobileCsv.favoriteExportCsv([{ category: "ドラッグストア", favoriteMemo: "あ".repeat(55) }]);
  assert.ok(csv.includes("あ".repeat(50)));
  assert.ok(!csv.includes("あ".repeat(51)));
});

test("premium score boundaries map to S A B and C", () => {
  const calculate = MobileCsv.calculatePremiumPotential;
  assert.equal(calculate({ explicitScore: 80 }).premiumRank, "S");
  assert.equal(calculate({ explicitScore: 79 }).premiumRank, "A");
  assert.equal(calculate({ explicitScore: 65 }).premiumRank, "A");
  assert.equal(calculate({ explicitScore: 64 }).premiumRank, "B");
  assert.equal(calculate({ explicitScore: 50 }).premiumRank, "B");
  assert.equal(calculate({ explicitScore: 49 }).premiumRank, "C");
});

test("explicit premium score is clamped and valid explicit rank wins", () => {
  const high = MobileCsv.calculatePremiumPotential({ explicitScore: 120 });
  const low = MobileCsv.calculatePremiumPotential({ explicitScore: -5 });
  const ranked = MobileCsv.calculatePremiumPotential({ explicitScore: 100, explicitRank: "b" });
  const invalidRank = MobileCsv.calculatePremiumPotential({ explicitScore: 80, explicitRank: "D" });
  assert.deepEqual([high.premiumScore, high.premiumRank], [100, "S"]);
  assert.deepEqual([low.premiumScore, low.premiumRank], [0, "C"]);
  assert.equal(ranked.premiumRank, "B");
  assert.equal(invalidRank.premiumRank, "S");
});

test("rank caps apply after an explicit premium rank", () => {
  const result = MobileCsv.calculatePremiumPotential({
    explicitRank: "S", successorStatus: "major_change", categoryRank: 5001,
  });
  assert.equal(result.premiumRank, "C");
  assert.match(result.premiumNote, /C上限/);
});

test("none with a category rank over 10000 is capped at C", () => {
  const result = MobileCsv.calculatePremiumPotential({
    explicitScore: 100, successorStatus: "none", categoryRank: 10001,
  });
  assert.equal(result.premiumRank, "C");
  assert.match(result.premiumNote, /C上限/);
});

test("similar is capped except for three-digit rank with high review dependency", () => {
  const capped = MobileCsv.calculatePremiumPotential({
    explicitScore: 100, successorStatus: "similar", categoryRank: 1000, reviewDependency: "high",
  });
  const exception = MobileCsv.calculatePremiumPotential({
    explicitScore: 100, successorStatus: "ほぼ同じ", categoryRank: 999, reviewDependency: "高",
  });
  assert.equal(capped.premiumRank, "C");
  assert.equal(exception.premiumRank, "S");
  assert.equal(exception.premiumNote, "");
});

test("premium potential stays unjudged when only ranking and review metrics exist", () => {
  const [row] = normalizeCsv(
    "asin,category_rank,review_count,sales_age_days\nA,1,1000,10\n", "insufficient.csv");
  assert.equal(row.premiumRank, "");
  assert.equal(row.premiumScore, null);
});

test("Japanese premium aliases normalize and a complete profile scores 100", () => {
  const [row] = normalizeCsv(
    "asin,後継品状態,唯一無二,必要性タイプ,使用者依存度,レビュー依存度,レビュー数,販売日数,販売年数,category_rank\n" +
    "A,後継品なし,高,マイナスからゼロ,高,高,365,365,5,3000\n", "premium-ja.csv");
  assert.equal(row.premiumScore, 100);
  assert.equal(row.premiumRank, "S");
  assert.equal(row.successorStatus, "none");
});

test("favorite export adds premium rank score and note columns", () => {
  const csv = MobileCsv.favoriteExportCsv([{
    category: "美容", premiumRank: "C", premiumScore: 88, premiumNote: "後継品がほぼ同じためC上限",
  }]);
  const [header, body] = csv.replace(/^\uFEFF/, "").trim().split("\r\n");
  assert.ok(header.includes("判定ランク,プレミア期待度,プレミアスコア,プレミア注意,Keepa URL"));
  assert.ok(body.includes(",C,88,後継品がほぼ同じためC上限,"));
});
