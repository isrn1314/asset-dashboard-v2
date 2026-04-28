const BUILD_ID = document.querySelector('meta[name="app-build"]')?.content || "dev";
const STORAGE_KEY = "asset_dashboard_state_v3";
const UI_STORAGE_KEY = "asset_dashboard_ui_v3";
const BUILD_REFRESH_KEY_PREFIX = "asset_dashboard_build_seen_";
const VIEW_NAMES = ["overview", "accounts", "investments", "settings"];
const ACCOUNT_COLORS = ["#67b0ff", "#f7c15e", "#46d4a8", "#87abff", "#ff9d7c", "#b68dff"];
const INVESTMENT_COLORS = ["#40d39f", "#68b0ff", "#f7c15e", "#7ce0bf", "#9ec5ff", "#ff9f92"];
const CURRENCY_FORMATTER = new Intl.NumberFormat("zh-TW", {
  style: "currency",
  currency: "TWD",
  maximumFractionDigits: 0
});

const dom = {
  tabs: Array.from(document.querySelectorAll(".view-tab")),
  panels: Array.from(document.querySelectorAll(".view-panel")),
  saveStatusChip: document.getElementById("saveStatusChip"),
  saveStatusText: document.getElementById("saveStatusText"),
  settingsStatusChip: document.getElementById("settingsStatusChip"),
  settingsStatusText: document.getElementById("settingsStatusText"),
  overviewNetWorth: document.getElementById("overviewNetWorth"),
  overviewAssetCount: document.getElementById("overviewAssetCount"),
  overviewCaption: document.getElementById("overviewCaption"),
  overviewBankTotal: document.getElementById("overviewBankTotal"),
  overviewInvestmentTotal: document.getElementById("overviewInvestmentTotal"),
  allocationList: document.getElementById("allocationList"),
  holdingList: document.getElementById("holdingList"),
  accountCount: document.getElementById("accountCount"),
  accountSubtotal: document.getElementById("accountSubtotal"),
  investmentCount: document.getElementById("investmentCount"),
  investmentSubtotal: document.getElementById("investmentSubtotal"),
  accountCreateForm: document.getElementById("accountCreateForm"),
  investmentCreateForm: document.getElementById("investmentCreateForm"),
  accountNameInput: document.getElementById("accountNameInput"),
  accountAmountInput: document.getElementById("accountAmountInput"),
  investmentNameInput: document.getElementById("investmentNameInput"),
  investmentAmountInput: document.getElementById("investmentAmountInput"),
  accountList: document.getElementById("accountList"),
  investmentList: document.getElementById("investmentList"),
  exportBackupButton: document.getElementById("exportBackupButton"),
  importBackupButton: document.getElementById("importBackupButton"),
  importFileInput: document.getElementById("importFileInput"),
  resetButton: document.getElementById("resetButton")
};

let appState = loadState();
let saveState = "saved";
let saveTimer = null;

// App bootstrap
boot();

function boot(){
  cleanupBuildQuery();
  bindEvents();
  renderApp();
  persistActiveView(appState.ui.activeView);
  applySaveState("saved");
  checkForLatestBuild();
}

// App lifecycle helpers
// Build refresh helpers
function cleanupBuildQuery(){
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("v")) return;
    url.searchParams.delete("v");
    history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  } catch (error) {
    // Ignore unsupported URL contexts such as some local previews.
  }
}

