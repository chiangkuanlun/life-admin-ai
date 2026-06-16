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

const usersKey = "life-admin-ai-users";
const sessionKey = "life-admin-ai-active-user";
const state = {
  result: null,
  history: [],
  user: loadActiveUser(),
  users: loadUsers(),
  llm: null,
};

const els = {
  fileInput: document.querySelector("#fileInput"),
  fileStatus: document.querySelector("#fileStatus"),
  documentText: document.querySelector("#documentText"),
  authNameInput: document.querySelector("#authNameInput"),
  authEmailInput: document.querySelector("#authEmailInput"),
  authPasswordInput: document.querySelector("#authPasswordInput"),
  registerButton: document.querySelector("#registerButton"),
  loginButton: document.querySelector("#loginButton"),
  logoutButton: document.querySelector("#logoutButton"),
  accountName: document.querySelector("#accountName"),
  accountMeta: document.querySelector("#accountMeta"),
  accountProvider: document.querySelector("#accountProvider"),
  accountStorage: document.querySelector("#accountStorage"),
  appShell: document.querySelector("#appShell"),
  llmEndpointInput: document.querySelector("#llmEndpointInput"),
  llmModelInput: document.querySelector("#llmModelInput"),
  llmKeyInput: document.querySelector("#llmKeyInput"),
  llmEnabledInput: document.querySelector("#llmEnabledInput"),
  saveLlmButton: document.querySelector("#saveLlmButton"),
  checkLlmButton: document.querySelector("#checkLlmButton"),
  llmStatus: document.querySelector("#llmStatus"),
  caseNameInput: document.querySelector("#caseNameInput"),
  reminderLeadInput: document.querySelector("#reminderLeadInput"),
  priorityInput: document.querySelector("#priorityInput"),
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
  archiveCaseButton: document.querySelector("#archiveCaseButton"),
  toast: document.querySelector("#toast"),
};

function loadUsers() {
  try {
    return JSON.parse(localStorage.getItem(usersKey) || "[]");
  } catch {
    return [];
  }
}

function saveUsers() {
  localStorage.setItem(usersKey, JSON.stringify(state.users));
}

function loadActiveUser() {
  try {
    return JSON.parse(localStorage.getItem(sessionKey) || "null");
  } catch {
    return null;
  }
}

function setActiveUser(user) {
  state.user = user;
  if (user) {
    localStorage.setItem(sessionKey, JSON.stringify(user));
    state.history = loadHistory();
    state.llm = loadLlmSettings();
  } else {
    localStorage.removeItem(sessionKey);
    state.history = [];
    state.result = null;
    state.llm = null;
  }
  renderAuthState();
  renderHistory();
  renderLlmSettings();
  updateStats();
}

function userScopedKey(suffix) {
  if (!state.user) return null;
  return `life-admin-ai:${state.user.id}:${suffix}`;
}

function createUser({ name, email, password, provider }) {
  const normalizedEmail = email.trim().toLowerCase();
  const existing = state.users.find((user) => user.email === normalizedEmail && user.provider === provider);
  if (existing) return existing;
  const user = {
    id: `${provider.toLowerCase()}-${normalizedEmail || Date.now()}`.replace(/[^a-z0-9@._-]/gi, "-"),
    name: name.trim() || provider,
    email: normalizedEmail,
    provider,
    password: password || "",
    createdAt: new Date().toISOString(),
  };
  state.users.push(user);
  saveUsers();
  return user;
}

function registerWithPlatform() {
  const name = els.authNameInput.value.trim();
  const email = els.authEmailInput.value.trim().toLowerCase();
  const password = els.authPasswordInput.value;
  if (!name || !email || password.length < 6) return showToast("請輸入姓名、Email 與至少 6 碼密碼");
  if (state.users.some((user) => user.email === email && user.provider === "平台帳號")) return showToast("此 Email 已建立平台帳號");
  const user = createUser({ name, email, password, provider: "平台帳號" });
  setActiveUser(safeUser(user));
  showToast("平台帳號已建立");
}

