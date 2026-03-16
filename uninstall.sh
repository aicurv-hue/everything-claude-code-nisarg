#!/usr/bin/env bash
# uninstall.sh - Legacy shell entrypoint for the ECC uninstaller.
#
# This wrapper resolves the real repo/package root when invoked through a
# symlinked npm bin, then delegates to the Node-based uninstall runtime.

set -euo pipefail

SCRIPT_PATH="$0"
MAX_LINK_DEPTH=32
link_depth=0

while [ -L "$SCRIPT_PATH" ]; do
    if [ "$link_depth" -ge "$MAX_LINK_DEPTH" ]; then
        printf 'Exceeded symlink resolution depth limit (%s) while resolving script path: %s\n' "$MAX_LINK_DEPTH" "$0" >&2
        exit 1
    fi

    link_dir="$(cd "$(dirname "$SCRIPT_PATH")" && pwd)"
    SCRIPT_PATH="$(readlink "$SCRIPT_PATH")"
    [[ "$SCRIPT_PATH" != /* ]] && SCRIPT_PATH="$link_dir/$SCRIPT_PATH"
    link_depth=$((link_depth + 1))
done

SCRIPT_DIR="$(cd "$(dirname "$SCRIPT_PATH")" && pwd)"
UNINSTALLER_SCRIPT="$SCRIPT_DIR/scripts/uninstall.js"

if ! command -v node >/dev/null 2>&1; then
    printf 'Node.js was not found in PATH. Please install Node.js and try again.\n' >&2
    exit 1
fi

if [ ! -f "$UNINSTALLER_SCRIPT" ]; then
    printf 'Uninstaller script not found: %s\n' "$UNINSTALLER_SCRIPT" >&2
    exit 1
fi

exec node "$UNINSTALLER_SCRIPT" "$@"