async function checkForLatestBuild(){
  try {
    const probeUrl = new URL(window.location.href);
    probeUrl.searchParams.set("_buildCheck", Date.now().toString());
    const response = await fetch(probeUrl.toString(), { cache: "no-store" });
    if (!response.ok) return;

    const html = await response.text();
    const match = html.match(/<meta\s+name=["']app-build["']\s+content=["']([^"']+)["']/i);
    const latestBuild = match?.[1]?.trim();
    if (!latestBuild || latestBuild === BUILD_ID) return;

    const sessionKey = `${BUILD_REFRESH_KEY_PREFIX}${latestBuild}`;
    if (sessionStorage.getItem(sessionKey)) return;

    sessionStorage.setItem(sessionKey, "1");
    const reloadUrl = new URL(window.location.href);
    reloadUrl.searchParams.set("v", latestBuild);
    window.location.replace(reloadUrl.toString());
  } catch (error) {
    // Ignore fetch errors; local previews and some embedded browsers may not support this check.
  }
}

// View state helpers
function loadStoredView(fallback){
  try {
    const raw = localStorage.getItem(UI_STORAGE_KEY);
    return VIEW_NAMES.includes(raw) ? raw : fallback;
  } catch (error) {
    return fallback;
  }
}

function persistActiveView(viewName){
  try {
    localStorage.setItem(UI_STORAGE_KEY, viewName);
  } catch (error) {
    // Ignore UI-state persistence failure because it should not block data edits.
  }
}

function applyView(viewName){
  const nextView = VIEW_NAMES.includes(viewName) ? viewName : "overview";
  appState.ui.activeView = nextView;

  dom.tabs.forEach((tabButton) => {
    tabButton.classList.toggle("is-active", tabButton.dataset.view === nextView);
  });

  dom.panels.forEach((panel) => {
    panel.classList.toggle("is-active", panel.id === `view-${nextView}`);
  });
}

// State creation and normalization
// State creation
function createDefaultState(){
  return {
    schemaVersion: 3,
    accounts: [],
    investments: [],
    ui: { activeView: "overview" },
    meta: { lastSavedAt: "", lastSavedMode: "" }
  };
}

function loadState(){
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const state = raw ? normalizeState(JSON.parse(raw)) : createDefaultState();
    state.ui.activeView = loadStoredView(state.ui.activeView);
    return state;
  } catch (error) {
    const state = createDefaultState();
    state.ui.activeView = loadStoredView(state.ui.activeView);
    return state;
  }
}

function createId(){
  return `asset-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

// Import validation
const IMPORT_STATE_COLLECTION_KEYS = ["accounts", "investments"];
const IMPORT_LEGACY_COLLECTION_KEYS = ["accounts", "investments", "accs", "etfs"];
const IMPORT_AMOUNT_KEYS = ["amount", "balance", "bal", "value", "val"];

function isPlainObject(value){
  return Object.prototype.toString.call(value) === "[object Object]";
}

function hasOwnKey(source, key){
  return Object.prototype.hasOwnProperty.call(source, key);
}

function normalizeColor(value, fallback){
  return typeof value === "string" && /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(value.trim())
    ? value.trim()
    : fallback;
}

function isValidImportAmount(value){
  if (typeof value === "number") {
    return Number.isFinite(value) && value >= 0;
  }

  if (typeof value !== "string") return false;

  const trimmed = value.trim();
  if (!trimmed) return true; // Existing backups store an unset amount as an empty string.
  if (!/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(trimmed)) return false;

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) && parsed >= 0;
}

function isValidImportEntry(entry){
  if (!isPlainObject(entry)) return false;

  if (hasOwnKey(entry, "id") && (typeof entry.id !== "string" || !entry.id.trim())) {
    return false;
  }

  if (hasOwnKey(entry, "name") && typeof entry.name !== "string") {
    return false;
  }

  return IMPORT_AMOUNT_KEYS.every((key) => !hasOwnKey(entry, key) || isValidImportAmount(entry[key]));
}

function isValidImportCollection(entries){
  if (!Array.isArray(entries)) return false;

  const seenIds = new Set();
  for (const entry of entries) {
    if (!isValidImportEntry(entry)) return false;

    if (hasOwnKey(entry, "id")) {
      const normalizedId = entry.id.trim();
      if (seenIds.has(normalizedId)) return false;
      seenIds.add(normalizedId);
    }
  }

  return true;
}

function hasImportCollection(source, keys){
  return keys.some((key) => hasOwnKey(source, key));
}

function hasImportCollectionEntries(source, keys){
  return keys.some((key) => hasOwnKey(source, key) && Array.isArray(source[key]) && source[key].length > 0);
}

function areImportCollectionsValid(source, keys){
  return keys.every((key) => !hasOwnKey(source, key) || isValidImportCollection(source[key]));
}

function isValidImportPayload(payload){
  if (!isPlainObject(payload)) return false;
  if (hasOwnKey(payload, "state")) {
    const stateSource = payload.state;
    return isPlainObject(stateSource)
      && hasImportCollection(stateSource, IMPORT_STATE_COLLECTION_KEYS)
      && hasImportCollectionEntries(stateSource, IMPORT_STATE_COLLECTION_KEYS)
      && areImportCollectionsValid(stateSource, IMPORT_STATE_COLLECTION_KEYS);
  }

  return hasImportCollection(payload, IMPORT_LEGACY_COLLECTION_KEYS)
    && hasImportCollectionEntries(payload, IMPORT_LEGACY_COLLECTION_KEYS)
    && areImportCollectionsValid(payload, IMPORT_LEGACY_COLLECTION_KEYS);
}

function getImportErrorMessage(error){
  if (error instanceof SyntaxError) {
    return "JSON 格式錯誤";
  }

  if (error?.message === "invalid-backup") {
    return "不是可接受的備份格式";
  }

  return "匯入處理失敗，請稍後再試";
}

// State normalization
function normalizeState(rawState){
  const source = isPlainObject(rawState) ? rawState : createDefaultState();
  const uiSource = isPlainObject(source.ui) ? source.ui : {};
  const prefsSource = isPlainObject(source.prefs) ? source.prefs : {};
  const metaSource = isPlainObject(source.meta) ? source.meta : {};
  const legacyAccounts = Array.isArray(source.accounts) ? source.accounts : Array.isArray(source.accs) ? source.accs : [];
  const legacyInvestments = Array.isArray(source.investments) ? source.investments : Array.isArray(source.etfs) ? source.etfs : [];

  return {
    schemaVersion: 3,
    accounts: legacyAccounts.map((item, index) => normalizeEntry(item, index, "accounts")),
    investments: legacyInvestments.map((item, index) => normalizeEntry(item, index, "investments")),
    ui: {
      activeView: VIEW_NAMES.includes(uiSource.activeView)
        ? uiSource.activeView
        : VIEW_NAMES.includes(prefsSource.lastTab)
          ? prefsSource.lastTab
          : "overview"
    },
    meta: {
      lastSavedAt: typeof metaSource.lastSavedAt === "string" ? metaSource.lastSavedAt : "",
      lastSavedMode: typeof metaSource.lastSavedMode === "string" ? metaSource.lastSavedMode : ""
    }
  };
}

function normalizeEntry(rawEntry, index, kind){
  const source = isPlainObject(rawEntry) ? rawEntry : {};
  const palette = kind === "accounts" ? ACCOUNT_COLORS : INVESTMENT_COLORS;
  const fallbackColor = palette[index % palette.length];
  const migratedAmount = source.amount
    ?? source.balance
    ?? source.bal
    ?? source.value
    ?? source.val
    ?? calculateLegacyInvestmentValue(source);

  return {
    id: typeof source.id === "string" && source.id.trim() ? source.id.trim() : createId(),
    name: normalizeName(typeof source.name === "string" ? source.name : "", kind === "accounts" ? "未命名帳戶" : "未命名投資"),
    amount: normalizeAmountInput(migratedAmount),
    color: normalizeColor(source.color, fallbackColor)
  };
}

function calculateLegacyInvestmentValue(source){
  const shares = parseAmount(source?.shares);
  const price = parseAmount(source?.price);
  const legacyTotal = shares * price;
  return legacyTotal > 0 ? String(legacyTotal) : "";
}

// Event binding and input handlers
function bindEvents(){
  // View navigation
  dom.tabs.forEach((tabButton) => {
    tabButton.addEventListener("click", () => showView(tabButton.dataset.view));
  });

  // Create forms
  dom.accountCreateForm.addEventListener("submit", (event) => {
    event.preventDefault();
    createEntry("accounts");
  });

  dom.investmentCreateForm.addEventListener("submit", (event) => {
    event.preventDefault();
    createEntry("investments");
  });

  // Entry list editing
  dom.accountList.addEventListener("input", handleEntryInput);
  dom.investmentList.addEventListener("input", handleEntryInput);
  dom.accountList.addEventListener("click", handleEntryClick);
  dom.investmentList.addEventListener("click", handleEntryClick);

  // Backup and reset actions
  dom.exportBackupButton.addEventListener("click", exportBackup);
  dom.importBackupButton.addEventListener("click", () => dom.importFileInput.click());
  dom.importFileInput.addEventListener("change", importBackup);
  dom.resetButton.addEventListener("click", resetAllData);

  // Page lifecycle sync
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden" && saveState !== "saved") {
      persistState("auto");
    } else if (document.visibilityState === "visible") {
      checkForLatestBuild();
    }
  });

  window.addEventListener("pagehide", () => {
    if (saveState !== "saved") persistState("auto");
  });

  window.addEventListener("focus", () => {
    checkForLatestBuild();
  });

  // Cross-tab state sync
  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEY) {
      appState = loadState();
      renderApp();
      applySaveState("saved");
      return;
    }

    if (event.key === UI_STORAGE_KEY) {
      applyView(loadStoredView(appState.ui.activeView));
    }
  });
}

// Entry creation
function createEntry(kind){
  const isAccount = kind === "accounts";
  const nameInput = isAccount ? dom.accountNameInput : dom.investmentNameInput;
  const amountInput = isAccount ? dom.accountAmountInput : dom.investmentAmountInput;
  const collection = isAccount ? appState.accounts : appState.investments;
  const palette = isAccount ? ACCOUNT_COLORS : INVESTMENT_COLORS;
  const fallbackName = isAccount ? "新帳戶" : "新投資";
  const rawName = nameInput.value;
  const name = normalizeName(rawName, fallbackName);

  if (!rawName.trim()) {
    alert("請先輸入名稱。");
    nameInput.focus();
    return;
  }

  collection.push({
    id: createId(),
    name,
    amount: normalizeAmountInput(amountInput.value),
    color: palette[collection.length % palette.length]
  });

  nameInput.value = "";
  amountInput.value = "";
  renderApp();
  scheduleSave();
}

// Entry editing and removal
function handleEntryInput(event){
  const field = event.target;
  const card = field.closest("[data-kind][data-id]");
  if (!card) return;

  const kind = card.dataset.kind;
  const entry = findEntry(kind, card.dataset.id);
  if (!entry) return;

  if (field.dataset.role === "name") {
    entry.name = normalizeName(field.value, kind === "accounts" ? "未命名帳戶" : "未命名投資");
  }

  if (field.dataset.role === "amount") {
    entry.amount = normalizeAmountInput(field.value);
  }

  renderOverview();
  renderCollectionSummaries();
  scheduleSave();
}

function handleEntryClick(event){
  const button = event.target.closest("[data-action='delete']");
  if (!button) return;

  const card = button.closest("[data-kind][data-id]");
  if (!card) return;

  const kind = card.dataset.kind;
  const label = kind === "accounts" ? "這個帳戶" : "這個投資項目";
  if (!confirm(`確定要刪除${label}嗎？`)) return;

  appState[kind] = appState[kind].filter((item) => item.id !== card.dataset.id);
  renderApp();
  scheduleSave();
}

function findEntry(kind, id){
  return appState[kind].find((item) => item.id === id);
}

// View switching helpers
function showView(viewName){
  const nextView = VIEW_NAMES.includes(viewName) ? viewName : "overview";
  applyView(nextView);
  persistActiveView(nextView);
}

// Rendering
// Primary view rendering
function renderApp(){
  renderOverview();
  renderCollectionSummaries();
  renderCollectionList("accounts");
  renderCollectionList("investments");
  renderSaveMetadata();
  applyView(appState.ui.activeView);
}

function renderOverview(){
  const totals = calculateTotals();
  const assetCount = appState.accounts.length + appState.investments.length;

  dom.overviewNetWorth.textContent = formatCurrency(totals.total);
  dom.overviewAssetCount.textContent = `${assetCount} 項資產`;
  dom.overviewBankTotal.textContent = formatCurrency(totals.bank);
  dom.overviewInvestmentTotal.textContent = formatCurrency(totals.investment);

  dom.overviewCaption.textContent = totals.total > 0
    ? `目前銀行占 ${formatPercent(totals.bank, totals.total)}，投資占 ${formatPercent(totals.investment, totals.total)}。`
    : "新增銀行與投資項目後，這裡會即時顯示總額與比例。";

  const allocationRows = [
    { label: "銀行資金", amount: totals.bank, ratio: calculateRatioNumber(totals.bank, totals.total), color: "#67b0ff" },
    { label: "投資部位", amount: totals.investment, ratio: calculateRatioNumber(totals.investment, totals.total), color: "#40d39f" }
  ];

  dom.allocationList.innerHTML = allocationRows.map((item) => `
    <article class="allocation-row">
      <div class="allocation-row__top">
        <strong class="allocation-row__label">${item.label}</strong>
        <span class="allocation-row__ratio">${item.ratio.toFixed(1)}%</span>
      </div>
      <div class="allocation-bar">
        <div class="allocation-bar__fill" style="width:${Math.max(item.ratio, 0)}%;background:${item.color}"></div>
      </div>
      <p class="allocation-value">${formatCurrency(item.amount)}</p>
    </article>
  `).join("");

  const holdings = buildHoldings();
  dom.holdingList.innerHTML = holdings.length
    ? holdings.slice(0, 6).map((item) => `
      <article class="holding-card">
        <div class="holding-card__top">
          <div class="holding-card__name">
            <span class="tag-dot" style="background:${escapeHtml(item.color)}"></span>
            <strong>${escapeHtml(item.name)}</strong>
          </div>
          <strong>${formatCurrency(item.amount)}</strong>
        </div>
        <p class="holding-card__meta">${item.kind === "accounts" ? "銀行帳戶" : "投資部位"} · 佔總資產 ${formatPercent(item.amount, totals.total)}</p>
      </article>
    `).join("")
    : createEmptyState("目前還沒有資產資料", "先新增銀行帳戶或投資部位，總覽就會自動長出來。");
}

function renderCollectionSummaries(){
  const totals = calculateTotals();
  dom.accountCount.textContent = String(appState.accounts.length);
  dom.accountSubtotal.textContent = formatCurrency(totals.bank);
  dom.investmentCount.textContent = String(appState.investments.length);
  dom.investmentSubtotal.textContent = formatCurrency(totals.investment);
}

function renderCollectionList(kind){
  const listElement = kind === "accounts" ? dom.accountList : dom.investmentList;
  const entries = kind === "accounts" ? appState.accounts : appState.investments;
  const title = kind === "accounts" ? "還沒有銀行帳戶" : "還沒有投資項目";
  const description = kind === "accounts"
    ? "從上方表單新增第一個帳戶，之後只要更新數字即可。"
    : "從上方表單新增標的，之後維護目前市值就好。";
  const note = kind === "accounts" ? "會自動計入總資產與銀行比例。" : "適合記 ETF、股票、基金或其他投資。";

  listElement.innerHTML = entries.length
    ? entries.map((entry) => `
      <article class="entry-card" data-kind="${kind}" data-id="${escapeHtml(entry.id)}">
        <div class="entry-card__top">
          <div class="entry-card__identity">
            <span class="tag-dot" style="background:${escapeHtml(entry.color)}"></span>
            <input
              class="field-input entry-card__name"
              data-role="name"
              type="text"
              maxlength="40"
              value="${escapeHtml(entry.name)}"
              aria-label="${kind === "accounts" ? "帳戶名稱" : "投資名稱"}"
            >
          </div>
          <div class="entry-card__actions">
            <button class="button button--ghost" type="button" data-action="delete">刪除</button>
          </div>
        </div>
        <div class="field-group">
          <label class="field-label">${kind === "accounts" ? "目前金額（台幣）" : "目前市值（台幣）"}</label>
          <input
            class="field-input field-input--amount"
            data-role="amount"
            type="number"
            inputmode="decimal"
            min="0"
            placeholder="0"
            value="${escapeHtml(entry.amount)}"
            aria-label="${kind === "accounts" ? "目前金額" : "目前市值"}"
          >
        </div>
        <p class="entry-note">${note}</p>
      </article>
    `).join("")
    : createEmptyState(title, description);
}

// Empty and status display helpers
function createEmptyState(title, description){
  return `
    <article class="empty-state surface">
      <strong>${escapeHtml(title)}</strong>
      <p>${escapeHtml(description)}</p>
    </article>
  `;
}

function renderSaveMetadata(){
  const metaText = buildSaveMetaText();
  dom.saveStatusText.textContent = metaText;
  dom.settingsStatusText.textContent = metaText;
}

function buildSaveMetaText(){
  if (!appState.meta.lastSavedAt) return "尚未建立資料";

  const modeMap = {
    auto: "自動儲存",
    manual: "手動更新",
    import: "匯入完成",
    sync: "同步更新"
  };

  const modeText = modeMap[appState.meta.lastSavedMode] || "已更新";
  return `${modeText} · ${appState.meta.lastSavedAt}`;
}

// Derived data helpers
function calculateTotals(){
  const bank = appState.accounts.reduce((sum, item) => sum + parseAmount(item.amount), 0);
  const investment = appState.investments.reduce((sum, item) => sum + parseAmount(item.amount), 0);
  return { bank, investment, total: bank + investment };
}

function buildHoldings(){
  return [
    ...appState.accounts.map((entry) => ({ ...entry, kind: "accounts", amount: parseAmount(entry.amount) })),
    ...appState.investments.map((entry) => ({ ...entry, kind: "investments", amount: parseAmount(entry.amount) }))
  ]
    .filter((entry) => entry.amount > 0)
    .sort((left, right) => right.amount - left.amount);
}

// Persistence and backup
// Save status and scheduling
function applySaveState(nextState){
  saveState = nextState;
  const appearance = {
    saved: { label: "已儲存", color: "var(--success)", background: "rgba(50,210,156,.12)" },
    saving: { label: "儲存中", color: "var(--primary)", background: "rgba(98,170,255,.12)" },
    dirty: { label: "待儲存", color: "var(--warning)", background: "rgba(247,193,94,.12)" }
  }[nextState];

  [dom.saveStatusChip, dom.settingsStatusChip].forEach((chip) => {
    chip.textContent = appearance.label;
    chip.style.color = appearance.color;
    chip.style.background = appearance.background;
  });
}

function scheduleSave(){
  applySaveState("dirty");
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => persistState("auto"), 650);
}

// Local persistence
function persistState(mode){
  clearTimeout(saveTimer);
  try {
    applySaveState("saving");
    appState.meta.lastSavedAt = new Date().toLocaleString("zh-TW", { hour12: false });
    appState.meta.lastSavedMode = mode;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));
    renderSaveMetadata();
    applySaveState("saved");
  } catch (error) {
    applySaveState("dirty");
    alert("儲存失敗，請確認瀏覽器儲存空間是否足夠。");
  }
}

// Backup import and export
function exportBackup(){
  try {
    if (saveState !== "saved") persistState("manual");
    const payload = {
      exportedAt: new Date().toISOString(),
      schemaVersion: appState.schemaVersion,
      state: appState
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 10);
    link.href = url;
    link.download = `asset-dashboard-backup-${stamp}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (error) {
    alert("匯出備份失敗，請稍後再試。");
  }
}

function importBackup(event){
  const file = event.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const payload = JSON.parse(String(reader.result || "{}"));
      if (!isValidImportPayload(payload)) {
        throw new Error("invalid-backup");
      }

      const stateSource = isPlainObject(payload.state) ? payload.state : payload;
      const nextState = normalizeState(stateSource);
      nextState.meta.lastSavedAt = new Date().toLocaleString("zh-TW", { hour12: false });
      nextState.meta.lastSavedMode = "import";
      const serializedState = JSON.stringify(nextState);
      localStorage.setItem(STORAGE_KEY, serializedState);
      appState = nextState;
      renderApp();
      persistActiveView(nextState.ui.activeView);
      applySaveState("saved");
      alert("匯入完成。");
    } catch (error) {
      alert(getImportErrorMessage(error));
    } finally {
      event.target.value = "";
    }
  };

  reader.readAsText(file, "utf-8");
}

// Data reset
function resetAllData(){
  if (!confirm("確定要清除所有資料並重新開始嗎？")) return;
  clearTimeout(saveTimer);
  localStorage.removeItem(STORAGE_KEY);
  appState = createDefaultState();
  persistActiveView("overview");
  renderApp();
  applySaveState("saved");
}

// Formatting and utility helpers
// Input normalization
function normalizeName(value, fallback){
  const trimmed = String(value ?? "").replace(/\s+/g, " ").trim();
  return trimmed || fallback;
}

function normalizeAmountInput(value){
  if (value === "" || value === null || value === undefined) return "";
  const parsed = parseAmount(value);
  return String(Math.max(0, parsed));
}

function parseAmount(value){
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value !== "string") {
    return 0;
  }

  const parsed = Number.parseFloat(value.replace(/,/g, "").trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

// Value formatting
function formatCurrency(value){
  return CURRENCY_FORMATTER.format(value || 0);
}

function calculateRatioNumber(part, total){
  if (part <= 0 || total <= 0) return 0;
  return (part / total) * 100;
}

function formatPercent(part, total){
  return `${calculateRatioNumber(part, total).toFixed(1)}%`;
}

// HTML escaping
function escapeHtml(value){
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
