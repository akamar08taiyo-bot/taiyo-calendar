# 居宅カレンダー（APIなし版）

通信するアプリケーションAPIやデータベースを使わず、Excelの読込・訪問記録・集計をブラウザー内で処理します。

## 起動

```sh
npm install
npm run dev
```

## 本番ビルド

```sh
npm run build
```

訪問記録は使用中のブラウザーの localStorage に保存されます。別端末とは自動同期されません。
