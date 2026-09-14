#!/usr/bin/env bash
# 把蓝鲸品牌覆盖注入 TurboWarp 构建产物(build/editor.html)。
# 每次重建 TurboWarp(npm run build)后重跑本脚本即可重新贴品牌。幂等。
#   用法: scratch-brand/apply-brand.sh [build目录，默认 ../scratch-gui/build]
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
BUILD="${1:-$HERE/../scratch-gui/build}"

[ -f "$BUILD/editor.html" ] || { echo "✗ 找不到 $BUILD/editor.html —— 先构建 TurboWarp(npm run build)"; exit 1; }

# 覆盖资源拷进 build/
cp "$HERE/brand.css" "$HERE/brand.js" "$HERE/lanjing-default.sb3" "$BUILD/"
echo "✓ 已拷入 brand.css / brand.js / lanjing-default.sb3"

# 幂等注入 <link>/<script>
if grep -q 'brand.js' "$BUILD/editor.html"; then
  echo "✓ editor.html 已注入过(仅刷新了资源)"
else
  perl -0pi -e 's#</head>#  <link rel="stylesheet" href="brand.css">\n</head>#' "$BUILD/editor.html"
  perl -0pi -e 's#</body>#  <script src="brand.js"></script>\n</body>#' "$BUILD/editor.html"
  echo "✓ 已注入品牌覆盖到 editor.html"
fi
