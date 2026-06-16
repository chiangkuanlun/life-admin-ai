const samples = {
  bill: `中華電信 2026年 6月電信帳單
本期應繳金額 NT$1,286
繳費期限 2026/07/05
服務項目：行動電話月租費、網路費、加值服務。
如逾期繳納，可能產生違約金或影響服務。`,
  insurance: `安心人壽 終身醫療保險 保單通知
保單號碼 A123456789
要保人 王小明
年繳保費 NT$24,800
下次繳費日 2026/08/15
保障內容包含住院日額、手術醫療、重大傷病附約。
請確認受益人資料與扣款帳戶是否仍有效。`,
  subsidy: `台北市青年租金補貼申請公告
申請期間：2026/06/20 至 2026/07/31
補助對象：設籍或就業於台北市，符合所得及租屋資格者。
應備文件：身分證明、租賃契約、所得證明、金融帳戶影本。
線上申請後需留意補件通知。`,
};

const categoryRules = [
  { category: "報稅", keywords: ["報稅", "所得稅", "扣繳", "租金", "醫療支出", "扶養"] },
  { category: "保險", keywords: ["保單", "保險", "保費", "受益人", "保障", "附約"] },
  { category: "信用卡", keywords: ["信用卡", "回饋", "登錄", "刷卡", "紅利", "哩程"] },
  { category: "訂閱", keywords: ["訂閱", "月費", "續訂", "方案", "自動扣款"] },
  { category: "帳單", keywords: ["帳單", "應繳", "繳費", "水費", "電費", "電信", "瓦斯"] },
  { category: "政府補助", keywords: ["補助", "申請", "資格", "應備文件", "政府", "市府"] },
  { category: "行程提醒", keywords: ["會議", "預約", "行程", "報到", "截止"] },
];

const storeKey = "life-admin-ai-history";
const state = { result: null, history: loadHistory() };

const els = {
  fileInput: document.querySelector("#fileInput"),
  fileStatus: document.querySelector("#fileStatus"),
  documentText: document.querySelector("#documentText"),
  analyzeButton: document.querySelector("#analyzeButton"),
  clearButton: document.querySelector("#clearButton"),
  resultTitle: document.querySelector("#resultTitle"),
  categoryOutput: document.querySelector("#categoryOutput"),
  issuerOutput: document.querySelector("#issuerOutput"),
  amountOutput: document.querySelector("#amountOutput"),
  dateOutput: document.querySelector("#dateOutput"),
  confidenceOutput: document.querySelector("#confidenceOutput"),
  confidenceMeter: document.querySelector("#confidenceMeter"),
  taskList: document.querySelector("#taskList"),
  summaryOutput: document.querySelector("#summaryOutput"),
  formOutput: document.querySelector("#formOutput"),
  traceOutput: document.querySelector("#traceOutput"),
  historyList: document.querySelector("#historyList"),
  statDocuments: document.querySelector("#statDocuments"),
  statTasks: document.querySelector("#statTasks"),
  statMissing: document.querySelector("#statMissing"),
  statConfidence: document.querySelector("#statConfidence"),
  copyDraftButton: document.querySelector("#copyDraftButton"),
  downloadJsonButton: document.querySelector("#downloadJsonButton"),
  toast: document.querySelector("#toast"),
};

function normalizeText(text) {
  return text.replace(/\s+/g, " ").trim();
}

function detectCategory(text) {
  const scores = categoryRules
    .map((rule) => ({
      category: rule.category,
      evidence: rule.keywords.filter((keyword) => text.includes(keyword)),
    }))
    .map((rule) => ({ ...rule, score: rule.evidence.length }))
    .sort((a, b) => b.score - a.score);

  return scores[0].score > 0
    ? { category: scores[0].category, evidence: scores[0].evidence.slice(0, 4) }
    : { category: "其他文件", evidence: [] };
}