function loginWithPlatform() {
  const email = els.authEmailInput.value.trim().toLowerCase();
  const password = els.authPasswordInput.value;
  const user = state.users.find((item) => item.email === email && item.provider === "平台帳號" && item.password === password);
  if (!user) return showToast("帳號或密碼不正確");
  setActiveUser(safeUser(user));
  showToast("登入成功");
}

function loginWithProvider(provider) {
  const email = els.authEmailInput.value.trim().toLowerCase() || `${provider.toLowerCase()}@connected.local`;
  const name = els.authNameInput.value.trim() || `${provider} 使用者`;
  const user = createUser({ name, email, password: "", provider });
  setActiveUser(safeUser(user));
  showToast(`${provider} 身份已連結`);
}

function safeUser(user) {
  const { password, ...publicUser } = user;
  return publicUser;
}

function renderAuthState() {
  if (state.user) {
    els.accountName.textContent = state.user.name;
    els.accountMeta.textContent = `${state.user.email || "未提供 Email"} · ${state.user.id}`;
    els.accountProvider.textContent = state.user.provider;
    els.accountStorage.textContent = "資料區已啟用";
    els.appShell.classList.remove("is-locked");
    els.authNameInput.value = state.user.name;
    els.authEmailInput.value = state.user.email || "";
  } else {
    els.accountName.textContent = "尚未登入";
    els.accountMeta.textContent = "登入後才會保存案件、解析歷史與 LLM 設定。";
    els.accountProvider.textContent = "未連結";
    els.accountStorage.textContent = "資料未啟用";
    els.appShell.classList.add("is-locked");
  }
}

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
    tasks.push({ title: `建立${result.category}提醒`, detail: `在 ${result.date} 前完成確認，提醒時間設定為 ${result.reminderLead}。`, meta: result.priority, done: false });
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

function currentCaseSettings(text) {
  const fallbackName = text.split(/\n/).map((line) => line.trim()).find(Boolean)?.slice(0, 24) || "未命名案件";
  return {
    caseName: els.caseNameInput.value.trim() || fallbackName,
    reminderLead: els.reminderLeadInput.value,
    priority: els.priorityInput.value,
  };
}

function analyzeDocument(text) {
  const cleanText = normalizeText(text);
  const detected = detectCategory(cleanText);
  const settings = currentCaseSettings(text);
  const result = {
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    createdAt: new Date().toISOString(),
    status: "進行中",
    caseName: settings.caseName,
    reminderLead: settings.reminderLead,
    priority: settings.priority,
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
    ["提醒時間", result.reminderLead],
    ["優先級", result.priority],
    ["資料保存", "不保存原始檔，僅保存使用者確認後的摘要與提醒"],
  ];
  result.trace = [
    ["分類依據", result.categoryEvidence.length ? `命中關鍵字：${result.categoryEvidence.join("、")}` : "依文件關鍵字與語意判斷"],
    ["金額來源", result.amount === "未偵測" ? "未在內容中找到明確金額" : `擷取到金額片段：${result.amount}`],
    ["日期來源", result.date === "未偵測" ? "未在內容中找到明確日期" : `擷取到日期片段：${result.date}`],
    ["原檔狀態", "平台不保存原始檔，也不提供下載或再次開啟"],
  ];
  return result;
}

