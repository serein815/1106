# 日常誌｜行程與待辦管理

純靜態網頁行程管理工具，使用 Firebase Authentication 的 Google 登入，以及 Cloud Firestore 即時同步資料。介面使用繁體中文，適合部署在 GitHub Pages。

## 功能

- 使用 Google 帳戶登入與登出
- 首次登入可選擇顯示用戶名，之後可隨時修改
- 依日期查看、新增、編輯與刪除行程
- 月曆檢視、日期切換，並標示台灣國定假日與節日
- 依日期新增、編輯、刪除及勾選待辦與提醒事項，可設定時間
- 允許瀏覽器通知後，可在網站開啟時收到到期提醒
- 顯示每日行程數、未完成事項數與完成比例
- 預設生活（Tiffany 藍）、工作（橘黃色）、未分類（墨綠色），並可新增分類及修改名稱、顏色
- 月曆同步顯示行程、待辦（紫色）與提醒（灰色），顏色可在分類管理中自訂
- 使用者資料存放於自己的 Firestore 路徑，規則限制只能由本人讀寫
- 支援 GitHub Pages，無需建置步驟

## Firebase 專案

此版本已連結 Firebase 專案 `project-8349245123229862163`，前端公開設定放在 `firebase-config.js`。Firebase Web API key 是前端識別設定，資料安全由 Authentication 與 Firestore Rules 控制；不要把服務帳戶金鑰或管理員憑證放進前端。

Firebase 專案已啟用 Google 登入，並建立 Standard Cloud Firestore 預設資料庫於 `asia-east1`（台灣）；`firestore.rules` 已發佈。資料路徑為：

- `users/{uid}/schedules/{scheduleId}`：行程資料
- `users/{uid}/tasks/{taskId}`：待辦資料
- `users/{uid}/categories/{categoryId}`：使用者可自訂的分類名稱與顏色
- `users/{uid}/profiles/main`：使用者在系統內顯示的用戶名

台灣國定假日採用人事行政總處公告的 2026、2027 政府行政機關辦公日曆；民俗節日依瀏覽器農曆曆法計算。政府辦公日曆適用範圍與企業規定不同，詳見[2026 公告](https://www.dgpa.gov.tw/information?pid=12574&uid=2)及[2027 公告](https://www.dgpa.gov.tw/information?pid=12983&uid=82)。

提醒以瀏覽器通知呈現，使用者需允許通知且保持網站開啟；網站關閉時不會在背景送出通知。

## GitHub Pages

在 GitHub 儲存庫 **Settings → Pages** 設定 **Deploy from a branch**、`main` 分支與 `/ (root)` 資料夾。發佈後，把 GitHub Pages 網址的主機名稱加入 Firebase Console 的 **Authentication → Settings → Authorized domains**，登入才會在正式網址運作。

更新網站只需將新版本推送至 `main` 分支。設定和資料庫安全規則請以 Firebase Console 為準；`firebase.json` 與 `firestore.rules` 也保留在專案中方便後續維護。
