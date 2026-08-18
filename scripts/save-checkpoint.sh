#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PACKAGE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
CURRENT_FILE="$PACKAGE_DIR/handoff/00_先读_当前进度.md"
CHECKPOINT_DIR="$PACKAGE_DIR/handoff/checkpoints"
NODE_NAME=${1:-手动节点}
SAFE_NAME=$(echo "$NODE_NAME" | tr ' /:' '___')
STAMP=$(date '+%Y-%m-%d_%H%M%S')
TARGET_FILE="$CHECKPOINT_DIR/${STAMP}_${SAFE_NAME}.md"

mkdir -p "$CHECKPOINT_DIR"
cp "$CURRENT_FILE" "$TARGET_FILE"
echo "已保存节点：$TARGET_FILE"

