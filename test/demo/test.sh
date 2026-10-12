# npm run build before running this check
set -x
export CI=true

if [ ! -d dist ]; then
  echo >2 'build liquidjs before run test.sh'
  exit 1
fi

PACK_DIR=$(mktemp -d)
trap 'rm -rf "$PACK_DIR"' EXIT
TARBALL="$PACK_DIR/$(npm pack --silent --pack-destination "$PACK_DIR")" || exit 1

# demo/express stops its server with `killall node`, which kills every node process and, on Linux with Node 24 (process name MainThread), matches nothing and fails; this stand-in stops only the demo server started from this script's process group
mkdir "$PACK_DIR/bin"
cat > "$PACK_DIR/bin/killall" <<'EOF'
#!/bin/sh
pkill -g 0 -f '^node index\.js$'
EOF
chmod +x "$PACK_DIR/bin/killall"
export PATH="$PACK_DIR/bin:$PATH"

for demo in $(ls demo); do
  cd demo/$demo
  npm install --no-save "liquidjs@file:$TARBALL" || exit 1

  if npm test; then
    echo [success] demo/$demo
  else
    echo [fail] demo/$demo
    exit 1
  fi
  cd -
done
