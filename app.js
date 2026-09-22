(function () {
  "use strict";
  const input = document.querySelector("#csv-files");
  const summary = document.querySelector("#summary");
  const errors = document.querySelector("#errors");
  const cards = document.querySelector("#cards");
  const fileControls = document.querySelector("#file-controls");
  const selectedFiles = document.querySelector("#selected-files");
  const clearAll = document.querySelector("#clear-all");
  const categoryControls = document.querySelector("#category-controls");
  const procurementFilter = document.querySelector("#procurement-filter");
  const categoryFilter = document.querySelector("#category-filter");
  let loadedFiles = [];

  function readFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("ファイルを読み込めません"));
      reader.readAsText(file, "UTF-8");
    });
  }

  function numberText(value, suffix) {
    if (value === "") return "—";
    const number = Number(String(value).replace(/,/g, ""));
    return Number.isFinite(number) ? `${Math.trunc(number).toLocaleString("ja-JP")}${suffix}` : value;
  }

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function render(rows, files) {
    cards.replaceChildren();
    const visibleRows = MobileCsv.filterRows(rows, procurementFilter.value, categoryFilter.value);
    const duplicates = MobileCsv.duplicateCounts(rows);
    const filtered = procurementFilter.value !== "__ALL__" || categoryFilter.value !== "__ALL__";
    summary.textContent = files.length
      ? `${files.map((file) => file.name).join("、")}｜総取込 ${rows.length.toLocaleString("ja-JP")}行` +
        (filtered ? `｜表示 ${visibleRows.length.toLocaleString("ja-JP")}行` : "")
      : "CSVを選択してください";
    const fragment = document.createDocumentFragment();
    visibleRows.forEach((row) => {
      const card = element("article", "card");
      const media = element("div", "media");
      if (row.imageUrl) {
        const img = element("img"); img.src = row.imageUrl; img.alt = row.title || row.asin || "商品画像"; img.loading = "lazy";
        const noImage = () => img.replaceWith(element("div", "placeholder", "画像なし"));
        img.addEventListener("error", noImage);
        img.addEventListener("load", () => { if (img.naturalWidth <= 2 || img.naturalHeight <= 2) noImage(); });
        media.append(img);
      } else media.append(element("div", "placeholder", "画像なし"));
      const body = element("div", "body");
      const top = element("div", "topline");
      top.append(element("strong", `grade grade-${row.grade}`, row.grade || "—"));
      top.append(element("span", "asin", row.asin || "ASINなし"));
      const duplicate = duplicates.get(row.asin) || 0;
      if (duplicate > 1) top.append(element("small", "duplicate", `重複 ${duplicate}件`));
      body.append(top);
      if (row.title) body.append(element("div", "title", row.title));
      const badges = element("div", "category-badges");
      badges.append(element("div", "category-badge procurement-badge", row.procurementCategory || "未分類"));
      if (row.category && row.category !== "未分類") badges.append(element("div", "category-badge source-category", row.category));
      body.append(badges);
      if (row.recommendedStores && row.recommendedStores.length) {
        const stores = element("div", "store-candidates");
        stores.append(element("div", "store-label", "仕入れ店舗候補"));
        const chips = element("div", "store-chips");
        row.recommendedStores.forEach((store) => chips.append(element("span", "store-chip", store)));
        stores.append(chips); body.append(stores);
      }
      const facts = element("div", "facts");
      facts.append(element("div", "fact", `現在価格 ${numberText(row.currentPriceYen, "円")}`));
      facts.append(element("div", "fact", `ランキング ${numberText(row.categoryRank, "位")}`));
      body.append(facts);
      if (row.keepaUrl) {
        const link = element("a", "keepa", "Keepaで見る"); link.href = row.keepaUrl; link.target = "_blank"; link.rel = "noopener noreferrer"; body.append(link);
      }
      body.append(element("small", "source", `${row.fileName}・論理行${row.line}`));
      card.append(media, body); fragment.append(card);
    });
    cards.append(fragment);
  }

  function renderState() {
    const rows = loadedFiles.flatMap((file) => file.rows);
    selectedFiles.replaceChildren(); errors.replaceChildren();
    fileControls.hidden = loadedFiles.length === 0;
    const procurementCounts = MobileCsv.categoryCounts(rows, "procurementCategory");
    const categoryCounts = MobileCsv.categoryCounts(rows, "category");
    const currentProcurement = procurementFilter.value;
    const currentCategory = categoryFilter.value;
    procurementFilter.replaceChildren(); categoryFilter.replaceChildren();
    const allProcurement = element("option", "", `全カテゴリー（${rows.length}）`); allProcurement.value = "__ALL__"; procurementFilter.append(allProcurement);
    procurementCounts.forEach(({ category, count }) => {
      const option = element("option", "", `${category}（${count}）`); option.value = category; procurementFilter.append(option);
    });
    const allCategory = element("option", "", `全Amazonカテゴリー（${rows.length}）`); allCategory.value = "__ALL__"; categoryFilter.append(allCategory);
    categoryCounts.forEach(({ category, count }) => {
      const option = element("option", "", `${category}（${count}）`); option.value = category; categoryFilter.append(option);
    });
    const procurementValues = new Set(["__ALL__", ...procurementCounts.map((item) => item.category)]);
    const categoryValues = new Set(["__ALL__", ...categoryCounts.map((item) => item.category)]);
    procurementFilter.value = procurementValues.has(currentProcurement) ? currentProcurement : "__ALL__";
    categoryFilter.value = categoryValues.has(currentCategory) ? currentCategory : "__ALL__";
    categoryControls.hidden = rows.length === 0;
    loadedFiles.forEach((file) => {
      const item = element("li", "file-chip");
      item.append(element("span", "", file.name));
      const remove = element("button", "remove-file", "×");
      remove.type = "button";
      remove.setAttribute("aria-label", `${file.name}を取り消す`);
      remove.addEventListener("click", () => {
        loadedFiles = MobileCsv.withoutFile(loadedFiles, file.id);
        if (!loadedFiles.length) input.value = "";
        renderState();
      });
      item.append(remove); selectedFiles.append(item);
      file.errors.forEach((message) => errors.append(element("li", "", message)));
    });
    render(rows, loadedFiles);
  }

  function reset() {
    loadedFiles = [];
    input.value = "";
    renderState();
  }

  clearAll.addEventListener("click", reset);
  [procurementFilter, categoryFilter].forEach((filter) => filter.addEventListener("change", () => {
    const rows = loadedFiles.flatMap((file) => file.rows);
    render(rows, loadedFiles);
  }));

  input.addEventListener("change", async () => {
    const files = Array.from(input.files || []);
    if (!files.length) return;
    input.disabled = true;
    loadedFiles = [];
    errors.replaceChildren(); selectedFiles.replaceChildren(); fileControls.hidden = true;
    summary.textContent = "読み込み中…"; cards.replaceChildren();
    for (const [index, file] of files.entries()) {
      const id = `${Date.now()}-${index}`;
      const entry = { id, name: file.name, rows: [], errors: [] };
      try {
        entry.rows = MobileCsv.normalizeCsv(await readFile(file), file.name);
      }
      catch (error) {
        entry.errors.push(error.fileName ? error.message
          : `${file.name}・論理行1（読込開始）: ${error.message || "CSV読込エラー"}`);
      }
      loadedFiles.push(entry);
    }
    renderState();
    input.disabled = false;
  });
})();
