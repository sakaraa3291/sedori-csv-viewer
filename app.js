(function () {
  "use strict";
  const input = document.querySelector("#csv-files");
  const summary = document.querySelector("#summary");
  const errors = document.querySelector("#errors");
  const cards = document.querySelector("#cards");

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
    const duplicates = MobileCsv.duplicateCounts(rows);
    summary.textContent = `${files.join("、")}｜総取込 ${rows.length.toLocaleString("ja-JP")}行`;
    const fragment = document.createDocumentFragment();
    rows.forEach((row) => {
      const card = element("article", "card");
      const media = element("div", "media");
      if (row.imageUrl) {
        const img = element("img"); img.src = row.imageUrl; img.alt = row.title || row.asin || "商品画像"; img.loading = "lazy";
        img.addEventListener("error", () => img.replaceWith(element("div", "placeholder", "画像なし")));
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

  input.addEventListener("change", async () => {
    const files = Array.from(input.files || []);
    input.disabled = true;
    errors.replaceChildren(); summary.textContent = "読み込み中…"; cards.replaceChildren();
    const allRows = [], names = [];
    for (const file of files) {
      names.push(file.name);
      try {
        for (const row of MobileCsv.normalizeCsv(await readFile(file), file.name)) allRows.push(row);
      }
      catch (error) {
        errors.append(element("li", "", error.fileName ? error.message
          : `${file.name}・論理行1（読込開始）: ${error.message || "CSV読込エラー"}`));
      }
    }
    render(allRows, names);
    input.disabled = false;
  });
})();
