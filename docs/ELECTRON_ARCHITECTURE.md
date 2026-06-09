# Electron アーキテクチャ詳細ドキュメント

> CoreLive Electron アプリケーションのアーキテクチャ、コード構成、実行フローの包括的な解説

**最終更新日:** 2026年1月11日  
**対象バージョン:** 0.1.0

---

## 目次

1. [アーキテクチャ概要](#1-アーキテクチャ概要)
2. [ファイル構成とコード解説](#2-ファイル構成とコード解説)
3. [起動シーケンス（時系列）](#3-起動シーケンス時系列)
4. [IPC通信アーキテクチャ](#4-ipc通信アーキテクチャ)
5. [セキュリティモデル](#5-セキュリティモデル)
6. [パフォーマンス最適化](#6-パフォーマンス最適化)
7. [デバッグ・トラブルシューティング](#7-デバッグトラブルシューティング)

---

## 1. アーキテクチャ概要

### 1.1 Full WebView アーキテクチャ

CoreLiveのElectronアプリは **Full WebView アーキテクチャ** を採用しています。これは従来の「Electronに埋め込みサーバーを持つ」アーキテクチャとは異なり、**Webアプリをそのまま表示するネイティブラッパー**として機能します。

```
┌─────────────────────────────────────────────────────────────┐
│ Electron Main Process (electron/main.cjs)                  │
│                                                             │
│  ├── ウィンドウ制御のみ (データIPC なし)                      │
│  ├── 認証同期 (preload API経由)                             │
│  ├── システム統合 (メニュー、トレイ、通知、ショートカット)     │
│  └── Deep Link / OAuth処理                                  │
│                                                             │
│ Electron Renderer (BrowserWindow)                          │
│  ├── 本番: https://corelive.app/ を直接ロード               │
│  ├── 開発: http://localhost:3011 をロード                   │
│  └── oRPC via HTTP (Webと同一のデータパス)                   │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 なぜ Full WebView なのか？

| メリット       | 説明                                       |
| -------------- | ------------------------------------------ |
| **コード削減** | 2,800行以上のIPC/データ処理コードを削除    |
| **一貫性**     | Web版とElectron版で同一のデータフロー      |
| **即時更新**   | サーバーデプロイで両プラットフォームに反映 |
| **保守性**     | 単一のoRPCクライアントコード               |

| デメリット             | 対策                           |
| ---------------------- | ------------------------------ |
| インターネット接続必須 | 将来的にオフラインサポート検討 |
| 認証同期の複雑さ       | preload APIで解決              |

### 1.3 プロセスモデル

Electronは複数のプロセスで動作します：

```
┌─────────────────────────────────────────────────────────┐
│                     Main Process                        │
│  (electron/main.cjs)                                    │
│  - Node.js フルアクセス                                  │
│  - OS API アクセス（ファイル、メニュー、通知等）          │
│  - BrowserWindow インスタンスの作成・管理                │
└────────────────────┬────────────────────────────────────┘
                     │ IPC (ipcMain ↔ ipcRenderer)
                     │ preload.cjs で API をブリッジ
                     ▼
┌─────────────────────────────────────────────────────────┐
│                   Renderer Process                      │
│  (BrowserWindow 内の Chromium)                          │
│  - Webコンテンツを表示                                   │
│  - window.electronAPI 経由でメインプロセスと通信         │
│  - Node.js アクセスなし（セキュリティ）                   │
└─────────────────────────────────────────────────────────┘
```

---

## 2. ファイル構成とコード解説

### 2.1 ファイル一覧と責務

```
electron/
├── main.cjs                      # 🎯 メインエントリポイント
├── dev-runner.cjs                # 🔧 開発用起動スクリプト
├── preload.cjs                   # 🔐 メインウィンドウ IPC ブリッジ
├── preload-floating.cjs          # 🔐 フローティングナビゲータ IPC ブリッジ
│
├── WindowManager.cjs             # 🪟 ウィンドウ管理
├── WindowStateManager.cjs        # 💾 ウィンドウ状態永続化
├── ConfigManager.cjs             # ⚙️ 設定管理
├── MenuManager.cjs               # 📋 アプリケーションメニュー
├── SystemTrayManager.cjs         # 🔔 システムトレイ
├── ShortcutManager.cjs           # ⌨️ グローバルショートカット
├── NotificationManager.cjs       # 📢 デスクトップ通知
├── DeepLinkManager.cjs           # 🔗 カスタムURLプロトコル
├── OAuthManager.cjs              # 🔑 OAuth認証フロー
├── AutoUpdater.cjs               # ⬆️ 自動アップデート
├── auth-manager.cjs              # 👤 認証状態管理
│
├── IPCErrorHandler.cjs           # ❌ IPCエラーハンドリング
├── SystemIntegrationErrorHandler.cjs # ⚠️ システム統合エラー
├── LazyLoadManager.cjs           # 🚀 遅延読み込み
├── MemoryProfiler.cjs            # 📊 メモリ監視
├── performance-config.cjs        # ⚡ パフォーマンス設定
├── logger.cjs                    # 📝 ログ出力
│
└── __tests__/                    # 🧪 テストファイル
    ├── main-process.test.mjs
    ├── preload-security.test.mjs
    └── ...
```

### 2.2 コアファイル詳細解説

#### 2.2.1 `main.cjs` - メインプロセスエントリポイント

**役割:** Electronアプリケーション全体のオーケストレーション

```javascript
// 主要な責務
const {
  app, // アプリケーションライフサイクル
  BrowserWindow, // ウィンドウ作成
  ipcMain, // IPC受信
  session, // セッション/セキュリティ
} = require('electron')

// マネージャーインスタンス（初期化順序が重要）
let configManager // 設定管理
let windowStateManager // ウィンドウ状態
let windowManager // ウィンドウ管理
let ipcErrorHandler // エラーハンドリング

// 遅延初期化マネージャー
let autoUpdater
let systemTrayManager
let notificationManager
// ... 他のマネージャー
```

**主要関数:**

| 関数                 | 責務                                     |
| -------------------- | ---------------------------------------- |
| `createWindow()`     | メインウィンドウ作成、マネージャー初期化 |
| `setupIPCHandlers()` | 全IPCハンドラーの登録                    |
| `setupSecurity()`    | CSP、パーミッション設定                  |
| `app.whenReady()`    | アプリ起動時の処理                       |

#### 2.2.2 `WindowManager.cjs` - ウィンドウ管理

**役割:** BrowserWindowインスタンスのライフサイクル管理

```javascript
class WindowManager {
  constructor(serverUrl, configManager, windowStateManager)

  // メインウィンドウ
  createMainWindow()     // ウィンドウ作成
  getMainWindow()        // インスタンス取得
  hasMainWindow()        // 存在確認

  // フローティングナビゲータ
  createFloatingNavigator()
  showFloatingNavigator()
  hideFloatingNavigator()
  toggleFloatingNavigator()

  // トレイ連携
  minimizeToTray()
  restoreFromTray()

  // クリーンアップ
  cleanup()
}
```

**ウィンドウ設定の特徴:**

```javascript
const mainWindow = new BrowserWindow({
  width: 1200,
  height: 800,
  titleBarStyle: 'hiddenInset', // macOS ネイティブ風
  webPreferences: {
    preload: path.join(__dirname, 'preload.cjs'),
    contextIsolation: true, // セキュリティ: 分離
    nodeIntegration: false, // セキュリティ: Node無効
    sandbox: true, // セキュリティ: サンドボックス
  },
})
```

#### 2.2.3 `preload.cjs` - IPCブリッジ

**役割:** レンダラープロセスに安全なAPIを公開

```javascript
const { contextBridge, ipcRenderer } = require('electron')

// 許可されたチャンネルのホワイトリスト（セキュリティ）
const ALLOWED_CHANNELS = [
  'window-close',
  'window-minimize',
  'auth-get-user',
  'auth-set-user',
  // ... 約80チャンネル
]

// セキュアなAPI公開
contextBridge.exposeInMainWorld('electronAPI', {
  // ウィンドウ操作
  window: {
    close: () => ipcRenderer.invoke('window-close'),
    minimize: () => ipcRenderer.invoke('window-minimize'),
    toggleFloatingNavigator: () =>
      ipcRenderer.invoke('window-toggle-floating-navigator'),
  },

  // 認証
  auth: {
    getUser: () => ipcRenderer.invoke('auth-get-user'),
    setUser: (user) => ipcRenderer.invoke('auth-set-user', user),
    syncFromWeb: (authData) =>
      ipcRenderer.invoke('auth-sync-from-web', authData),
  },

  // 通知
  notifications: {
    show: (title, body, options) =>
      ipcRenderer.invoke('notification-show', title, body, options),
    // ...
  },

  // ... 他のAPI
})
```

**セキュリティポイント:**

```javascript
// ✅ Good: チャンネルホワイトリストで検証
function validateChannel(channel) {
  if (!ALLOWED_CHANNELS.includes(channel)) {
    throw new Error(`Invalid IPC channel: ${channel}`)
  }
}

// ✅ Good: データサニタイズ
function sanitizeData(data) {
  // 循環参照や危険なプロパティを除去
  return JSON.parse(JSON.stringify(data))
}
```

#### 2.2.4 `ConfigManager.cjs` - 設定管理

**役割:** ユーザー設定の永続化と管理

```javascript
class ConfigManager {
  constructor()

  // 設定の読み書き
  get(key)
  set(key, value)
  getSection(section)
  getAll()

  // 設定ファイル操作
  loadConfig()
  saveConfig()
  backup()
  reset()

  // マイグレーション
  migrateConfig()
}
```

**設定ファイルの場所:**

- macOS: `~/Library/Application Support/CoreLive/config.json`

> **Note:** This app only supports macOS.

#### 2.2.5 `MenuManager.cjs` - アプリケーションメニュー

**役割:** macOSメニューバーの構築と管理

```javascript
class MenuManager {
  constructor()

  // メニュー構築
  createApplicationMenu()
  createAppMenu()        // CoreLive メニュー
  createFileMenu()       // ファイル
  createEditMenu()       // 編集
  createViewMenu()       // 表示
  createWindowMenu()     // ウィンドウ
  createHelpMenu()       // ヘルプ

  // アクション
  handleMenuAction(action)
  toggleFloatingNavigator()
  showAboutDialog()
}
```

#### 2.2.6 `SystemTrayManager.cjs` - システムトレイ

**役割:** メニューバー/システムトレイアイコンの管理

```javascript
class SystemTrayManager {
  constructor(windowManager)

  // トレイ操作
  createTray()
  setTrayIconState(state)  // 'active', 'disabled', 'notification'
  setTrayTooltip(text)
  updateTrayMenu(tasks)
  showNotification(title, body)

  // 状態管理
  hasTray()
  isSystemTraySupported()
  enableFallbackMode()
}
```

#### 2.2.7 `DeepLinkManager.cjs` - カスタムURLプロトコル

**役割:** `corelive://` プロトコルの処理

```javascript
class DeepLinkManager {
  constructor(windowManager)

  // プロトコル処理
  registerProtocol()        // corelive:// を登録
  handleDeepLink(url)       // URL解析と処理
  parseDeepLinkUrl(url)     // URL パース

  // アクション
  handleCreateAction(params)   // corelive://create?title=...
  handleViewAction(params)     // corelive://view/task/123
  handleSearchAction(params)   // corelive://search?q=...
  handleOAuthCallback(url)     // corelive://oauth/callback

  // ユーティリティ
  generateDeepLink(action, params)
  getExampleUrls()
}
```

**対応URL形式:**

| URL                                | 説明               |
| ---------------------------------- | ------------------ |
| `corelive://create?title=タスク名` | 新規タスク作成     |
| `corelive://view/task/123`         | タスク表示         |
| `corelive://search?q=検索語`       | タスク検索         |
| `corelive://oauth/callback?...`    | OAuth コールバック |

#### 2.2.8 `OAuthManager.cjs` - OAuth認証

**役割:** Google等のOAuth認証フローの処理

```javascript
class OAuthManager {
  constructor(windowManager, notificationManager)

  // OAuth フロー
  startOAuthFlow(provider)     // 認証開始
  handleOAuthCallback(url)     // コールバック処理
  exchangeCodeForSession(code) // トークン交換

  // PKCE サポート
  generatePKCE()
  generateState()

  // プロバイダー
  getSupportedProviders()  // ['google', 'github']
  isProviderSupported(provider)
}
```

---

## 3. 起動シーケンス（時系列）

### 3.1 開発環境の起動フロー

```
pnpm electron:dev
      │
      ▼
┌─────────────────────────────────────────────────────────────┐
│ 1. scripts/dev.js                                          │
│    - Next.js開発サーバーを起動                              │
│    - ポート3011で待機                                       │
└────────────────────┬────────────────────────────────────────┘
                     │ Next.js Ready
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. electron/dev-runner.cjs                                 │
│    - Next.jsの起動を確認 (checkServer)                     │
│    - Electronプロセスを起動                                 │
└────────────────────┬────────────────────────────────────────┘
                     │ Electron Start
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. electron/main.cjs 初期化                                │
│                                                             │
│    3.1 モジュール読み込み                                    │
│        - ConfigManager, WindowManager 等をrequire          │
│        - logger, memoryProfiler 初期化                     │
│                                                             │
│    3.2 早期イベント登録                                      │
│        - app.on('open-url') - Deep Link受信用              │
│        - シングルインスタンスロック取得                      │
└────────────────────┬────────────────────────────────────────┘
                     │ app.whenReady()
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. createWindow() - クリティカル初期化                      │
│                                                             │
│    4.1 コアマネージャー初期化（順序重要）                    │
│        ① IPCErrorHandler                                   │
│        ② ConfigManager                                     │
│        ③ WindowStateManager                                │
│        ④ WindowManager                                     │
│                                                             │
│    4.2 メインウィンドウ作成                                  │
│        - BrowserWindow インスタンス生成                     │
│        - preload.cjs 読み込み                               │
│        - http://localhost:3011 をロード                     │
└────────────────────┬────────────────────────────────────────┘
                     │ ウィンドウ表示
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ 5. setupIPCHandlers() - IPCハンドラー登録                   │
│                                                             │
│    - window-* (ウィンドウ操作)                              │
│    - auth-* (認証)                                          │
│    - config-* (設定)                                        │
│    - notification-* (通知)                                  │
│    - ... 約50個のハンドラー                                 │
└────────────────────┬────────────────────────────────────────┘
                     │ setImmediate (遅延実行)
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ 6. 遅延初期化 (Deferred Init)                               │
│                                                             │
│    6.1 LazyLoadManager経由で非クリティカルモジュール読み込み │
│        - SystemIntegrationErrorHandler                     │
│        - MenuManager                                        │
│        - SystemTrayManager                                  │
│        - NotificationManager                                │
│        - ShortcutManager                                    │
│                                                             │
│    6.2 各マネージャーの初期化                                │
│        - メニュー構築                                        │
│        - システムトレイ作成                                  │
│        - グローバルショートカット登録                        │
│                                                             │
│    6.3 DeepLinkManager / OAuthManager 初期化                │
│        - corelive:// プロトコル登録                         │
│        - 保留中のDeep Link処理                              │
└────────────────────┬────────────────────────────────────────┘
                     │ setupSecurity()
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ 7. セキュリティ設定                                          │
│                                                             │
│    - Content Security Policy (CSP) 適用                    │
│    - パーミッションハンドラー設定                            │
│    - WebContents セキュリティフック                         │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
            ✅ アプリケーション準備完了
```

### 3.2 本番環境の起動フロー

本番環境では `scripts/dev.js` と `dev-runner.cjs` をスキップし、直接 `main.cjs` が実行されます：

```
CoreLive.app 起動
      │
      ▼
┌─────────────────────────────────────────────────────────────┐
│ electron/main.cjs                                          │
│                                                             │
│ serverUrl = null (未設定)                                   │
│ → WindowManager が https://corelive.app/ をロード           │
└─────────────────────────────────────────────────────────────┘
```

### 3.3 アプリ使用中の実行フロー

ユーザー操作からの典型的なフロー：

```
┌─────────────────────────────────────────────────────────────┐
│ ユーザーアクション: TODOを追加                               │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ Renderer Process (Next.js アプリ)                          │
│                                                             │
│ 1. フォーム送信                                              │
│ 2. oRPC クライアント呼び出し                                 │
│    client.todo.create({ text: "新しいタスク" })             │
└────────────────────┬────────────────────────────────────────┘
                     │ HTTP POST to /api/orpc/todo.create
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ Next.js サーバー (corelive.app)                             │
│                                                             │
│ 1. oRPC ルートハンドラー                                     │
│ 2. Prisma でデータベース操作                                 │
│ 3. レスポンス返却                                            │
└────────────────────┬────────────────────────────────────────┘
                     │ HTTP Response
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ Renderer Process                                            │
│                                                             │
│ 1. React Query がキャッシュ更新                              │
│ 2. UI 再レンダリング                                         │
└─────────────────────────────────────────────────────────────┘
```

---

## 4. IPC通信アーキテクチャ

### 4.1 IPCチャンネル一覧

#### ウィンドウ操作 (`window-*`)

| チャンネル                       | 方向 | 説明                           |
| -------------------------------- | ---- | ------------------------------ |
| `window-close`                   | R→M  | ウィンドウを閉じる             |
| `window-minimize`                | R→M  | 最小化                         |
| `window-show-floating-navigator` | R→M  | フローティングナビゲータ表示   |
| `window-hide-floating-navigator` | R→M  | フローティングナビゲータ非表示 |

#### 認証 (`auth-*`)

| チャンネル           | 方向 | 説明                  |
| -------------------- | ---- | --------------------- |
| `auth-get-user`      | R→M  | 現在のユーザー取得    |
| `auth-set-user`      | R→M  | ユーザー情報設定      |
| `auth-sync-from-web` | R→M  | Webセッションから同期 |
| `auth-logout`        | R→M  | ログアウト            |

#### 通知 (`notification-*`)

| チャンネル                        | 方向 | 説明     |
| --------------------------------- | ---- | -------- |
| `notification-show`               | R→M  | 通知表示 |
| `notification-get-preferences`    | R→M  | 設定取得 |
| `notification-update-preferences` | R→M  | 設定更新 |

#### OAuth (`oauth-*`)

| チャンネル      | 方向 | 説明       |
| --------------- | ---- | ---------- |
| `oauth-start`   | R→M  | OAuth開始  |
| `oauth-success` | M→R  | 成功通知   |
| `oauth-error`   | M→R  | エラー通知 |

### 4.2 IPC通信パターン

#### パターン1: invoke/handle (リクエスト/レスポンス)

```javascript
// Main Process (main.cjs)
ipcMain.handle('auth-get-user', async () => {
  return activeUser
})

// Preload (preload.cjs)
contextBridge.exposeInMainWorld('electronAPI', {
  auth: {
    getUser: () => ipcRenderer.invoke('auth-get-user'),
  },
})

// Renderer (React)
const user = await window.electronAPI.auth.getUser()
```

#### パターン2: send/on (一方向イベント)

```javascript
// Main Process → Renderer
mainWindow.webContents.send('auth-state-changed', { user })

// Preload
contextBridge.exposeInMainWorld('electronAPI', {
  onAuthStateChanged: (callback) =>
    ipcRenderer.on('auth-state-changed', (_event, data) => callback(data)),
})

// Renderer
window.electronAPI.onAuthStateChanged((data) => {
  console.log('Auth changed:', data)
})
```

---

## 5. セキュリティモデル

### 5.1 セキュリティ原則

| 原則                         | 実装                     |
| ---------------------------- | ------------------------ |
| **Context Isolation**        | `contextIsolation: true` |
| **Node Integration 無効**    | `nodeIntegration: false` |
| **サンドボックス**           | `sandbox: true`          |
| **チャンネルホワイトリスト** | `ALLOWED_CHANNELS` 配列  |

### 5.2 Content Security Policy (CSP)

```javascript
const CSP_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://clerk.corelive.app ...",
  "connect-src 'self' http://localhost:* https://clerk.corelive.app ...",
  "frame-src 'self' https://clerk.corelive.app ...",
  "object-src 'none'",
].join('; ')
```

### 5.3 パーミッション管理

```javascript
// リクエストハンドラ - 明示的に許可したもののみ通過
session.defaultSession.setPermissionRequestHandler(
  (_webContents, permission, callback) => {
    const allowedPermissions = ['notifications']
    callback(allowedPermissions.includes(permission))
  },
)

// チェックハンドラ - デフォルト拒否
session.defaultSession.setPermissionCheckHandler(() => false)
```

---

## 6. パフォーマンス最適化

### 6.1 遅延読み込み (Lazy Loading)

非クリティカルなモジュールは `LazyLoadManager` 経由で遅延読み込み：

```javascript
// 起動時は読み込まない
const MenuManager = await lazyLoadManager.loadComponent('MenuManager')
```

**遅延読み込み対象:**

- MenuManager
- SystemTrayManager
- NotificationManager
- ShortcutManager
- AutoUpdater
- DeepLinkManager
- OAuthManager

### 6.2 メモリ監視

`MemoryProfiler` がメモリ使用量を監視し、しきい値超過時にクリーンアップ：

```javascript
memoryProfiler.startMonitoring({
  interval: 30000, // 30秒ごと
  threshold: 512, // 512MB でアラート
})
```

### 6.3 パフォーマンス設定

環境に応じた最適化レベル：

```javascript
const OPTIMIZATION_LEVELS = {
  development: {
    enableMemoryMonitoring: false,
    lazyLoadDelay: 0, // 即座にロード
  },
  production: {
    enableMemoryMonitoring: true,
    lazyLoadDelay: 500, // 500ms 遅延
  },
}
```

---

## 7. デバッグ・トラブルシューティング

### 7.1 ログ確認

`logger.cjs` は Pino を使用した構造化ログを出力：

```javascript
const { log } = require('./logger.cjs')

log.info('Message', { data })
log.error('Error', error)
log.debug('Debug info')
```

**開発環境:** コンソールにカラー出力  
**本番環境:** JSON形式でファイル出力

### 7.2 DevTools を開く / パッケージ版をデバッグモードで起動

開発環境（`pnpm electron:dev`）では自動的に DevTools が開きます。

**パッケージ版（署名/公証済みビルド）は secure-by-default です（Issue #61）。** 既定では全ウィンドウ（main / floating / braindump / settings）で DevTools が**無効**で、リモートデバッグポートも開きません。そのため既定状態では `View → Toggle Developer Tools`（Cmd+Option+I）は**何も起きません**（以前の main ウィンドウは常時 `devTools: true` だったため開けましたが、この挙動は変更されました）。

パッケージ版をデバッグするには、起動時にオプトインの環境変数を渡します。これにより **全ウィンドウの DevTools が有効**になり、かつ **Chrome DevTools Protocol（CDP）ポート**が開きます。

```bash
# DevTools を有効化 + CDP ポート(既定 9222)を開いて起動
CORELIVE_DEBUG=1 /Applications/CoreLive.app/Contents/MacOS/CoreLive

# dev ビルド(electron:build:dir)の .app をデバッグ起動する場合
CORELIVE_DEBUG=1 dist/mac-arm64/CoreLive.app/Contents/MacOS/CoreLive

# CDP ポートを変更したい場合(任意・1〜65535)
CORELIVE_DEBUG=1 CORELIVE_REMOTE_DEBUGGING_PORT=9333 \
  /Applications/CoreLive.app/Contents/MacOS/CoreLive
```

> **Note:** macOS の `open -a CoreLive` は環境変数をアプリへ確実に渡せないため、上記のように **実行バイナリを直接起動**してください。

起動後の確認：

- **DevTools:** `View → Toggle Developer Tools`（Cmd+Option+I）が各ウィンドウで開けるようになります。
- **CDP（外部ツール接続）:** Chrome で `chrome://inspect` を開く、または `curl http://localhost:<PORT>/json`（既定: `9222`、`CORELIVE_REMOTE_DEBUGGING_PORT` 指定時はその値）でターゲット一覧が返ればポートが開いています。

| レバー                            | 何が有効になるか                              | 既定値  | どこで判定                    |
| --------------------------------- | --------------------------------------------- | ------- | ----------------------------- |
| `CORELIVE_DEBUG=1`                | 全ウィンドウの DevTools + CDP ポート          | 無効    | `electron/utils/debugMode.ts` |
| `CORELIVE_REMOTE_DEBUGGING_PORT`  | CDP ポート番号の上書き（要 `CORELIVE_DEBUG`） | `9222`  | `resolveRemoteDebuggingPort`  |
| `advanced.enableDevTools`（設定） | DevTools のみ（CDP ポートは開かない）         | `false` | `isDevToolsEnabled`           |

> **セキュリティ上の区別:** 永続設定 `advanced.enableDevTools` は DevTools の表示のみを切り替え、**CDP リモートデバッグポートは決して開きません**。常時開放される localhost デバッグポートは攻撃面になり得るため、ポート開放は毎回の起動時オプトイン（`CORELIVE_DEBUG`）を必須にしています。E2E 用の `PLAYWRIGHT_REMOTE_DEBUGGING_PORT` は従来どおり独立して機能します。

### 7.3 IPCデバッグ

`IPCErrorHandler` が全IPCエラーを記録：

```javascript
ipcErrorHandler.getStats()
// {
//   totalCalls: 150,
//   errors: 2,
//   successRate: 98.67,
//   commonErrors: [...]
// }
```

### 7.4 よくある問題

| 問題               | 原因             | 解決策                                                              |
| ------------------ | ---------------- | ------------------------------------------------------------------- |
| ウィンドウが白い   | CSP違反          | DevTools Console でエラー確認（パッケージ版は §7.2 でデバッグ起動） |
| IPC応答なし        | チャンネル未登録 | `ALLOWED_CHANNELS` 確認                                             |
| トレイアイコンなし | アイコンパス誤り | `build/icons/` 確認                                                 |
| Deep Link未動作    | プロトコル未登録 | `app.isDefaultProtocolClient` 確認                                  |

---

## 参考資料

- [Electron 公式ドキュメント](https://www.electronjs.org/docs/latest/)
- [Electron セキュリティガイド](https://www.electronjs.org/docs/latest/tutorial/security)
- [contextBridge API](https://www.electronjs.org/docs/latest/api/context-bridge)
- [IPC 通信](https://www.electronjs.org/docs/latest/tutorial/ipc)

---

**ドキュメント作成:** AI Assistant (Claude)  
**検証:** 手動検証推奨
