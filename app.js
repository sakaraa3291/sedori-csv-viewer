(function () {
  "use strict";
  const input = document.querySelector("#csv-files");
  const summary = document.querySelector("#summary");
  const errors = document.querySelector("#errors");
  const cards = document.querySelector("#cards");
  const fileControls = document.querySelector("#file-controls");
  const fileToggle = document.querySelector("#file-toggle");
  const fileToggleLabel = document.querySelector("#file-toggle-label");
  const filePanel = document.querySelector("#file-panel");
  const selectedFiles = document.querySelector("#selected-files");
  const clearAll = document.querySelector("#clear-all");
  const categoryControls = document.querySelector("#category-controls");
  const procurementFilter = document.querySelector("#procurement-filter");
  const categoryFilter = document.querySelector("#category-filter");
  let loadedFiles = [];
  let persistTimer = null;
  let restoreComplete = false;
  let filesExpanded = false;
  const DB_NAME = "sedori-csv-card";
  const DB_STORE = "state";
  const DB_KEY = "current-session";
  const VIEW_KEY = "sedori-csv-card-view";

  function openStateDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(DB_STORE)) request.result.createObjectStore(DB_STORE);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("保存領域を開けません"));
    });
  }

  async function readPersistedFiles() {
    const db = await openStateDb();
    try {
      return await new Promise((resolve, reject) => {
        const request = db.transaction(DB_STORE, "readonly").objectStore(DB_STORE).get(DB_KEY);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error || new Error("保存データを読めません"));
      });
    } finally { db.close(); }
  }

  async function writePersistedFiles() {
    const db = await openStateDb();
    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction(DB_STORE, "readwrite");
        tx.objectStore(DB_STORE).put({ loadedFiles, savedAt: Date.now() }, DB_KEY);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error || new Error("保存に失敗しました"));
      });
    } finally { db.close(); }
  }

  async function deletePersistedFiles() {
    const db = await openStateDb();
    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction(DB_STORE, "readwrite");
        tx.objectStore(DB_STORE).delete(DB_KEY);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error || new Error("保存データを削除できません"));
      });
    } finally { db.close(); }
  }

  function readViewState() {
    try {
      const value = JSON.parse(localStorage.getItem(VIEW_KEY) || "null");
      return value && typeof value === "object" ? value : {};
    } catch (_) { return {}; }
  }

  function writeViewState() {
    try {
      localStorage.setItem(VIEW_KEY, JSON.stringify({
        procurement: procurementFilter.value || "__ALL__",
        category: categoryFilter.value || "__ALL__",
        filesExpanded,
        scrollY: Math.max(0, Math.round(window.scrollY || 0)),
      }));
    } catch (_) { /* Safari private mode/storage failure: continue without view restore. */ }
  }

  function schedulePersist() {
    window.clearTimeout(persistTimer);
    persistTimer = window.setTimeout(() => {
      writeViewState();
      writePersistedFiles().catch(() => {});
    }, 120);
  }

  async function restorePersistedState() {
    const view = readViewState();
    filesExpanded = view.filesExpanded === true;
    try {
      const saved = await readPersistedFiles();
      if (saved && Array.isArray(saved.loadedFiles)) loadedFiles = saved.loadedFiles;
    } catch (_) { loadedFiles = []; }
    renderState();
    const rows = loadedFiles.flatMap((file) => file.rows);
    if (Array.from(procurementFilter.options).some((option) => option.value === view.procurement)) {
      procurementFilter.value = view.procurement;
    }
    if (Array.from(categoryFilter.options).some((option) => option.value === view.category)) {
      categoryFilter.value = view.category;
    }
    render(rows, loadedFiles);
    if (Number.isFinite(view.scrollY) && view.scrollY > 0) {
      requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo(0, view.scrollY)));
    }
  }

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

  async function copyText(value, button) {
    const text = String(value || "").trim();
    if (!text) return;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        const area = document.createElement("textarea");
        area.value = text;
        area.setAttribute("readonly", "");
        area.style.position = "fixed";
        area.style.opacity = "0";
        document.body.append(area);
        area.select();
        if (!document.execCommand("copy")) throw new Error("copy failed");
        area.remove();
      }
      const original = button.textContent;
      button.textContent = "コピー済み";
      button.classList.add("copied");
      window.setTimeout(() => {
        button.textContent = original;
        button.classList.remove("copied");
      }, 1200);
    } catch (_) {
      button.textContent = "コピー失敗";
      window.setTimeout(() => { button.textContent = "コピー"; }, 1200);
    }
  }

  function syncFilePanel() {
    const count = loadedFiles.length;
    fileToggleLabel.textContent = `選択中CSV ${count}件`;
    fileToggle.setAttribute("aria-expanded", String(filesExpanded));
    filePanel.hidden = !filesExpanded;
  }

  function render(rows, files) {
    cards.replaceChildren();
    const visibleRows = MobileCsv.filterRows(rows, procurementFilter.value, categoryFilter.value);
    const duplicates = MobileCsv.duplicateCounts(rows);
    const filtered = procurementFilter.value !== "__ALL__" || categoryFilter.value !== "__ALL__";
    summary.textContent = files.length
      ? `${files.length === 1 ? files[0].name : `${files.length}ファイル`}｜総取込 ${rows.length.toLocaleString("ja-JP")}行` +
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
      const codeRow = element("div", "code-row");
      if (row.jan) {
        codeRow.append(element("span", "jan", `JAN ${row.jan}`));
        const copyJan = element("button", "copy-jan", "コピー");
        copyJan.type = "button";
        copyJan.setAttribute("aria-label", `JANコード ${row.jan} をコピー`);
        copyJan.addEventListener("click", () => copyText(row.jan, copyJan));
        codeRow.append(copyJan);
      } else {
        codeRow.append(element("span", "jan jan-missing", "JAN 未取得"));
      }
      body.append(codeRow);
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
      const actions = element("div", "research-links");
      if (row.keepaUrl) {
        const link = element("a", "keepa", "Keepaで見る"); link.href = row.keepaUrl; link.target = "_blank"; link.rel = "noopener noreferrer"; actions.append(link);
      }
      if (row.monotracerUrl) {
        const link = element("a", "monotracer", "モノトレーサー"); link.href = row.monotracerUrl; link.target = "_blank"; link.rel = "noopener noreferrer"; actions.append(link);
      }
      if (actions.childNodes.length) body.append(actions);
      body.append(element("small", "source", `${row.fileName}・論理行${row.line}`));
      card.append(media, body); fragment.append(card);
    });
    cards.append(fragment);
  }

  function renderState() {
    const rows = loadedFiles.flatMap((file) => file.rows);
    selectedFiles.replaceChildren(); errors.replaceChildren();
    fileControls.hidden = loadedFiles.length === 0;
    if (!loadedFiles.length) filesExpanded = false;
    syncFilePanel();
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
        schedulePersist();
      });
      item.append(remove); selectedFiles.append(item);
      file.errors.forEach((message) => errors.append(element("li", "", message)));
    });
    render(rows, loadedFiles);
  }

  function reset() {
    loadedFiles = [];
    filesExpanded = false;
    input.value = "";
    renderState();
    try { localStorage.removeItem(VIEW_KEY); } catch (_) {}
    deletePersistedFiles().catch(() => {});
  }

  clearAll.addEventListener("click", reset);
  fileToggle.addEventListener("click", () => {
    filesExpanded = !filesExpanded;
    syncFilePanel();
    writeViewState();
  });
  [procurementFilter, categoryFilter].forEach((filter) => filter.addEventListener("change", () => {
    const rows = loadedFiles.flatMap((file) => file.rows);
    render(rows, loadedFiles);
    writeViewState();
  }));

  input.addEventListener("change", async () => {
    const files = Array.from(input.files || []);
    if (!files.length) return;
    input.disabled = true;
    loadedFiles = [];
    filesExpanded = false;
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
    await writePersistedFiles().catch(() => {});
    writeViewState();
    input.disabled = false;
  });

  let lastScrollSave = 0;
  window.addEventListener("scroll", () => {
    if (!restoreComplete) return;
    const now = Date.now();
    if (now - lastScrollSave >= 250) {
      lastScrollSave = now;
      writeViewState();
    }
  }, { passive: true });
  window.addEventListener("pagehide", () => {
    writeViewState();
    writePersistedFiles().catch(() => {});
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      writeViewState();
      writePersistedFiles().catch(() => {});
    }
  });

  summary.textContent = "前回の表示を復元中…";
  restorePersistedState().catch(() => renderState()).finally(() => { restoreComplete = true; });
})();
