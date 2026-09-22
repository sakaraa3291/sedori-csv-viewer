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

test("Keepa URL is generated from ASIN and valid supplied URL wins", () => {
  const [generated] = normalizeCsv("asin\nB000000001\n", "a.csv");
  const [supplied] = normalizeCsv("asin,keepa_url\nB000000002,https://keepa.com/custom\n", "b.csv");
  assert.equal(generated.keepaUrl, "https://keepa.com/#!product/5-B000000001");
  assert.equal(supplied.keepaUrl, "https://keepa.com/custom");
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
