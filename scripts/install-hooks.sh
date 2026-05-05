#!/usr/bin/env bash
# Install git hooks for SLYGHT.
# Currently: pre-push hook that runs Guardian Layer 1 (guardian-static.js).
# Not auto-installed — developers opt in by running `./scripts/install-hooks.sh`.

set -e
HOOK_DIR=".git/hooks"
HOOK_FILE="$HOOK_DIR/pre-push"

if [ ! -d ".git" ]; then
  echo "❌ Not a git repository (or wrong cwd). Run from project root."
  exit 1
fi

mkdir -p "$HOOK_DIR"

cat > "$HOOK_FILE" <<'EOF'
#!/bin/sh
# Guardian Layer 1 pre-push hook (installed by scripts/install-hooks.sh).
# Blocks pushes if guardian-static.js finds any FAIL-severity violations.
# Override individual violations with // guardian-allow comments per the spec.

node guardian-static.js
status=$?
if [ $status -ne 0 ]; then
  echo ""
  echo "❌ Guardian Layer 1 blocked the push."
  echo "   Either fix the violations or add a // guardian-allow comment with justification."
  echo "   See MISSION-GUARDIAN-LAYER-1.md for the override format."
  exit 1
fi
EOF

chmod +x "$HOOK_FILE"
echo "✅ Pre-push hook installed at $HOOK_FILE"
echo "   Test it: make a no-op commit and run 'git push --dry-run'"
