# PC-06-07｜《跑得快》真機測試及效能診斷

## Windows 本機準備

1. 安裝 Git 同 Node.js 20 或更新嘅 LTS。喺 PowerShell 執行以下命令，使用 PR #6 分支。
   ```powershell
   git clone --branch feature/integrated-party-clash-race-v3 https://github.com/rena9711/party-clash.git
   cd party-clash
   npm ci
   Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
   npm start
   ```
   如該 checkout 無 `package-lock.json`，用 `npm install` 代替 `npm ci`。留空 `DATABASE_URL`，測試房間只用程序記憶體。
2. 在電腦打開 `http://localhost:3000/race-v3/?diagnostics=1&city=optimized`。確認畫面顯示「性能诊断 · 街景 B」。「街景 A」使用 `city=legacy`。將瀏覽器重載先更換模式，同一場測試內保持固定。A 恢復 PC-06-06 前嘅街景逐幀更新及分色批次。B 使用路段快取及合併燈光批次。兩組共用當前動物渲染、LOD、網絡及規則。
3. 手機同電腦連同一個可信 Wi-Fi。用 `ipconfig` 找到 Windows Wi-Fi IPv4，例如 `192.168.1.25`。如防火牆提示，按本機管理規則容許 Node 喺私人網絡收連線。用手機開 `http://192.168.1.25:3000/multiplayer.html?game=race&diagnostics=1&city=optimized`。此路徑用於測試觸控、聯網、畫面同匯出。手機透過一般 LAN HTTP 無法可靠驗證重力感應權限。

## Android Chrome / iPhone Safari

1. 要驗證重力感應，所有手機應使用同一個已授權、憑證有效嘅 HTTPS QA 網址。iPhone 使用 Safari，Android 使用 Chrome。離開 App 內置瀏覽器再進行。
2. 手機接近自然握姿時，點「进入比赛」。Safari 出現動作與方向權限時選允許。Chrome 如無權限彈窗，先試左右傾斜，再查看站點嘅動作感應器設定。喺另一局用拒絕／停用情境驗證畫面出現左右方向鍵。
3. 保持回到初始角度時會停低。暫停後點「重新校准」，固定新握姿再繼續。直屏、兩個橫屏方向各試左右傾斜及上滑跳躍，確認方向無反轉。網絡比賽時暫停只影響自己畫面。計時仍以伺服器為準。
4. 在性能比較正式採樣前先跑一局預熱。用同一部手機、瀏覽器、屏幕方向、Wi-Fi、角色、玩家數及相似操作做 A/B。記錄手機型號、OS、瀏覽器版本、電量、是否低耗電、屏幕方向及網絡。避免插電、溫度或背景 App 在兩組之間有大變化。每個人數各跑最少三對，交替 A→B、B→A。測旋轉或重連嘅局獨立記錄。

## 2、5、10 人與資料匯出

1. 房主使用 `/multiplayer.html?game=race&diagnostics=1&city=legacy`（A）或 `city=optimized`（B），輸入姓名開房。其他手機可以用 `/multiplayer.html?room=房間碼&diagnostics=1&city=optimized` 加入，再按需要改成 A。街景設定係本機嘅。其他人可以正常用普通邀請連結加入。
2. 所有人確認不同角色後，房主開始比賽。受測者在倒數期間點「进入比赛」。安排至少一位跑手避開炸彈同跨欄，直到伺服器 45 秒完場，避免全員提前出局。資料會記錄 `startsAfterServerMs`、實際記錄時長同有否到達預定結束；如果係遲入場、切出頁面或提早結束，保留作失敗樣本並另跑一局。
3. 結算頁打開「性能诊断」，分別點「导出 JSON」同「导出 CSV」。Safari 如詢問下載，確認後在「檔案」嘅下載位置取檔。Android 到 Chrome 下載項目或 Downloads。匯出完先重新開局、離開或重載，資料保存在當前頁面。對照時核對 `city` 同 `players`。網址不加 `diagnostics=1` 即使用普通模式，無診斷面板或 RTT 探測。

## 點樣判讀瓶頸

| 指標 | 可以觀察 | 判斷限制 |
|---|---|---|
| 平均 FPS、1% Low、長幀 | 用 rAF 幀間隔計算 FPS。同最慢 1% 幀嘅平均間隔倒數比較。≥50ms 算長幀 | 熱降頻、刷新率、背景節流同額外診斷成本會影響結果 |
| JS 更新及主線程 | JS 為遊戲回調扣除 WebGL 提交耗時，包含投影、DOM、插值及 GPU 查詢管理。支援 Long Tasks API 時另記錄 ≥50ms 任務 | 無 Long Tasks API 時為 `null`。主線程阻塞根因需要 Performance trace 拆分 JS、Layout、GC 等 |
| 渲染提交、GPU、Draw Calls | CPU 端 `renderer.render()` 用時；可用 WebGL 非同步計時查詢時抽樣 GPU 用時，丟棄 disjoint 結果。紀錄場景 Draw Calls、三角形 | 提交耗時同 GPU 執行耗時係兩個指標。GPU 值缺失時用 `null`，未能據此推斷 GPU 已飽和 |
| 記憶體 | 支援 `performance.memory` 嘅瀏覽器每秒抽樣 JS heap | JS heap 無包含 GPU、全程序 RSS。Safari 如無 API 值會留空 |
| 網絡快照 | 包大小、到達間隔、伺服器間隔、處理耗時及 Socket ACK RTT。大小為 UTF-8 估算，包括事件封裝，無包括傳輸層標頭 | 長間隔可以源自網絡、伺服器排程或主線程收到資料後延遲處理。RTT 不等於單程延遲，快照間隔亦不足以直接算丟包率 |

JSON 有 session、summary 同原始時間序列。CSV 用 `kind` 分成 summary、frame、snapshot、rtt、gpu、long_task。時長用毫秒，容量用 MiB 或 bytes。資料留在裝置，無收集玩家暱稱、房間碼或連線憑證。

Android 可以用 USB 接 Windows，喺 Chrome 打開 `chrome://inspect/#devices`，選受測頁做短段 Performance trace。建議另外跑一局錄 trace，避免錄影及工具負載影響正式 A/B。iPhone Safari Web Inspector 需配合 Mac。用 Windows 仍可讀取 iPhone 匯出嘅診斷檔。

本機 PC-06-06 已量到街景提交次數下降，但 10 人 FPS 無明確增益。真機瓶頸要配合同一部手機嘅 A/B、GPU 抽樣、主線程 trace 同快照到達間隔先可以判斷。**未完成真機驗證。**

## Render QA 條件

如現有 QA 網址未顯示診斷面板，需要先獲批准將 PR #6 嘅 PC-06-07 commit 部署到獨立 HTTPS QA Web Service。該服務需提供 HTTP 靜態頁、Socket.IO WebSocket，同源 iframe，容許同源動作感應權限。用測試環境資料或留空 `DATABASE_URL`。正式服務及正式資料庫保持原狀。本次未部署，也未核實現有 QA 網址正運行診斷版本。