function extractAmount(text) {
  const patterns = [
    /(?:NT\$|NTD)\s*([0-9]{1,3}(?:,[0-9]{3})+|[0-9]{2,7})/i,
    /(?:新台幣|金額|保費|應繳金額|月費|費用)[:：\s]*(?:NT\$|NTD)?\s*([0-9]{1,3}(?:,[0-9]{3})+|[0-9]{2,7})\s*(?:元)?/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return `NT$${match[1]}`;
  }
  return "未偵測";
}

function extractDate(text) {
  const patterns = [
    /(\d{4}[/-]\d{1,2}[/-]\d{1,2})\s*(?:至|-|~)\s*(\d{4}[/-]\d{1,2}[/-]\d{1,2})/i,
    /(?:繳費期限|下次繳費日|申請期間|截止日|期限|到期日)[:：\s]*(\d{4}[/-]\d{1,2}[/-]\d{1,2})/i,
    /(\d{4}[/-]\d{1,2}[/-]\d{1,2})/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[2] ? `${match[1]} 至 ${match[2]}` : match[1];
  }
  return "未偵測";
}

function extractIssuer(text) {
  const firstLine = text.split(/\n/).map((line) => line.trim()).find(Boolean);
  if (!firstLine) return "未偵測";
  const knownIssuers = ["中華電信", "台灣大哥大", "遠傳", "安心人壽", "國泰", "富邦", "台北市", "新北市", "財政部"];
  return knownIssuers.find((issuer) => firstLine.includes(issuer) || text.includes(issuer)) || firstLine.slice(0, 18);
}

function confidenceFor(result) {
  let score = 35;
  if (result.category !== "其他文件") score += 20;
  if (result.issuer !== "未偵測") score += 15;
  if (result.amount !== "未偵測") score += 15;
  if (result.date !== "未偵測") score += 15;
  return Math.min(score, 100);
}

function buildTasks(result) {
  const tasks = [];
  if (result.date !== "未偵測") {
    tasks.push({ title: `建立${result.category}提醒`, detail: `在 ${result.date} 前完成確認，避免漏繳、逾期或錯過申請。`, meta: "提醒", done: false });
  }
  if (result.amount !== "未偵測") {
    tasks.push({ title: "確認金額與付款方式", detail: `本文件偵測到 ${result.amount}，請核對帳戶、信用卡或轉帳資訊。`, meta: "金額", done: false });
  }
  if (result.category === "保險") {
    tasks.push({ title: "檢查保單基本資料", detail: "確認受益人、扣款帳戶、保障內容與附約是否仍符合目前需求。", meta: "保單", done: false });
  }
  if (result.category === "政府補助") {
    tasks.push({ title: "準備申請文件", detail: "整理身分證明、資格證明、契約、所得或金融帳戶資料，並追蹤補件通知。", meta: "補助", done: false });
  }
  return tasks.length ? tasks : [{ title: "補充文件資訊", detail: "目前缺少明確日期、金額或行政事項。請補上完整公告、帳單明細或保單通知。", meta: "待補", done: false }];
}

function suggestedUse(category) {
  return {
    報稅: "年度報稅資料整理與扣除額文件檢核",
    保險: "保單整理、繳費提醒與保障摘要",
    信用卡: "優惠登錄、到期日與消費條件提醒",
    訂閱: "週期扣款、取消期限與月費總覽",
    帳單: "繳費提醒、金額核對與逾期風險提示",
    政府補助: "資格檢查、申請期限與應備文件清單",
    行程提醒: "截止日、報到資訊與待辦提醒",
  }[category] || "個人行政文件摘要與待辦整理";
}

