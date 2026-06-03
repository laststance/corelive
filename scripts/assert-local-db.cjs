/**
 * 破壊的DB操作（prisma migrate reset --force / migrate dev）の直前ゲート。接続先がローカルDocker以外なら問答無用で停止する。
 *
 * なぜ存在する: dev の POSTGRES_PRISMA_URL が本番(Neon)を指し得るため、E2E や手打ちの `pnpm db:reset` / `pnpm prisma:migrate` が
 *   本番URLを継承して走ると本番DBを一発で全消しする事故が起きうる。その単一チョークポイント。
 * いつ発火: package.json の `db:reset` / `db:truncate` / `prisma:migrate` の先頭で `node scripts/assert-local-db.cjs && ...` として実行される。
 * 何が呼ぶ: E2E global-setup / global-teardown / db.ts(resetDatabase) / そして人間が打つ手動コマンド、すべてがここを通る。
 *
 * 方針は allowlist（fail closed）: 「本番っぽければ止める」ではなく「ローカルだと証明できた時だけ通す」。
 * prod のURL書式が変わっても、ローカルと確証できなければ exit(1) する。
 *
 * パーサ差分への注意: ホスト判定は WHATWG `new URL().hostname` で行うが、prisma/libpq は接続文字列の
 *   `?host=` / `?hostname=` 接続パラメータを honor してそちら "へ" 接続する（WHATWG はこれを `.hostname` に
 *   反映しない）。素朴な hostname チェックだけだと `postgresql://localhost/db?host=prod.neon.tech` が
 *   「localhost だから許可」で通り、prisma は prod を全消しする fail-OPEN になる。ゆえに query 上の host も
 *   ローカル許可リストで検証し、パーサが割れるバックスラッシュ入りURLは安全側に倒して停止する。
 */

// prisma.config.ts と同じく .env を読み込んでから判定する（手動 `pnpm db:reset` 時、URLが .env 内にしか無いケースを揃えるため）
require('dotenv').config()

// ローカルとみなして破壊操作を許可するホスト名のホワイトリスト（Docker compose / localhost のみ）。
// 0.0.0.0 は「全インターフェースにbindする」アドレスでクライアントのダイヤル先として意味を持たないため除外。
const ALLOWED_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '::1', // libpq/query 上の IPv6 ループバック表記
  '[::1]', // WHATWG `new URL().hostname` が返すブラケット付き IPv6 ループバック表記
  'postgres', // docker-compose のサービス名
  'corelive-postgres', // コンテナ名
])

// prisma.config.ts の解決順を完全に再現（POSTGRES_PRISMA_URL → DATABASE_URL）
const rawUrl = process.env.POSTGRES_PRISMA_URL || process.env.DATABASE_URL || ''

function abort(reason) {
  console.error('\n🛑 [assert-local-db] 破壊的DB操作を中止しました。')
  console.error(`   理由: ${reason}`)
  console.error(
    '   db:reset / db:truncate / prisma:migrate はローカルDocker（localhost:5432）にのみ許可されています。',
  )
  console.error(
    '   接続先が本番(Neon等)に向いていないか POSTGRES_PRISMA_URL を確認してください。\n',
  )
  process.exit(1)
}

// ローカル(=このマシン)と確証できるホスト値か。Unixソケットのディレクトリ(先頭 '/')は同一マシン上なのでローカル扱い。
function isLocalHost(value) {
  const h = value.trim()
  if (h.startsWith('/')) return true
  return ALLOWED_HOSTS.has(h)
}

if (!rawUrl) {
  abort(
    'POSTGRES_PRISMA_URL / DATABASE_URL が未設定（ローカルだと確証できない）',
  )
}

// バックスラッシュは WHATWG と libpq で authority の切れ目の解釈が割れる（パーサ差分）。正当なローカル接続文字列には
// 出現しないので、曖昧なパースを信用せず安全側に倒して停止する。
if (rawUrl.includes('\\')) {
  abort(
    '接続URLにバックスラッシュが含まれます（パーサ間で解釈が割れるため安全側に停止）。',
  )
}

let parsed
try {
  // postgresql:// も WHATWG URL でホスト名を取得できる。パスワードの特殊文字等で壊れたら catch 側で fail closed。
  parsed = new URL(rawUrl)
} catch (err) {
  abort(
    `接続URLをパースできませんでした（${err.message}）。安全側に倒して停止します。`,
  )
}

// libpq/prisma が実際に接続する先は query 上の host が指定されていればそちらが勝つ。authority の hostname だけでなく
// query 上の host(複数・カンマ区切り含む)も全てローカルでなければ停止する（CRITICAL fail-open の封じ込め）。
const queryHosts = [
  ...parsed.searchParams.getAll('host'),
  ...parsed.searchParams.getAll('hostname'),
]
for (const qh of queryHosts) {
  // libpq はカンマ区切りのマルチホストを許す。1つでも非ローカルなら停止。
  for (const entry of qh.split(',')) {
    if (!isLocalHost(entry)) {
      abort(
        `接続URLの ?host=/?hostname= が "${entry.trim()}" を指しています（ローカル許可リスト外）。prisma はこちらに接続するため停止します。`,
      )
    }
  }
}

const host = parsed.hostname
if (!ALLOWED_HOSTS.has(host)) {
  abort(`接続先ホスト "${host}" はローカル許可リストに含まれません`)
}

// ここまで来たらローカルと確証できた → 破壊操作を許可
// eslint-disable-next-line no-console -- ゲートが実際に走り host を許可した確認をCI/ローカルログに残すための意図的な情報出力
console.log(
  `✅ [assert-local-db] 接続先ホスト "${host}" はローカル。db:reset を許可します。`,
)
