# utsukuba

筑波大学向けの read-only CLI です。manaba、KDB、TWINS/CAMPUSSQUARE、履修要件・履修計画を扱います。

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
bun install -g github:tka1utjp/utsukuba-cli
```

更新するとき:

```sh
bun install -g github:tka1utjp/utsukuba-cli
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
utsukuba twins login
utsukuba twins doctor --pretty
```

manaba と TWINS は同じID/パスワードを使う前提です。セッション Cookie はサービス別に保存し、再ログイン用の資格情報は macOS Keychain に保存します。

- Cookie: `~/.utsukuba-cli/profiles/<profile>/<service>/auth.json`
- Keychain credential service: `utsukuba-cli`

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

## KDB

```sh
utsukuba kdb courses --year 2026 --query GC11601 --include-syllabus --pretty
utsukuba kdb syllabus show GC11601 --year 2026 --lang jpn --pretty
utsukuba kdb syllabus html GC11601 --year 2026 --lang jpn
```

KDB は公開情報として扱うためログイン不要です。検索はKDBの `SB0070`、シラバス表示は `SB0220` の実ページと同じPOSTパラメータを使います。

## TWINS

```sh
utsukuba twins login
utsukuba twins profile --pretty
utsukuba twins menus --pretty
utsukuba twins registrations --pretty
utsukuba twins grades --pretty
utsukuba twins summary --pretty
utsukuba twins html --url "portal.do?page=main"
```

TWINS はCAMPUSSQUAREのメニュー/flowIdがログイン後HTMLに依存するため、`registrations` と `grades` は通常メニューから自動検出します。検出できない場合や保存HTMLを解析したい場合だけ、`--url <path-or-url>` で対象ページを明示できます。

`summary` はTWINS成績からGPA、修得単位、未修得単位、履修中単位を集計します。GPAは筑波大学のGP表に合わせて `A+=4.3 / A=4 / B=3 / C=2 / D=0` を使い、`P` と `F` はGPA分母から外します。

## Requirements and Planning

履修要件はCLIが解釈しやすいJSONにしてから取り込みます。

```json
{
  "program": "情報学群 情報科学類",
  "admissionYear": "2025",
  "categories": [
    { "id": "major", "name": "専門", "minCredits": 20, "coursePrefixes": ["GE"] }
  ],
  "courseRules": [],
  "notes": []
}
```

```sh
utsukuba requirements fetch-handbook --year 2025 --pretty
utsukuba requirements import --file requirements.json --name default
utsukuba requirements show --name default --pretty
utsukuba plan progress --grades grades.json --registrations registrations.json --pretty
utsukuba plan recommend --courses kdb-courses.json --grades grades.json --registrations registrations.json --pretty
```

## Repo Skills

複雑な判断はCLI本体に埋め込まず、Repo内Skillとして分けています。

- `skills/utsukuba-requirements`: 履修要件資料をCLI用JSONへ構造化
- `skills/utsukuba-course-planning`: TWINS/KDB/要件JSONから履修計画とおすすめ候補を作成
- `skills/utsukuba-manaba-context`: manabaコースとKDBシラバスを結合して文脈化
