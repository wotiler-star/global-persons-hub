#!/usr/bin/env bash
# ============================================================
# upload-shards.sh  —  把 deploy/dist/shards/part*.zip 上传到 GitHub Release
# 用法（本机执行）：
#   GITHUB_TOKEN=ghp_xxx bash deploy/upload-shards.sh
# 依赖：curl、gh 可选；需要 release 已存在（deploy/.release_id 记录 RELEASE_ID）
# 注意：直连 GitHub，勿走代理（代理会截断大文件）。
# ============================================================
set -euo pipefail
# Windows schannel 在部分网络下会因无法访问吊销服务器而 TLS 握手失败，关闭吊销检查
unset http_proxy https_proxy
CURL_OPT=(--ssl-no-revoke)

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIST_DIR="$REPO_ROOT/deploy/dist"
SHARD_DIR="$DIST_DIR/shards"
RELEASE_ID_FILE="$REPO_ROOT/deploy/.release_id"

: "${GITHUB_TOKEN:?请设置 GITHUB_TOKEN 环境变量（GitHub PAT，需 repo 权限）}"
OWNER_REPO="wotiler-star/global-persons-hub"
RELEASE_BASE="https://github.com/$OWNER_REPO/releases/download/deploy"

if [[ ! -f "$RELEASE_ID_FILE" ]]; then
  echo "ERROR: 找不到 deploy/.release_id（请先创建 deploy release）" >&2
  exit 1
fi
RELEASE_ID="$(cat "$RELEASE_ID_FILE")"

# 已上传资源清单（用于去重，避免重复上传）
EXISTING=$(curl -s "${CURL_OPT[@]}" -H "Authorization: Bearer $GITHUB_TOKEN" \
  "https://api.github.com/repos/$OWNER_REPO/releases/$RELEASE_ID/assets" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print('\n'.join(a['name'] for a in d))" 2>/dev/null || true)

shopt -s nullglob
shards=("$SHARD_DIR"/part*.zip)
if [[ ${#shards[@]} -eq 0 ]]; then
  echo "ERROR: 未找到分片，请先运行 package.ps1" >&2
  exit 1
fi

for f in "${shards[@]}"; do
  name="$(basename "$f")"
  if echo "$EXISTING" | grep -qx "$name"; then
    echo "skip (already uploaded): $name"
  else
    echo "uploading: $name"
    # Windows Git Bash 下 curl 是原生二进制，@ 无法读 Unix 路径，需用 cygpath -w 转换
    winf="$(cygpath -w "$f")"
    curl -s "${CURL_OPT[@]}" -X POST \
      -H "Authorization: Bearer $GITHUB_TOKEN" \
      -H "Content-Type: application/octet-stream" \
      --upload-file "$winf" \
      "https://uploads.github.com/repos/$OWNER_REPO/releases/$RELEASE_ID/assets?name=$name"
    echo ""
  fi
done

# 写 shard_info.json 供 tat-deploy.py 使用
SHARD_COUNT=${#shards[@]}
EXPECTED_SIZE=0
for f in "${shards[@]}"; do
  EXPECTED_SIZE=$((EXPECTED_SIZE + $(stat -c%s "$f")))
done
cat > "$DIST_DIR/shard_info.json" <<EOF
{
  "release_base": "$RELEASE_BASE",
  "shard_count": $SHARD_COUNT,
  "expected_size": $EXPECTED_SIZE,
  "release_id": $RELEASE_ID,
  "generated_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF
echo ""
echo "==== shard_info.json ===="
cat "$DIST_DIR/shard_info.json"
echo ""
echo "完成：分片已上传，ReleaseBase=$RELEASE_BASE"
