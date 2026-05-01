# Codex 資產網頁

## 專案簡介
這是一個用 HTML / CSS / JS 製作的本機優先個人資產總覽 / 資產管理小系統。

目前定位：
- 本機優先，資料由使用者自己保管
- 隱私優先，沒有後端與雲端同步
- 手動維護資產數字
- 手機可用
- 結構簡單、清楚、可維護

## 目前已有功能
- 資產總覽：顯示總資產、銀行小計、投資小計、資產配置與主要部位。
- 銀行資產：新增、編輯、刪除銀行帳戶與目前金額。
- 投資資產：新增、編輯、刪除投資項目與目前市值。
- 設定頁：集中呈現資料儲存、備份、進階資訊與危險操作。
- 匯出 JSON 備份：下載目前完整資產資料。
- 匯入 JSON 備份：從備份檔還原資料。
- 匯入前覆蓋確認：格式驗證通過後，正式覆蓋資料前會再次確認。
- 清除所有資料：可清空目前瀏覽器中的主要資產資料。
- 重置前備份提醒：清除前會提醒資料將從目前瀏覽器移除、建議先匯出備份，取消則不變更資料。
- 首頁空狀態 CTA：沒有任何資產時，可直接前往新增銀行帳戶或投資項目。
- 設定頁資料與備份中心：分成資料儲存位置、備份與還原、進階資訊、危險操作。
- PWA 基礎 manifest：提供基本安裝資訊與圖示設定。

## 使用方式
直接用瀏覽器開啟 `index.html` 即可使用。

## 資料儲存說明
- 資料只存在目前使用的瀏覽器與裝置中。
- 資料儲存在瀏覽器 `localStorage`。
- 沒有後端伺服器。
- 沒有雲端同步。
- 沒有自動備份。
- 清除瀏覽器資料、清除站點資料、更換瀏覽器或更換裝置，都可能造成未備份資料遺失。
- 建議定期使用「匯出備份」下載 JSON 備份檔，並自行保存到安全位置。

## localStorage 使用的 key 與 schema
- `asset_dashboard_state_v3`
  - 主要狀態物件，包含 `schemaVersion`、`accounts`、`investments`、`ui`、`meta`。
  - `ui.activeView` 會保留在主要狀態中，但目前使用中的分頁會另外以 `asset_dashboard_ui_v3` 優先保存與載入。
- `asset_dashboard_ui_v3`
  - 目前使用中的分頁狀態。
- `schemaVersion`
  - 目前版本為 `3`。
  - 這是狀態與備份 payload 裡的欄位，不是另一個 localStorage key。

## 匯出格式
匯出的 JSON payload 目前包含：

```json
{
  "exportedAt": "ISO datetime string",
  "schemaVersion": 3,
  "state": {
    "schemaVersion": 3,
    "accounts": [
      {
        "id": "asset-id",
        "name": "帳戶名稱",
        "amount": "0",
        "color": "#67b0ff"
      }
    ],
    "investments": [
      {
        "id": "asset-id",
        "name": "投資名稱",
        "amount": "0",
        "color": "#40d39f"
      }
    ],
    "ui": {
      "activeView": "overview"
    },
    "meta": {
      "lastSavedAt": "zh-TW datetime string or empty string",
      "lastSavedMode": "save mode string or empty string"
    }
  }
}
```

主要資料集合：
- `state.accounts`
- `state.investments`

補充：
- 匯出時的 `state` 直接來自目前 `appState`。
- `accounts` / `investments` 可以是空陣列；若有資料，單筆資料目前包含 `id`、`name`、`amount`、`color`。
- 若匯出前有尚未寫入的變更，匯出流程會先以 `manual` 模式儲存目前狀態。

## 匯入規則
目前支援的格式：
- current 格式：
  - `state.accounts`
  - `state.investments`
- legacy 格式：
  - `accounts`
  - `investments`
  - `accs`
  - `etfs`

目前支援的舊金額欄位：
- `amount`
- `balance`
- `bal`
- `value`
- `val`

舊投資資料若沒有可用金額欄位，可用：
- `shares * price`

目前會拒絕：
- 無效 JSON
- 無效金額
- 空白 `id`
- 重複 `id`
- 沒有任何可匯入資料的空備份
- 不符合支援格式的 payload

補充：
- 單一 collection 可以是空陣列，但整份 payload 必須至少有一個支援的 collection 含有資料。

匯入流程：
- 先解析 JSON。
- 再驗證匯入格式。
- 格式驗證通過後，正式覆蓋目前資料前會跳出 confirm 覆蓋確認。
- 使用者取消匯入時，不會變更目前資料、不會寫入 `localStorage`、不會重新渲染畫面。

## 目前專案檔案
- `index.html`
- `style.css`
- `script.js`
- `README.md`
- `AGENTS.md`
- `manifest.webmanifest`
- `app-icon.svg`
- `.gitignore`

## 目前限制
- 目前不是完整記帳系統。
- 不支援自動抓股價。
- 不支援多幣別。
- 不支援雲端同步。
- 不支援多裝置同步。
- 不支援登入帳號。
- 沒有 service worker，因此只是 PWA 基礎設定，不是完整離線 App。

## 最近狀態
近期已完成的安全 / UX 改善：
- 匯入前覆蓋確認。
- 重置全部資料前會明確提醒使用者：清除資料會移除目前瀏覽器中的資產資料、建議先匯出目前備份，按取消不會變更目前資料。
- 首頁空狀態新增銀行 / 投資 CTA。
- 設定頁整理為資料儲存位置 / 備份與還原 / 進階資訊 / 危險操作。

## 維護注意事項
- 修改資料結構、localStorage key、schemaVersion、匯入相容規則或匯出格式時，必須同步更新 README。
- 修改匯入、匯出、重置流程時，必須特別注意資料遺失風險。
- 修改 UI 時，必須確認手機版仍可讀、可點、可操作。
