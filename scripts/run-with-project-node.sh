#!/bin/sh

set -eu

repository_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
node_version=$(tr -d '[:space:]' < "$repository_root/.node-version")

if [ -z "$node_version" ]; then
  echo "The project Node version is empty" >&2
  exit 1
fi

global_vp=""
old_ifs=$IFS
IFS=:
for search_directory in $PATH; do
  case "$search_directory" in
    *node_modules/.bin) continue ;;
  esac

  if [ -x "$search_directory/vp" ]; then
    global_vp="$search_directory/vp"
    break
  fi
done
IFS=$old_ifs

if [ -z "$global_vp" ]; then
  echo "The global Vite+ CLI is not available on PATH" >&2
  exit 1
fi

cd "$repository_root"
exec "$global_vp" env exec --node "$node_version" -- "$@"
