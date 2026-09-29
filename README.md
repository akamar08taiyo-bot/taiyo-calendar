# 居宅カレンダー（APIなし版）

通信するアプリケーションAPIやデータベースを使わず、Excelの読込・訪問記録・集計をブラウザー内で処理します。

## 起動

```sh
npm install
npm run dev
```

## 本番ビルド・公開用ファイルの更新

```sh
npm run build:docs
```

`vite build` で `dist/` を作り、GitHub Pages で公開している `docs/` を `dist/` の内容で置き換えます。
ソースを直したら、このコマンドで `docs/` も作り直してコミットしてください（`docs/` を更新しないと公開中の画面には反映されません）。

### 旧形式Excel（.xls）の読込ライブラリについて

`.xls` の読込には SheetJS（`xlsx`）を使います。npm に公開されている `xlsx@0.18.5` には既知の脆弱性があるため、
SheetJS 公式配布の 0.20.3（`https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`）を `package.json` に指定しています。
`npm install` は `cdn.sheetjs.com` からダウンロードするため、このサイトへ接続できる環境で実行してください。

訪問記録は使用中のブラウザーの localStorage に保存されます。別端末とは自動同期されません。