async function analyzeWithLlm(text, baseResult) {
  const settings = state.llm || loadLlmSettings();
  if (!settings.enabled) return baseResult;
  if (!settings.endpoint || !settings.model || !settings.apiKey) {
    showToast("LLM 設定未完整，已使用本機解析");
    return baseResult;
  }

  const systemPrompt = [
    "你是台灣個人生活行政文件整理助理。",
    "請只回傳 JSON，不要 Markdown。",
    "JSON 欄位：category, issuer, amount, date, summaryItems, tasks, missing。",
    "category 必須是：報稅、保險、信用卡、訂閱、帳單、政府補助、行程提醒、其他文件。",
    "tasks 每筆包含 title, detail, meta。",
    "若無法判斷請使用「未偵測」。",
  ].join("\n");

  try {
    els.llmStatus.textContent = "解析中";
    const response = await fetch(settings.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${settings.apiKey}`,
      },
      body: JSON.stringify({
        model: settings.model,
        temperature: 0.2,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: text },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    const content = payload.choices?.[0]?.message?.content || "";
    const llm = JSON.parse(content);
    const merged = mergeLlmResult(baseResult, llm);
    els.llmStatus.textContent = "已完成";
    return merged;
  } catch (error) {
    els.llmStatus.textContent = "連線未完成";
    showToast(`LLM 解析未完成，已使用本機解析：${error.message}`);
    return baseResult;
  }
}

function mergeLlmResult(base, llm) {
  const result = { ...base };
  result.category = llm.category || base.category;
  result.issuer = llm.issuer || base.issuer;
  result.amount = llm.amount || base.amount;
  result.date = llm.date || base.date;
  result.missing = Array.isArray(llm.missing) ? llm.missing : base.missing;
  result.confidence = Math.min(100, confidenceFor(result) + 8);
  result.tasks = Array.isArray(llm.tasks) && llm.tasks.length
    ? llm.tasks.map((task) => ({
        title: task.title || "待辦事項",
        detail: task.detail || "請確認文件內容並完成後續作業。",
        meta: task.meta || result.priority,
        done: false,
      }))
    : base.tasks;
  result.summary = Array.isArray(llm.summaryItems) && llm.summaryItems.length
    ? llm.summaryItems.map((item) => ({
        title: item.title || "摘要",
        detail: item.detail || String(item),
      }))
    : base.summary;
  result.formDraft = [
    ["文件分類", result.category],
    ["機構名稱", result.issuer],
    ["金額", result.amount],
    ["期限/日期", result.date],
    ["建議用途", suggestedUse(result.category)],
    ["提醒時間", result.reminderLead],
    ["優先級", result.priority],
    ["解析來源", "LLM API"],
    ["資料保存", "不保存原始檔，僅保存使用者確認後的摘要與提醒"],
  ];
  result.trace = [
    ["分類依據", "LLM API 回傳結果與本機欄位檢核"],
    ["金額來源", result.amount === "未偵測" ? "未在內容中找到明確金額" : `擷取到金額片段：${result.amount}`],
    ["日期來源", result.date === "未偵測" ? "未在內容中找到明確日期" : `擷取到日期片段：${result.date}`],
    ["原檔狀態", "平台不保存原始檔，也不提供下載或再次開啟"],
  ];
  return result;
}

function renderResult(result) {
  state.result = result;
  els.resultTitle.textContent = `${result.caseName} · ${result.category}`;
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
        <strong>${escapeHtml(item.caseName || item.issuer)}</strong>
        <small>${escapeHtml(item.status || "進行中")} · ${escapeHtml(item.date)} · ${item.confidence}%</small>
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
  if (!state.user) return showToast("請先登入帳號");
  state.history = [result, ...state.history.filter((item) => item.id !== result.id)].slice(0, 8);
  localStorage.setItem(userScopedKey("history"), JSON.stringify(state.history));
  renderHistory();
  updateStats();
}

function loadHistory() {
  const key = userScopedKey("history");
  if (!key) return [];
  try {
    return JSON.parse(localStorage.getItem(key) || "[]");
  } catch {
    return [];
  }
}

function loadLlmSettings() {
  const key = userScopedKey("llm");
  if (!key) return { enabled: false, endpoint: "", model: "", apiKey: "" };
  try {
    return JSON.parse(localStorage.getItem(key) || '{"enabled":false,"endpoint":"","model":"","apiKey":""}');
  } catch {
    return { enabled: false, endpoint: "", model: "", apiKey: "" };
  }
}

function saveLlmSettings() {
  if (!state.user) return showToast("請先登入帳號");
  state.llm = {
    enabled: els.llmEnabledInput.checked,
    endpoint: els.llmEndpointInput.value.trim(),
    model: els.llmModelInput.value.trim(),
    apiKey: els.llmKeyInput.value,
  };
  localStorage.setItem(userScopedKey("llm"), JSON.stringify(state.llm));
  renderLlmSettings();
  showToast("LLM API 設定已保存");
}

function renderLlmSettings() {
  const settings = state.llm || { enabled: false, endpoint: "", model: "", apiKey: "" };
  els.llmEndpointInput.value = settings.endpoint || "";
  els.llmModelInput.value = settings.model || "";
  els.llmKeyInput.value = settings.apiKey || "";
  els.llmEnabledInput.checked = Boolean(settings.enabled);
  els.llmStatus.textContent = settings.enabled ? "已啟用" : "尚未啟用";
}

function copyDraft() {
  if (!state.user) return showToast("請先登入帳號");
  if (!state.result) return showToast("請先完成一次解析");
  const text = state.result.formDraft.map(([label, value]) => `${label}: ${value}`).join("\n");
  navigator.clipboard?.writeText(text).then(() => showToast("已複製表單草稿")).catch(() => showToast("瀏覽器不允許自動複製"));
}

function downloadJson() {
  if (!state.user) return showToast("請先登入帳號");
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

els.registerButton.addEventListener("click", registerWithPlatform);
els.loginButton.addEventListener("click", loginWithPlatform);
els.logoutButton.addEventListener("click", () => {
  setActiveUser(null);
  showToast("已登出");
});
document.querySelectorAll(".provider-button").forEach((button) => {
  button.addEventListener("click", () => loginWithProvider(button.dataset.provider));
});
els.saveLlmButton.addEventListener("click", saveLlmSettings);
els.checkLlmButton.addEventListener("click", async () => {
  saveLlmSettings();
  const text = "連線檢查：請回傳政府補助分類 JSON。申請期間：2026/07/01 至 2026/07/15。";
  const base = analyzeDocument(text);
  const result = await analyzeWithLlm(text, base);
  showToast(result === base ? "已完成本機檢查" : "LLM 連線已完成");
});

els.analyzeButton.addEventListener("click", async () => {
  if (!state.user) return showToast("請先登入或建立帳號");
  const text = els.documentText.value.trim();
  if (text.length < 12) return renderEmpty("請貼上完整帳單、保單、補助公告或行政通知文字，再執行 AI 整理。");
  const localResult = analyzeDocument(text);
  const result = await analyzeWithLlm(text, localResult);
  renderResult(result);
  addToHistory(result);
  showToast("文件已整理完成");
});

els.clearButton.addEventListener("click", () => {
  els.documentText.value = "";
  els.caseNameInput.value = "";
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
    els.caseNameInput.value = file.name.replace(/\.[^.]+$/, "");
    els.fileStatus.textContent = `已讀入：${file.name}。平台不保存原始檔。`;
  } else {
    els.caseNameInput.value = file.name.replace(/\.[^.]+$/, "");
    els.fileStatus.textContent = `已選擇：${file.name}。PDF/圖片 OCR 將於後續版本接入。`;
  }
});

els.copyDraftButton.addEventListener("click", copyDraft);
els.downloadJsonButton.addEventListener("click", downloadJson);
els.archiveCaseButton.addEventListener("click", () => {
  if (!state.user) return showToast("請先登入帳號");
  if (!state.result) return showToast("請先完成一次解析");
  state.result.status = "已封存";
  addToHistory(state.result);
  renderResult(state.result);
  showToast("案件已封存於本機紀錄");
});

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
if (state.user) {
  setActiveUser(state.user);
} else {
  renderAuthState();
  renderHistory();
  renderLlmSettings();
  updateStats();
}
