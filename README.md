# utsukuba

筑波大学 manaba 向けの read-only CLI です。ログイン、課題一覧、コース一覧、資料ファイル一覧、認証付きダウンロードを扱います。

## Local Development Install

このリポジトリを直接触る開発者向けです。

```sh
bun install
cd packages/cli
bun link
```

これで `~/.bun/bin/utsukuba` と `~/.bun/bin/manaba` が作られます。`~/.bun/bin` が PATH に入っていれば、どこからでも実行できます。

```sh
utsukuba --help
utsukuba login
utsukuba tasks list
```

## Install From GitHub

リポジトリを GitHub に置いた後は、利用者は次の形でインストールできます。

```sh
bun install -g github:<owner>/<repo>
```

例:

```sh
bun install -g github:tka1utjp/manaba-cli
```

更新するとき:

```sh
bun install -g github:tka1utjp/manaba-cli
```

アンインストール:

```sh
rm -f ~/.bun/bin/utsukuba ~/.bun/bin/manaba
```

## Single Binary Distribution

Bun を入れていない人には、単一バイナリを配れます。

```sh
bun run build
./dist/utsukuba --help
```

作られた `dist/utsukuba` を配布します。macOS でビルドしたバイナリは基本的に同じOS/CPU向けです。複数OS向けに配る場合は GitHub Actions で OS ごとにビルドしてください。

利用者側で PATH に置く例:

```sh
mkdir -p ~/.local/bin
cp utsukuba ~/.local/bin/utsukuba
chmod +x ~/.local/bin/utsukuba
```

## First Login

```sh
utsukuba login
utsukuba login --check --pretty
```

ID/PASS は `~/.manaba-cli` には保存しません。セッション Cookie は `~/.manaba-cli/profiles/<profile>/auth.json` に保存し、再ログイン用の資格情報は macOS Keychain に保存します。

## Common Commands

```sh
utsukuba tasks list --pretty
utsukuba courses list --pretty
utsukuba quizzes list <courseId> --pretty
utsukuba reports list <courseId> --pretty
utsukuba contents list <courseId> --pretty
utsukuba files list <courseId> --pretty
utsukuba files download "<file-url>" --out ./downloads
```