function analyzeDocument(text) {
  const cleanText = normalizeText(text);
  const detected = detectCategory(cleanText);
  const result = {
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    createdAt: new Date().toISOString(),
    category: detected.category,
    issuer: extractIssuer(text),
    amount: extractAmount(cleanText),
    date: extractDate(cleanText),
    sourcePreview: cleanText.slice(0, 120),
    categoryEvidence: detected.evidence,
  };

  result.missing = [
    result.amount === "未偵測" ? "金額" : null,
    result.date === "未偵測" ? "期限或日期" : null,
    result.issuer === "未偵測" ? "機構名稱" : null,
  ].filter(Boolean);
  result.confidence = confidenceFor(result);
  result.tasks = buildTasks(result);
  result.summary = [
    { title: "文件重點", detail: `這份資料被歸類為「${result.category}」，主要機構為「${result.issuer}」，偵測金額為「${result.amount}」。` },
    { title: "下一步", detail: result.date === "未偵測" ? "請補充明確期限，再建立提醒。" : `請在 ${result.date} 前完成核對、付款或申請動作。` },
    { title: "風險提醒", detail: "AI 僅做資訊整理輔助，正式申報、保險決策、補助資格與繳費結果仍需使用者自行確認。" },
  ];
  if (result.missing.length) result.summary.push({ title: "缺少資料", detail: `建議補充：${result.missing.join("、")}。` });
  result.formDraft = [
    ["文件分類", result.category],
    ["機構名稱", result.issuer],
    ["金額", result.amount],
    ["期限/日期", result.date],
    ["建議用途", suggestedUse(result.category)],
    ["資料保存", "不保存原始檔，僅保存使用者確認後的摘要與提醒"],
  ];
  result.trace = [
    ["分類依據", result.categoryEvidence.length ? `命中關鍵字：${result.categoryEvidence.join("、")}` : "依文件關鍵字與語意判斷"],
    ["金額來源", result.amount === "未偵測" ? "未在內容中找到明確金額" : `擷取到金額片段：${result.amount}`],
    ["日期來源", result.date === "未偵測" ? "未在內容中找到明確日期" : `擷取到日期片段：${result.date}`],
    ["原檔狀態", "Demo 版不保存原始檔，也不提供下載或再次開啟"],
  ];
  return result;
}

function renderResult(result) {
  state.result = result;
  els.resultTitle.textContent = `${result.category}整理結果`;
  els.categoryOutput.textContent = result.category;
  els.issuerOutput.textContent = result.issuer;
  els.amountOutput.textContent = result.amount;
  els.dateOutput.textContent = result.date;
  els.confidenceOutput.textContent = `${result.confidence}%`;
  els.confidenceMeter.style.width = `${result.confidence}%`;

  els.taskList.innerHTML = result.tasks.map((task, index) => `
    <article class="task-card ${task.done ? "is-done" : ""}">
      <label class="task-check">
        <input type="checkbox" data-task-index="${index}" ${task.done ? "checked" : ""} />
        <span></span>
      </label>
      <div>
        <h4>${escapeHtml(task.title)}</h4>
        <p>${escapeHtml(task.detail)}</p>
      </div>
      <span class="task-meta">${escapeHtml(task.meta)}</span>
    </article>`).join("");

  els.summaryOutput.innerHTML = result.summary.map((item) => `<article class="summary-item"><h4>${escapeHtml(item.title)}</h4><p>${escapeHtml(item.detail)}</p></article>`).join("");
  els.formOutput.innerHTML = result.formDraft.map(([label, value]) => `<div class="draft-row"><strong>${escapeHtml(label)}</strong><p>${escapeHtml(value)}</p></div>`).join("");
  els.traceOutput.innerHTML = result.trace.map(([label, value]) => `<article class="trace-item"><h4>${escapeHtml(label)}</h4><p>${escapeHtml(value)}</p></article>`).join("");
  updateStats();
}

function renderEmpty(message) {
  els.resultTitle.textContent = "需要更多資料";
  els.categoryOutput.textContent = "未完成";
  els.issuerOutput.textContent = "未偵測";
  els.amountOutput.textContent = "未偵測";
  els.dateOutput.textContent = "未偵測";
  els.confidenceOutput.textContent = "--";
  els.confidenceMeter.style.width = "0%";
  els.taskList.innerHTML = `<article class="task-card"><div><h4>請補充文件內容</h4><p>${escapeHtml(message)}</p></div><span class="task-meta">待補</span></article>`;
  els.summaryOutput.innerHTML = "";
  els.formOutput.innerHTML = "";
  els.traceOutput.innerHTML = "";
}

