# K-OS-ERI (Enriched Response Integration)

このプロジェクトは [dai-motoki/kamuios](https://github.com/dai-motoki/kamuios) からフォークし、追加機能を実装した拡張版です。

**ERI** は "**Enriched Response Integration**"（豊富化された応答統合）を意味し、AIとの対話やメディア処理において、より豊かで統合された応答体験を提供することを表しています。

## 元プロジェクトについて

KamuiOSは、Hugoベースの静的サイトジェネレーターを使用したWebアプリケーションプラットフォームです。

## 追加機能

### 1. Direct Drawing Generator
AIで高品質な画像を生成するダイレクトドローイングツール
- リアルタイム描画
- 多彩なブラシツール
- AIによる補正・生成

### 2. Story Gen
プロンプトからストーリーと画像を生成するAIストーリージェネレーター
- テキストからストーリー生成
- シーンごとの画像生成
- ビデオエクスポート
- 保存・読み込み機能（APIエンドポイント `/api/story-gen/save`, `/api/story-gen/load/:saveId`, `/api/story-gen/list`）

### 3. Dynamic Media Gallery の機能強化
- レスポンシブデザイン対応
- モバイル端末でのサイドバー表示最適化
- 選択モード機能（メディアアイテムの選択と親画面への送信）
- UIの改善とパフォーマンス最適化

### 4. システム改善
- **起動スクリプトの強化**: `screen`を使用したバックグラウンド実行、クロスプラットフォーム対応のブラウザ自動起動
- **環境変数の追加**: MCPサーバーのベースURL、画像アップロード機能の設定
- **依存関係の追加**: `fs-extra`、`js-yaml`パッケージ
- **サーバー機能拡張**: Node.js backend serverとメインサーバーの並行動作

#### 追加機能の環境変数設定

以下の環境変数を `.env` ファイルに追加することで、拡張機能が利用できます：

```bash
# MCP (Model Context Protocol) サーバー設定
MCP_BASE_URL=https://your-mcp-server.com

# Kamui Code URL設定（フロントエンド・MCP許可ホスト用）
KAMUI_CODE_URL=your-kamui-code-domain.com

# 画像アップロード機能設定（オプション）
UPLOAD_URL=https://your-upload-server.com
UPLOAD_API_KEY=your-api-key
```

これらの設定により、以下の機能が有効になります：
- **MCP_BASE_URL**: MCPサーバーとの連携機能
- **KAMUI_CODE_URL**: フロントエンドでのKamui Code統合
- **UPLOAD_URL/UPLOAD_API_KEY**: 画像アップロード機能（Story GenとDirect Drawing Generatorで使用）

### 5. UI/UX改善
- ヘッダーアクションボタンのレスポンシブ対応
- モバイル表示時のボタン配置最適化
- ダッシュボードへの新機能カード追加

## 技術的な変更点

詳細な技術的変更点については、`Refactoring_and_Feature_Additions.md` をご参照ください。このドキュメントには、元プロジェクトから追加・変更されたファイルの詳細な差分情報が記載されています。

## インストールと起動

```bash
# 依存関係のインストール
npm install

# 環境変数の設定（.env.sampleをコピーして.envを作成）
cp .env.sample .env

# すべてのサービスを起動
./start_all.sh
```

## ライセンス

元プロジェクトのライセンスに従います。