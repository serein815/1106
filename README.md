# 日常誌｜行程與待辦管理

純靜態網頁行程管理工具，使用 Firebase Authentication 的 Google 登入，以及 Cloud Firestore 即時同步資料。介面使用繁體中文，適合部署在 GitHub Pages。

## 功能

- 使用 Google 帳戶登入與登出
- 依日期查看、新增、編輯與刪除行程
- 依日期新增、編輯、刪除及勾選待辦事項
- 顯示每日行程數、未完成待辦數與完成比例
- 使用者資料存放於自己的 Firestore 路徑，規則限制只能由本人讀寫
- 支援 GitHub Pages，無需建置步驟

## Firebase 專案

此版本已連結 Firebase 專案 `project-8349245123229862163`，前端公開設定放在 `firebase-config.js`。Firebase Web API key 是前端識別設定，資料安全由 Authentication 與 Firestore Rules 控制；不要把服務帳戶金鑰或管理員憑證放進前端。

Firebase 專案已啟用 Google 登入，並建立 Standard Cloud Firestore 預設資料庫於 `asia-east1`（台灣）；`firestore.rules` 已發佈。資料路徑為：

- `users/{uid}/schedules/{scheduleId}`：行程資料
- `users/{uid}/tasks/{taskId}`：待辦資料

## GitHub Pages

在 GitHub 儲存庫 **Settings → Pages** 設定 **Deploy from a branch**、`main` 分支與 `/ (root)` 資料夾。發佈後，把 GitHub Pages 網址的主機名稱加入 Firebase Console 的 **Authentication → Settings → Authorized domains**，登入才會在正式網址運作。

更新網站只需將新版本推送至 `main` 分支。設定和資料庫安全規則請以 Firebase Console 為準；`firebase.json` 與 `firestore.rules` 也保留在專案中方便後續維護。