function renderHistory() {
  els.historyList.innerHTML = state.history.length
    ? state.history.map((item) => `
      <button class="history-item" type="button" data-history-id="${item.id}">
        <span>${escapeHtml(item.category)}</span>
        <strong>${escapeHtml(item.issuer)}</strong>
        <small>${escapeHtml(item.date)} · ${item.confidence}%</small>
      </button>`).join("")
    : `<p class="empty-history">尚無歷史紀錄。完成第一次解析後會顯示在這裡。</p>`;
}

function updateStats() {
  const active = state.result;
  els.statDocuments.textContent = String(state.history.length);
  els.statTasks.textContent = String(active ? active.tasks.length : 0);
  els.statMissing.textContent = String(active ? active.missing.length : 0);
  els.statConfidence.textContent = active ? `${active.confidence}%` : "--";
}

function addToHistory(result) {
  state.history = [result, ...state.history.filter((item) => item.id !== result.id)].slice(0, 8);
  localStorage.setItem(storeKey, JSON.stringify(state.history));
  renderHistory();
  updateStats();
}

function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem(storeKey) || "[]");
  } catch {
    return [];
  }
}

function copyDraft() {
  if (!state.result) return showToast("請先完成一次解析");
  const text = state.result.formDraft.map(([label, value]) => `${label}: ${value}`).join("\n");
  navigator.clipboard?.writeText(text).then(() => showToast("已複製表單草稿")).catch(() => showToast("瀏覽器不允許自動複製"));
}

function downloadJson() {
  if (!state.result) return showToast("請先完成一次解析");
  const blob = new Blob([JSON.stringify(state.result, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `life-admin-${state.result.category}-${Date.now()}.json`;
  link.click();
  URL.revokeObjectURL(url);
  showToast("已匯出 JSON");
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  window.setTimeout(() => els.toast.classList.remove("show"), 2200);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

document.querySelectorAll(".sample-button").forEach((button) => {
  button.addEventListener("click", () => {
    els.documentText.value = samples[button.dataset.sample] || "";
    els.documentText.focus();
  });
});

els.analyzeButton.addEventListener("click", () => {
  const text = els.documentText.value.trim();
  if (text.length < 12) return renderEmpty("請貼上完整帳單、保單、補助公告或行政通知文字，再執行 AI 整理。");
  const result = analyzeDocument(text);
  renderResult(result);
  addToHistory(result);
  showToast("文件已整理完成");
});

els.clearButton.addEventListener("click", () => {
  els.documentText.value = "";
  els.documentText.focus();
});

els.fileInput.addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) {
    els.fileStatus.textContent = "尚未選擇檔案";
    return;
  }
  if (file.type === "text/plain" || file.name.endsWith(".txt")) {
    els.documentText.value = await file.text();
    els.fileStatus.textContent = `已讀入：${file.name}。Demo 不保存原始檔。`;
  } else {
    els.fileStatus.textContent = `已選擇：${file.name}。PDF/圖片 OCR 將於後續版本接入。`;
  }
});

els.copyDraftButton.addEventListener("click", copyDraft);
els.downloadJsonButton.addEventListener("click", downloadJson);

els.taskList.addEventListener("change", (event) => {
  const input = event.target.closest("input[type='checkbox']");
  if (!input || !state.result) return;
  state.result.tasks[Number(input.dataset.taskIndex)].done = input.checked;
  renderResult(state.result);
});

els.historyList.addEventListener("click", (event) => {
  const item = event.target.closest("[data-history-id]");
  if (!item) return;
  const result = state.history.find((entry) => entry.id === item.dataset.historyId);
  if (result) renderResult(result);
});

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    const target = tab.dataset.tab;
    document.querySelectorAll(".tab").forEach((item) => {
      item.classList.toggle("active", item === tab);
      item.setAttribute("aria-selected", item === tab ? "true" : "false");
    });
    document.querySelectorAll(".tab-panel").forEach((panel) => {
      const active = panel.id === `${target}Panel`;
      panel.classList.toggle("active", active);
      panel.hidden = !active;
    });
  });
});

els.documentText.value = samples.bill;
const initialResult = analyzeDocument(samples.bill);
renderResult(initialResult);
renderHistory();
updateStats();
