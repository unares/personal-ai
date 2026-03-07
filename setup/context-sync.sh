#!/bin/bash
# Personal AI — Google Drive Context Sync
# Syncs Google Docs into memory-vault Raw/ for Context Extractor.
# Uses Google Workspace CLI (gws) — https://github.com/googleworkspace/cli
#
# Usage:
#   context-sync.sh                    # interactive: pick entity, show menu
#   context-sync.sh <entity>           # skip to menu if already authenticated
#   context-sync.sh <entity> --lang-polish  # Polish template for entity
#   context-sync.sh --status           # show all entities' Drive connection status
#   context-sync.sh --sync <entity>    # trigger sync for entity
#   context-sync.sh --auth <email>     # authenticate Google account
#   context-sync.sh --lang-polish [entity]  # Polish template (interactive or direct)
#   context-sync.sh --help             # show usage
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
source "$REPO_DIR/version.sh"
VAULT_PATH="$REPO_DIR/memory-vault"
CONFIG_PATH="$REPO_DIR/config.json"

G="\033[32m" Y="\033[33m" C="\033[36m" B="\033[1m" D="\033[2m" R="\033[0m"
TEMPLATE_LANG=""  # set to "pl" by --lang-polish
W=64
LINE=$(printf '═%.0s' $(seq 1 $W))

upper() { echo "$1" | tr '[:lower:]' '[:upper:]'; }
lower() { echo "$1" | tr '[:upper:]' '[:lower:]' | tr ' ' '-'; }

step_banner() {
  local step=$1 total=$2 title="$3"
  local filled; filled=$((step >= total ? 16 : step * 16 / total))
  local empty; empty=$((16 - filled))
  local bar="" i
  for i in $(seq 1 $filled); do bar="${bar}█"; done
  for i in $(seq 1 $empty); do bar="${bar}░"; done
  shift 3
  printf "${B}${G}╔${LINE}\n"
  printf "║  [Step %s/%s]  %s  %s\n" "$step" "$total" "$bar" "$title"
  printf "╠${LINE}\n"
  while [ $# -gt 0 ]; do
    printf "║  ${C}▸${G} %s\n" "$1"
    shift
  done
  printf "╚${LINE}${R}\n\n"
}

log_setup() {
  local event="$1" entity="${2:-}" pts="${3:-0}" detail="${4:-}"
  local log_dir="$VAULT_PATH/Logs"
  mkdir -p "$log_dir"
  local ts; ts=$(date -u +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date +"%Y-%m-%dT%H:%M:%SZ")
  local entry="{\"ts\":\"$ts\",\"event\":\"$event\",\"entity\":\"$entity\",\"pts\":$pts,\"detail\":\"$detail\"}"
  echo "$entry" >> "$log_dir/setup.jsonl" 2>/dev/null || true
}

progress_bar() {
  local current=$1 total=$2 width=16
  local filled; filled=$((current * width / total))
  local empty; empty=$((width - filled))
  local bar=""
  local i
  for i in $(seq 1 $filled); do bar="${bar}█"; done
  for i in $(seq 1 $empty); do bar="${bar}░"; done
  echo "$bar"
}

die() { printf "  ${Y}Error:${R} %s\n\n" "$1"; exit 1; }

# ── gws dependency management ─────────────────────────────────────────────
GWS_CONFIG_DIR="${HOME}/.config/gws"

install_gws() {
  printf "  ${Y}!${R} Google Workspace CLI (gws) not installed.\n"
  printf "  ${D}  gws provides Google Drive access for context sync.${R}\n\n"

  if ! command -v npm > /dev/null 2>&1; then
    printf "  ${Y}Error:${R} npm not found. Install Node.js first, then re-run.\n"
    printf "  ${D}  macOS: brew install node${R}\n"
    printf "  ${D}  Linux: apt install nodejs npm${R}\n\n"
    return 1
  fi

  while true; do
    read -rp "  Install gws now? (npm install -g @googleworkspace/cli) [y/n]: " INSTALL_GWS
    case "$INSTALL_GWS" in y*|Y*|n*|N*) break;; esac
  done

  if [[ "$INSTALL_GWS" != "y"* && "$INSTALL_GWS" != "Y"* ]]; then
    printf "  ${D}Skipped. Install manually: npm install -g @googleworkspace/cli${R}\n\n"
    return 1
  fi

  printf "  Installing gws...\n"
  if npm install -g @googleworkspace/cli 2>&1 | tail -3; then
    printf "  ${G}✓${R} gws installed\n\n"
    return 0
  else
    printf "  ${Y}!${R} Installation failed. Try manually: npm install -g @googleworkspace/cli\n\n"
    return 1
  fi
}

ensure_gcloud() {
  if command -v gcloud > /dev/null 2>&1; then
    return 0
  fi

  printf "  ${Y}!${R} Google Cloud SDK (gcloud) not installed.\n"
  printf "  ${D}  gcloud is needed once to create OAuth credentials for Drive access.${R}\n\n"

  # Detect platform and offer install
  local install_cmd=""
  if command -v brew > /dev/null 2>&1; then
    install_cmd="brew install --cask google-cloud-sdk"
  elif [ -f /etc/debian_version ]; then
    install_cmd="sudo apt-get install -y google-cloud-cli"
  fi

  if [ -n "$install_cmd" ]; then
    while true; do
      read -rp "  Install now? (${install_cmd}) [y/n]: " INSTALL_GCLOUD
      case "$INSTALL_GCLOUD" in y*|Y*|n*|N*) break;; esac
    done

    if [[ "$INSTALL_GCLOUD" == "y"* || "$INSTALL_GCLOUD" == "Y"* ]]; then
      printf "  Installing Google Cloud SDK...\n\n"
      if $install_cmd; then
        printf "\n  ${G}✓${R} gcloud installed\n\n"
        # Source the path setup for brew installs
        if command -v brew > /dev/null 2>&1; then
          local gcloud_path; gcloud_path="$(brew --prefix)/share/google-cloud-sdk"
          [ -f "$gcloud_path/path.bash.inc" ] && source "$gcloud_path/path.bash.inc" 2>/dev/null || true
          [ -f "$gcloud_path/completion.bash.inc" ] && source "$gcloud_path/completion.bash.inc" 2>/dev/null || true
        fi
        return 0
      else
        printf "\n  ${Y}!${R} Installation failed.\n\n"
      fi
    fi
  fi

  printf "  ${D}Install manually: https://cloud.google.com/sdk/docs/install${R}\n"
  printf "  ${D}Then re-run this command.${R}\n\n"
  return 1
}

ensure_oauth_client() {
  # Check if OAuth client is already configured
  if [ -f "$GWS_CONFIG_DIR/client_secret.json" ]; then
    return 0
  fi

  printf "  ${Y}!${R} No OAuth client configured for gws.\n"
  printf "  ${D}  One-time setup: creates a Google Cloud project with Drive access.${R}\n\n"

  # Ensure gcloud is available (auto-install if needed)
  ensure_gcloud || return 1

  # Run gws auth setup — automates project creation, API enabling, OAuth client
  printf "  Running ${B}gws auth setup${R}...\n"
  printf "  ${D}  This creates a Google Cloud project, enables Drive/Docs APIs,${R}\n"
  printf "  ${D}  and configures OAuth credentials. Follow the prompts.${R}\n\n"

  if gws auth setup; then
    printf "\n  ${G}✓${R} OAuth client configured\n\n"
    return 0
  fi

  # If gws auth setup failed, offer manual fallback
  printf "\n  ${Y}!${R} Automatic setup failed. Trying manual fallback...\n\n"
  printf "  ${B}If you already have a client_secret.json:${R}\n"
  printf "  ${D}  Save it to: ${GWS_CONFIG_DIR}/client_secret.json${R}\n\n"

  mkdir -p "$GWS_CONFIG_DIR"
  read -rp "  Path to client_secret.json (or Enter to abort): " CLIENT_PATH

  if [ -n "$CLIENT_PATH" ] && [ -f "$CLIENT_PATH" ]; then
    cp "$CLIENT_PATH" "$GWS_CONFIG_DIR/client_secret.json"
    printf "  ${G}✓${R} OAuth client configured\n\n"
    return 0
  elif [ -f "$GWS_CONFIG_DIR/client_secret.json" ]; then
    printf "  ${G}✓${R} Found client_secret.json\n\n"
    return 0
  else
    printf "  ${Y}!${R} No client_secret.json found.\n"
    printf "  ${D}  Re-run this command after saving it to ${GWS_CONFIG_DIR}/client_secret.json${R}\n\n"
    return 1
  fi
}

ensure_gws() {
  # Step 1: ensure gws binary is installed
  if ! command -v gws > /dev/null 2>&1; then
    install_gws || return 1
  fi

  # Step 2: ensure OAuth client is configured
  ensure_oauth_client || return 1

  return 0
}

require_config() {
  [ -f "$CONFIG_PATH" ] || die "config.json not found. Run ./install.sh first."
  command -v node > /dev/null 2>&1 || die "node is required. Install Node.js."
}

get_entities() {
  node -e "const c=require('${CONFIG_PATH}'); const e=c.entities||[]; console.log(e.map(x=>x.name).join(' '))" 2>/dev/null
}

get_owner() {
  node -e "const c=require('${CONFIG_PATH}'); console.log(c.owner)" 2>/dev/null
}

get_sync_state_file() {
  local entity="$1"
  echo "$VAULT_PATH/$entity/Logs/.context-sync-state"
}

get_gdrive_email() {
  local entity="$1"
  local state_file; state_file=$(get_sync_state_file "$entity")
  local raw_email=""
  raw_email=$([ -f "$state_file" ] && node -e "const s=JSON.parse(require('fs').readFileSync('${state_file}','utf8')); console.log(s.email||'')" 2>/dev/null || echo "")
  # Normalize: auto-append @gmail.com if missing
  if [ -n "$raw_email" ] && [[ "$raw_email" != *@* ]]; then
    raw_email="${raw_email}@gmail.com"
  fi
  echo "$raw_email"
}

get_last_sync() {
  local entity="$1"
  local state_file; state_file=$(get_sync_state_file "$entity")
  [ -f "$state_file" ] && node -e "const s=JSON.parse(require('fs').readFileSync('${state_file}','utf8')); console.log(s.last_sync||'')" 2>/dev/null || echo ""
}

get_sync_count() {
  local entity="$1"
  local state_file; state_file=$(get_sync_state_file "$entity")
  [ -f "$state_file" ] && node -e "const s=JSON.parse(require('fs').readFileSync('${state_file}','utf8')); console.log(s.files_synced||0)" 2>/dev/null || echo "0"
}

save_sync_state() {
  local entity="$1" email="$2" files_synced="${3:-0}"
  local state_file; state_file=$(get_sync_state_file "$entity")
  local ts; ts=$(date -u +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date +"%Y-%m-%dT%H:%M:%SZ")
  mkdir -p "$(dirname "$state_file")"
  printf '{"email":"%s","last_sync":"%s","files_synced":%s}\n' "$email" "$ts" "$files_synced" > "$state_file"
  # Also write last sync timestamp for claude-code-launch re-sync check
  local vault_logs="$VAULT_PATH/$entity/Logs"
  mkdir -p "$vault_logs"
  echo "$ts" > "$vault_logs/.context-sync-last"
}

# ── Access control ─────────────────────────────────────────────────────────
get_visible_entities() {
  local user="${1:-}"
  if [ -z "$user" ]; then
    get_entities
    return
  fi
  local owner; owner=$(get_owner)
  if [ "$user" = "$owner" ]; then
    get_entities
  else
    # Co-founder: only entities they're assigned to
    node -e "
      const c=require('${CONFIG_PATH}');
      const clark=c.clarks.find(cl=>cl.name==='clark-${user}');
      if(clark) console.log((clark.projects||[]).join(' '));
    " 2>/dev/null
  fi
}

# ── gws API helpers ────────────────────────────────────────────────────────
# All gws commands use --params for API parameters and return JSON.
# Ref: https://github.com/googleworkspace/cli

# ── Per-account gws isolation ─────────────────────────────────
# gws stores tokens in ~/.config/gws/ and cannot switch accounts.
# We isolate each account by giving it its own config directory
# via XDG_CONFIG_HOME, with shared OAuth client config symlinked in.
GWS_ACCOUNT_DIR=""

# Activate a per-account gws config directory.
# Copies the OAuth client config (from gws auth setup) into the
# account-specific directory so gws can find it.
set_gws_account() {
  local email="${1:-}"
  [ -z "$email" ] && return
  local safe; safe=$(echo "$email" | tr '@.' '__')
  GWS_ACCOUNT_DIR="${HOME}/.config/gws-accounts/${safe}"
  mkdir -p "$GWS_ACCOUNT_DIR/gws"
  # Copy OAuth client config from the main gws dir if not already present
  local main_dir="${HOME}/.config/gws"
  if [ -f "$main_dir/client_secret.json" ] && [ ! -f "$GWS_ACCOUNT_DIR/gws/client_secret.json" ]; then
    cp "$main_dir/client_secret.json" "$GWS_ACCOUNT_DIR/gws/client_secret.json"
  fi
  # Copy encryption key if present
  if [ -f "$main_dir/.encryption_key" ] && [ ! -f "$GWS_ACCOUNT_DIR/gws/.encryption_key" ]; then
    cp "$main_dir/.encryption_key" "$GWS_ACCOUNT_DIR/gws/.encryption_key"
  fi
}

# Run gws using the per-account config directory
run_gws() {
  if [ -n "$GWS_ACCOUNT_DIR" ]; then
    XDG_CONFIG_HOME="$GWS_ACCOUNT_DIR" gws "$@"
  else
    gws "$@"
  fi
}

# Check which Google account is active in the current gws config
get_active_gws_email() {
  run_gws drive about get --params '{"fields": "user(emailAddress)"}' 2>/dev/null | \
    node -e "
      const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
      if(d.user&&d.user.emailAddress) process.stdout.write(d.user.emailAddress);
    " 2>/dev/null || true
}

# Authenticate into the per-account gws config directory
gws_force_login() {
  local target_email="$1"
  set_gws_account "$target_email"
  XDG_CONFIG_HOME="$GWS_ACCOUNT_DIR" gws auth login --account="$target_email" --services drive,docs
}

list_google_docs() {
  local email="${1:-}"
  set_gws_account "$email"
  # Request trashed+size fields; filter client-side since some Drive backends delay trash state
  local raw; raw=$(run_gws drive files list --params '{"q": "mimeType=\"application/vnd.google-apps.document\" and trashed = false", "pageSize": 50, "fields": "files(id,name,modifiedTime,size,trashed)", "orderBy": "modifiedTime desc"}' 2>/dev/null) || return 1
  # Double-filter: remove any files where trashed is true
  echo "$raw" | node -e "
    const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
    d.files=(d.files||[]).filter(f=>f.trashed!==true);
    console.log(JSON.stringify(d));
  " 2>/dev/null
}

list_drive_folders() {
  local email="${1:-}"
  set_gws_account "$email"
  run_gws drive files list --params '{"q": "mimeType=\"application/vnd.google-apps.folder\"", "pageSize": 50, "fields": "files(id,name)"}' 2>/dev/null
}

list_docs_in_folder() {
  local folder_id="$1" email="${2:-}"
  set_gws_account "$email"
  run_gws drive files list --params "{\"q\": \"'${folder_id}' in parents and mimeType='application/vnd.google-apps.document'\", \"pageSize\": 50, \"fields\": \"files(id,name,modifiedTime)\"}" 2>/dev/null
}

export_doc_as_md() {
  local doc_id="$1" output_path="$2" email="${3:-}"
  set_gws_account "$email"
  local tmp_file="/tmp/pai-export-$$.md"
  local err_file="/tmp/pai-export-$$.err"

  # Method 1: gws export with --output flag (markdown)
  if run_gws drive files export \
    --params "{\"fileId\": \"${doc_id}\", \"mimeType\": \"text/markdown\"}" \
    --output "$tmp_file" > /dev/null 2>"$err_file"; then
    if [ -s "$tmp_file" ]; then
      mv "$tmp_file" "$output_path"
      rm -f "$err_file"
      return 0
    fi
  fi

  # Method 2: gws export with --output flag (plain text)
  if run_gws drive files export \
    --params "{\"fileId\": \"${doc_id}\", \"mimeType\": \"text/plain\"}" \
    --output "$tmp_file" > /dev/null 2>"$err_file"; then
    if [ -s "$tmp_file" ]; then
      mv "$tmp_file" "$output_path"
      rm -f "$err_file"
      return 0
    fi
  fi

  # Method 3: gws export to stdout (some versions write content to stdout)
  local content=""
  content=$(run_gws drive files export \
    --params "{\"fileId\": \"${doc_id}\", \"mimeType\": \"text/plain\"}" 2>/dev/null) || true
  # Only use if it looks like document content, not JSON metadata
  if [ -n "$content" ] && ! echo "$content" | head -1 | grep -q '^{'; then
    echo "$content" > "$output_path"
    rm -f "$tmp_file" "$err_file"
    return 0
  fi

  # Method 4: Read doc content via Docs API and extract text
  local doc_json=""
  doc_json=$(run_gws docs documents get \
    --params "{\"documentId\": \"${doc_id}\", \"includeTabsContent\": true}" 2>/dev/null) || true
  if [ -n "$doc_json" ]; then
    local extracted=""
    extracted=$(echo "$doc_json" | node -e "
      const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
      const tabs=d.tabs||[];
      let out='';
      for(const tab of tabs){
        const title=(tab.tabProperties||{}).title||'';
        const body=tab.documentTab&&tab.documentTab.body;
        if(!body) continue;
        if(title) out+='# '+title+'\n\n';
        const elems=body.content||[];
        for(const el of elems){
          if(el.paragraph){
            const text=el.paragraph.elements.map(e=>(e.textRun||{}).content||'').join('');
            out+=text;
          }
        }
        out+='\n---\n\n';
      }
      process.stdout.write(out);
    " 2>/dev/null) || true
    if [ -n "$extracted" ]; then
      echo "$extracted" > "$output_path"
      rm -f "$tmp_file" "$err_file"
      return 0
    fi
  fi

  # All methods failed — show last error
  if [ -s "$err_file" ]; then
    printf "  ${Y}Export error:${R} %s\n" "$(cat "$err_file")" >&2
  fi
  rm -f "$tmp_file" "$err_file"
  return 1
}

create_google_doc() {
  local title="$1" email="${2:-}"
  set_gws_account "$email"
  # Escape special chars in title for JSON
  local safe_title; safe_title=$(echo "$title" | sed "s/'/\\\\u0027/g; s/\"/\\\\\"/g")
  local out_file="/tmp/pai-gws-create.$$.out"
  run_gws docs documents create --json "{\"title\": \"${safe_title}\"}" > "$out_file" 2>&1
  local rc=$?
  local result; result=$(cat "$out_file" 2>/dev/null)
  rm -f "$out_file"
  if [ $rc -ne 0 ] || [ -z "$result" ]; then
    printf "  ${Y}gws error rc=%s:${R} %s\n" "$rc" "${result:-<no output>}" >&2
    return 1
  fi
  # Check if result looks like JSON with an error
  if echo "$result" | grep -qi '"error"'; then
    printf "  ${Y}gws error:${R} %s\n" "$result" >&2
    return 1
  fi
  echo "$result"
}

write_to_google_doc() {
  local doc_id="$1" content="$2" email="${3:-}"
  set_gws_account "$email"
  run_gws docs +write --document "$doc_id" --text "$content" > /dev/null 2>&1
}

# ══════════════════════════════════════════════════════════════════════════
# COMMANDS
# ══════════════════════════════════════════════════════════════════════════

cmd_help() {
  printf "${B}${G}╔${LINE}\n"
  printf "║  Personal AI v${VERSION} — Context Sync\n"
  printf "╚${LINE}${R}\n\n"
  printf "  ${B}Usage:${R}\n"
  printf "    context-sync.sh                    ${D}# interactive mode${R}\n"
  printf "    context-sync.sh --status           ${D}# show Drive connection status${R}\n"
  printf "    context-sync.sh --sync <entity>    ${D}# trigger sync for entity${R}\n"
  printf "    context-sync.sh --auth <email>     ${D}# authenticate Google account${R}\n"
  printf "    context-sync.sh <entity>            ${D}# skip to menu if already authed${R}\n"
  printf "    context-sync.sh <entity> --lang-polish ${D}# Polish template for entity${R}\n"
  printf "    context-sync.sh --lang-polish [entity] ${D}# Polish template${R}\n"
  printf "    context-sync.sh --help             ${D}# this help${R}\n\n"
  printf "  ${B}Prerequisites:${R}\n"
  printf "    Node.js (for gws CLI) — the script auto-installs gws if missing.\n"
  printf "    Run ${B}context-sync.sh --auth your@gmail.com${R} before first sync.\n\n"
  printf "  ${B}How it works:${R}\n"
  printf "    1. Authenticates with your Google account via OAuth2 (browser)\n"
  printf "    2. Lists Google Docs in your Drive\n"
  printf "    3. Exports them as .md into memory-vault/{entity}/Raw/Other/\n"
  printf "    4. Context Extractor picks them up and distills automatically\n\n"
}

cmd_auth() {
  local email="${1:-}"
  [ -z "$email" ] && die "Usage: context-sync.sh --auth <email>"

  # Auto-append @gmail.com if no @ present
  if [[ "$email" != *@* ]]; then
    email="${email}@gmail.com"
  fi

  ensure_gws || exit 1

  printf "${B}${G}╔${LINE}\n"
  printf "║  Personal AI v${VERSION} — Google Drive Authentication\n"
  printf "╚${LINE}${R}\n\n"

  printf "  Authenticating ${B}${email}${R}...\n\n"
  printf "  ${B}Two steps:${R}\n"
  printf "    1. Select scopes — pick ${B}Recommended${R} and press Enter\n"
  printf "    2. Open the URL in your browser to authorize\n\n"

  if gws_force_login "$email"; then
    printf "\n  ${G}✓${R} Google Drive authenticated for ${B}${email}${R}\n"

    log_setup "GDRIVE_CONNECTED" "" 50 "$email"
    printf "  ${G}+50 Pts.${R} for connecting Google Drive!\n\n"

    printf "  ${G}✓${R} Ready to sync\n\n"
  else
    printf "\n  ${Y}!${R} Authentication failed.\n"
    printf "  ${D}  Make sure you opened the URL and completed the consent flow.${R}\n\n"
    exit 1
  fi
}

cmd_status() {
  require_config

  printf "${B}${G}╔${LINE}\n"
  printf "║  Personal AI v${VERSION} — Context Sync Status\n"
  printf "╚${LINE}${R}\n\n"

  local entities; entities=$(get_entities)
  for entity in $entities; do
    printf "  Entity: ${B}${entity}${R}\n"
    local email; email=$(get_gdrive_email "$entity")
    local last_sync; last_sync=$(get_last_sync "$entity")
    local sync_count; sync_count=$(get_sync_count "$entity")

    if [ -n "$email" ]; then
      printf "    Google Drive:  ${G}✓${R} connected — ${email}\n"
      if [ -n "$last_sync" ]; then
        printf "    Last sync:     ${last_sync}\n"
      else
        printf "    Last sync:     ${D}never${R}\n"
      fi
      printf "    Files synced:  ${sync_count}\n"
    else
      printf "    Google Drive:  ${Y}✗${R} not connected\n"
    fi

    # Check for context dump doc
    local dump_marker="$VAULT_PATH/$entity/Logs/.context-dump-created"
    if [ -f "$dump_marker" ]; then
      printf "    Context Dump:  ${G}✓${R} created\n"
    else
      printf "    Context Dump:  ${D}─ none${R}\n"
    fi
    printf "\n"
  done

  printf "  [S] Sync now  [C] Connect Drive  [Q] Quit\n\n"
  read -rp "  Select: " CHOICE
  case "$CHOICE" in
    [Ss]) cmd_interactive ;;
    [Cc])
      read -rp "  Google account email: " AUTH_EMAIL
      cmd_auth "$AUTH_EMAIL"
      ;;
    *) printf "  ${D}Done.${R}\n\n" ;;
  esac
}

sync_single_file() {
  local entity="$1" email="$2"
  ensure_gws || return 1

  printf "\n  ${B}Your recent Google Docs:${R}\n"
  printf "  ${D}To see more, edit them in Google Drive.${R}\n\n"
  local doc_list; doc_list=$(list_google_docs "$email") || {
    printf "  ${Y}!${R} Could not list documents. Run: context-sync.sh --auth ${email}\n\n"
    return 1
  }

  local doc_count; doc_count=$(echo "$doc_list" | node -e "
    const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
    console.log((d.files||[]).length);
  " 2>/dev/null) || doc_count=0

  if [ "$doc_count" -eq 0 ]; then
    printf "  ${D}No Google Docs found in your Drive.${R}\n\n"
    return 0
  fi

  # Display numbered list with dates and sizes
  echo "$doc_list" | node -e "
    const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
    const files=d.files||[];
    const maxName=Math.min(40, Math.max(...files.map(f=>f.name.length)));
    files.forEach((f,i) => {
      const name=f.name.length>40?f.name.substring(0,37)+'...':f.name;
      const mod=f.modifiedTime?f.modifiedTime.substring(0,10):'';
      const sz=f.size?((parseInt(f.size)/1024).toFixed(0)+'K'):'';
      const pad=' '.repeat(Math.max(1,42-name.length));
      const num=String(i+1).padStart(String(files.length).length);
      console.log('    '+num+'. '+name+pad+'\x1b[2m'+mod+(sz?' '+sz:'')+'\x1b[0m');
    });
  " 2>/dev/null

  printf "\n"
  local DOC_NUM=""
  while true; do
    read -rp "  Select document number: " DOC_NUM
    if [[ "$DOC_NUM" =~ ^[0-9]+$ ]] && [ "$DOC_NUM" -ge 1 ] && [ "$DOC_NUM" -le "$doc_count" ]; then
      break
    fi
    printf "  ${Y}Please enter a number between 1 and ${doc_count}.${R}\n"
  done

  local doc_info; doc_info=$(echo "$doc_list" | node -e "
    const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
    const files=d.files||[];
    const idx=${DOC_NUM}-1;
    if(idx>=0 && idx<files.length) {
      console.log(JSON.stringify({id:files[idx].id, name:files[idx].name}));
    }
  " 2>/dev/null)

  if [ -z "$doc_info" ]; then
    printf "  ${Y}!${R} Invalid selection.\n\n"
    return 1
  fi

  local doc_id; doc_id=$(echo "$doc_info" | node -e "console.log(JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')).id)" 2>/dev/null)
  local doc_name; doc_name=$(echo "$doc_info" | node -e "console.log(JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')).name)" 2>/dev/null)
  # Sanitize filename: spaces to dashes, collapse multiple dashes, strip non-alphanum
  local safe_name; safe_name=$(echo "$doc_name" | tr ' ' '-' | tr -cd '[:alnum:]-_' | sed 's/--*/-/g; s/^-//; s/-$//')
  local output_dir="$VAULT_PATH/$entity/Raw/Other"
  mkdir -p "$output_dir"
  local output_path="$output_dir/${safe_name}.md"

  printf "\n  ${B}Exporting${R} ${doc_name}...\n"
  local bar; bar=$(progress_bar 8 16)
  printf "  ${G}[${bar}]${R} exporting...\r"

  if export_doc_as_md "$doc_id" "$output_path" "$email"; then
    bar=$(progress_bar 16 16)
    printf "  ${G}[${bar}] done ✓${R}    \n"
    printf "  ${G}✓${R} Exported ${B}${doc_name}${R}\n\n"
    save_sync_state "$entity" "$email" 1

    # Wait for Context Extractor to process and distill
    local distilled_dir="$VAULT_PATH/$entity/Distilled"
    local wait_secs=0
    local max_wait=10
    printf "  ${D}Waiting for Context Extractor"
    while [ $wait_secs -lt $max_wait ]; do
      # Check if any distilled files appeared for this source
      if find "$distilled_dir" -name "${safe_name}.md" -type f 2>/dev/null | grep -q .; then
        break
      fi
      printf "."
      sleep 1
      wait_secs=$((wait_secs + 1))
    done
    printf "${R}\n\n"

    # List distilled files
    local distilled_files=""
    distilled_files=$(find "$distilled_dir" -name "${safe_name}.md" -type f 2>/dev/null | sort)
    if [ -n "$distilled_files" ]; then
      printf "  ${G}✓${R} ${B}Distilled by Context Extractor:${R}\n"
      while IFS= read -r dfile; do
        local rel_path="${dfile#$VAULT_PATH/}"
        printf "    ${G}→${R} ${rel_path}\n"
      done <<< "$distilled_files"
      printf "    ${D}→ Raw: ${entity}/Raw/Other/${safe_name}.md${R}\n"
      printf "\n"
    else
      printf "  ${G}✓${R} ${B}Saved to Memory:${R}\n"
      printf "    ${G}→${R} ${entity}/Raw/Other/${safe_name}.md\n"
      printf "    ${D}Context Extractor will distill it when the container is running.${R}\n\n"
    fi

    return 0
  else
    printf "  ${Y}!${R} Export failed for ${doc_name}\n\n"
    return 1
  fi
}

sync_folder() {
  local entity="$1" email="$2"
  ensure_gws || return 1

  printf "\n  Listing your Drive folders...\n\n"
  local folder_list; folder_list=$(list_drive_folders "$email") || {
    printf "  ${Y}!${R} Could not list folders. Run: context-sync.sh --auth ${email}\n\n"
    return 1
  }

  local folder_count; folder_count=$(echo "$folder_list" | node -e "
    const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
    console.log((d.files||[]).length);
  " 2>/dev/null) || folder_count=0

  if [ "$folder_count" -eq 0 ]; then
    printf "  ${D}No folders found in your Drive.${R}\n\n"
    return 0
  fi

  echo "$folder_list" | node -e "
    const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
    (d.files||[]).forEach((f,i) => {
      console.log('    ' + (i+1) + '. ' + f.name);
    });
  " 2>/dev/null

  printf "\n"
  read -rp "  Select folder number: " FOLDER_NUM

  local folder_info; folder_info=$(echo "$folder_list" | node -e "
    const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
    const files=d.files||[];
    const idx=${FOLDER_NUM}-1;
    if(idx>=0 && idx<files.length) {
      console.log(JSON.stringify({id:files[idx].id, name:files[idx].name}));
    }
  " 2>/dev/null)

  if [ -z "$folder_info" ]; then
    printf "  ${Y}!${R} Invalid selection.\n\n"
    return 1
  fi

  local folder_id; folder_id=$(echo "$folder_info" | node -e "console.log(JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')).id)" 2>/dev/null)
  local folder_name; folder_name=$(echo "$folder_info" | node -e "console.log(JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')).name)" 2>/dev/null)

  printf "\n  Listing docs in ${B}${folder_name}${R}...\n\n"
  local docs_list; docs_list=$(list_docs_in_folder "$folder_id" "$email") || {
    printf "  ${Y}!${R} Could not list folder contents.\n\n"
    return 1
  }

  local total_docs; total_docs=$(echo "$docs_list" | node -e "
    const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
    console.log((d.files||[]).length);
  " 2>/dev/null) || total_docs=0

  if [ "$total_docs" -eq 0 ]; then
    printf "  ${D}No Google Docs in this folder.${R}\n\n"
    return 0
  fi

  printf "  Exporting ${B}${total_docs}${R} files from \"${folder_name}\"\n\n"

  local output_dir="$VAULT_PATH/$entity/Raw/Other"
  mkdir -p "$output_dir"
  local success_count=0
  local current=0

  # Get all doc IDs and names as NDJSON
  local docs_json; docs_json=$(echo "$docs_list" | node -e "
    const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
    (d.files||[]).forEach(f => console.log(JSON.stringify({id:f.id, name:f.name})));
  " 2>/dev/null)

  while IFS= read -r doc_line; do
    [ -z "$doc_line" ] && continue
    current=$((current + 1))
    local did; did=$(echo "$doc_line" | node -e "console.log(JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')).id)" 2>/dev/null)
    local dname; dname=$(echo "$doc_line" | node -e "console.log(JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')).name)" 2>/dev/null)
    local safe; safe=$(echo "$dname" | tr ' ' '-' | tr -cd '[:alnum:]-_' | sed 's/--*/-/g; s/^-//; s/-$//')
    local out="$output_dir/${safe}.md"

    # Show current file progress
    local bar; bar=$(progress_bar 8 16)
    printf "  [%s/%s] %-30s %s exporting...\r" "$current" "$total_docs" "${dname:0:30}" "$bar"

    if export_doc_as_md "$did" "$out" "$email"; then
      bar=$(progress_bar 16 16)
      printf "  [%s/%s] %-30s %s done ${G}✓${R}     \n" "$current" "$total_docs" "${dname:0:30}" "$bar"
      success_count=$((success_count + 1))
    else
      printf "  [%s/%s] %-30s ${Y}failed${R}                  \n" "$current" "$total_docs" "${dname:0:30}"
    fi

    # Show remaining count for large batches
    local remaining=$((total_docs - current))
    if [ "$remaining" -gt 3 ] && [ "$current" -le 3 ]; then
      printf "  ${D}─────────────────────────────────────────${R}\n"
      printf "  ${D}[%s-%s] %s files waiting...${R}\n" "$((current + 1))" "$total_docs" "$remaining"
    fi
  done <<< "$docs_json"

  printf "\n  ${G}✓${R} ${success_count}/${total_docs} files exported to Raw/Other/\n"
  save_sync_state "$entity" "$email" "$success_count"
  printf "  ${D}Context Extractor will process them automatically.${R}\n\n"
}

create_context_dump() {
  local entity="$1" email="$2"
  ensure_gws || return 1

  # Capitalize first letter (macOS-compatible)
  local upper_entity; upper_entity=$(echo "$entity" | awk '{print toupper(substr($0,1,1)) substr($0,2)}')

  # Detect co-founders from config: owner is always AI architect, entity.human is co-founder
  local owner_name="" cofounder_name="" is_joint=false
  owner_name=$(node -e "const c=require('${CONFIG_PATH}'); process.stdout.write((c.owner||'').replace(/^\w/,c=>c.toUpperCase()))" 2>/dev/null) || true
  cofounder_name=$(node -e "
    const c=require('${CONFIG_PATH}');
    const e=(c.entities||[]).find(x=>x.name==='${entity}');
    if(e && e.human) process.stdout.write(e.human.replace(/^\w/,c=>c.toUpperCase()));
  " 2>/dev/null) || true
  if [ -n "$cofounder_name" ]; then
    is_joint=true
  fi

  local doc_title="Personal AI Context Dump - ${upper_entity}"
  local title_line="# Personal AI Context Dump - ${upper_entity}"
  local title_line_pl="# Personal AI Context Dump - ${upper_entity}"
  local howto_items=""
  local howto_items_pl=""
  if [ -n "$cofounder_name" ]; then
    is_joint=true
    doc_title="Personal AI Context Dump - ${upper_entity} (${cofounder_name} & ${owner_name})"
    title_line="# Personal AI Context Dump - ${upper_entity} (joint workspace by ${cofounder_name} and ${owner_name})"
    title_line_pl="# Personal AI Context Dump - ${upper_entity} (wspólny workspace ${cofounder_name} i ${owner_name})"
    howto_items="1. Open each tab of this Google Doc and write freely (top left corner to see the tabs)
2. You can tag content by author using <${cofounder_name}>content</${cofounder_name}> or <${owner_name}>content</${owner_name}> — only where it matters, this is optional and helps improve context accuracy
3. Each tab has instructions explaining what belongs there (you can leave or delete them)
   Tip: Extract memories from your AI Chat (see the prompt below)
4. Do not worry about formatting. Raw thoughts are perfectly fine
5. Volume matters. The more context you provide, the smarter your AI becomes
6. Feel free to add more tabs if you need additional categories
7. When ready, your Context Dump can be synced"
    howto_items_pl="1. Otwórz każdą kartę tego dokumentu i pisz swobodnie (karty widoczne w lewym górnym rogu)
2. Możesz oznaczać treść autorem używając <${cofounder_name}>treść</${cofounder_name}> lub <${owner_name}>treść</${owner_name}> — tylko tam, gdzie to ma znaczenie, opcjonalne, pomaga poprawić dokładność kontekstu
3. Każda karta zawiera instrukcje wyjaśniające, co do niej pasuje (możesz je zostawić lub usunąć)
   Wskazówka: Wyciągnij wspomnienia z czatu AI (patrz prompt poniżej)
4. Nie martw się formatowaniem. Surowe myśli są w porządku
5. Ilość ma znaczenie. Im więcej kontekstu podasz, tym mądrzejsze będzie Twoje AI
6. Możesz dodawać więcej kart, jeśli potrzebujesz dodatkowych kategorii
7. Gdy będziesz gotowy, Context Dump może zostać zsynchronizowany"
  else
    howto_items="1. Open each tab of this Google Doc and write freely (top left corner to see the tabs)
2. Each tab has instructions explaining what belongs there (you can leave or delete them)
   Tip: Extract memories from your AI Chat (see the prompt below)
3. Do not worry about formatting. Raw thoughts are perfectly fine
4. Volume matters. The more context you provide, the smarter your AI becomes
5. Feel free to add more tabs if you need additional categories
6. When ready, your Context Dump can be synced"
    howto_items_pl="1. Otwórz każdą kartę tego dokumentu i pisz swobodnie (karty widoczne w lewym górnym rogu)
2. Każda karta zawiera instrukcje wyjaśniające, co do niej pasuje (możesz je zostawić lub usunąć)
   Wskazówka: Wyciągnij wspomnienia z czatu AI (patrz prompt poniżej)
3. Nie martw się formatowaniem. Surowe myśli są w porządku
4. Ilość ma znaczenie. Im więcej kontekstu podasz, tym mądrzejsze będzie Twoje AI
5. Możesz dodawać więcej kart, jeśli potrzebujesz dodatkowych kategorii
6. Gdy będziesz gotowy, Context Dump może zostać zsynchronizowany"
  fi

  printf "\n  Checking for existing template"
  for i in 1 2 3; do printf "."; sleep 0.15; done

  # Check if doc already exists in Drive — build query params entirely in node
  set_gws_account "$email"
  local query_params; query_params=$(node -e "
    const title = process.argv[1];
    const q = 'name=' + JSON.stringify(title) + ' and mimeType=' + JSON.stringify('application/vnd.google-apps.document') + ' and trashed=false';
    process.stdout.write(JSON.stringify({q, pageSize:1, fields:'files(id,name)'}));
  " "$doc_title" 2>/dev/null) || true
  local existing_id=""
  if [ -n "$query_params" ]; then
    local existing; existing=$(run_gws drive files list --params "$query_params" 2>/dev/null) || true
    if [ -n "$existing" ]; then
      existing_id=$(echo "$existing" | node -e "
        const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
        const f=(d.files||[])[0];
        if(f&&f.id) process.stdout.write(f.id);
      " 2>/dev/null) || true
    fi
  fi

  if [ -n "$existing_id" ]; then
    printf " ${Y}already exists${R}\n\n"
    printf "  ${B}${doc_title}${R} is already in your Google Drive.\n"
    printf "  ${D}  https://docs.google.com/document/d/${existing_id}/edit${R}\n\n"
    printf "  ${D}  Open it, fill in each tab, then run:${R}\n"
    printf "  ${B}  ./setup/context-sync.sh --sync ${entity}${R}\n\n"
    read -rp "  Create a new template anyway? [y/N]: " RECREATE
    if [[ ! "$RECREATE" =~ ^[yY] ]]; then
      return 0
    fi
    printf "\n"
  else
    printf " ${G}ok${R}\n"
  fi

  printf "  Creating ${B}${doc_title}${R}...\n"

  # Step 1: Create the doc
  local create_result; create_result=$(create_google_doc "$doc_title" "$email") || {
    printf "  ${Y}!${R} Could not create document. Run: context-sync.sh --auth ${email}\n\n"
    return 1
  }

  local doc_id; doc_id=$(echo "$create_result" | node -e "
    const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
    console.log(d.documentId || d.id || '');
  " 2>/dev/null)

  if [ -z "$doc_id" ]; then
    printf "  ${Y}!${R} Document created but could not get ID.\n\n"
    return 1
  fi

  printf "  ${G}✓${R} Document created\n"

  # Step 2: Get the default tab ID so we can delete it after creating named tabs
  local default_tab_id; default_tab_id=$(run_gws docs documents get \
    --params "{\"documentId\": \"${doc_id}\", \"includeTabsContent\": true}" 2>/dev/null | node -e "
    const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
    const tabs=d.tabs||[];
    if(tabs.length>0) console.log((tabs[0].tabProperties||{}).tabId||'');
    else console.log('');
  " 2>/dev/null) || true

  # Step 3: Create all tabs (including Personal AI) and write content to each
  local tab_names=("Personal AI" "NORTHSTAR" "About ${upper_entity}" "Research" "Customers (Users)" "Specifications" "Transcripts" "Prompts" "Other")
  # Tab descriptions — using node to build the array avoids bash newline issues
  local tab_descs=()
  local STARS; STARS=$(printf '*%.0s' $(seq 1 100))
  tab_descs+=("${title_line}

## What is this?

This is a Context Dump for your Personal AI Workspace.

Everything you write here gets synced into your memory vault and distilled into actionable knowledge. This context will inform your Personal AI Workspace — where AI Agents build Apps and Business Automations for ${upper_entity}.

## How to use it

${howto_items}

## Automated Extractions

Life hack: You can use it with your favourite AI chat (ChatGPT, Claude, Gemini, Grok) to recall what it already knows about you on that topic.

How it works:
1. Open a chat with your AI (memory must be ON — it is by default)
2. Paste the prompt below (don't send yet), paste the questions from any tab, then send it
3. Your AI will recall everything it remembers about that topic
4. Copy its reply into the tab sections of this Context Dump Template

Memory extraction prompt (feel free to edit):
Recall everything you know about me related to the topics below. Include not just facts but the journey — timelines, key milestones, obstacles I faced, and how things evolved over time. Share any direct quotes, strong opinions, or memorable phrases I used, as they capture my authentic voice. Where you remember specific people, decisions, or turning points, include those with context and approximate dates. Organize your response with clear headings matching the sections below so I can paste it directly into my notes.

Tip: If the reply is not useful, continue the conversation with your AI to establish the narrative you see fit, then give it the prompt again — this time it will apply it to just the current chat.

You can always skip this and populate sections with raw content directly.

## Scratchpad

Each tab starts with a Scratchpad section at the very top, separated by starred lines (***).

Use the Scratchpad for:
- Draft and work-in-progress notes before they are ready
- Ideation and brainstorming for that topic
- Working on context before giving it to Personal AI

After your first sync, only the Scratchpad content in each tab (including any new tabs you add) will be synced on subsequent runs (on request, not automated). The template sections below it are one-time scaffolding you can keep or delete.

---

*Add more tabs as needed. Your AI agents will process all of them.*

## Tabs

1. NORTHSTAR - Your long-term vision and mission for ${upper_entity}
2. About ${upper_entity} - What ${upper_entity} is, who it serves, how it works
3. Research - Market research, competitor analysis, industry insights
4. Customers (Users) - Who your users are, what they need, feedback
5. Specifications - Product specs, technical requirements, feature definitions
6. Transcripts - Video calls, WhatsApp chats, conversation logs
7. Prompts - Your favourite prompts, prompting style, prompts to improve
8. Other - Anything that does not fit the other tabs")

  tab_descs+=("${STARS}
Scratchpad: Your Notes on NORTHSTAR for ${upper_entity}

[Type here]

${STARS}

# NORTHSTAR

## Your North Star Vision

What is the long-term mission for ${upper_entity}? Where do you want to be in 1 year? 5 years?

## Core Values

What principles guide every decision?

## Current Priority

What is the single most important thing right now?

---
*Write freely. This shapes how your AI agents prioritize and make decisions.*

${STARS}

[Paste context here]")

  tab_descs+=("${STARS}
Scratchpad: Your Notes on About ${upper_entity} for ${upper_entity}

[Type here]

${STARS}

# About ${upper_entity}

## What is ${upper_entity}?

Describe your company/project in your own words.

## Who is behind it?

Founders, team, key people and their roles.

## How does it work?

The core mechanism — how does ${upper_entity} create value?

## Stage

Where are you now? Idea, MVP, growth, scale?

---
*The more your AI knows about ${upper_entity}, the better it can represent you.*

${STARS}

[Paste context here]")

  tab_descs+=("${STARS}
Scratchpad: Your Notes on Research for ${upper_entity}

[Type here]

${STARS}

# Research

## Market Landscape

What market are you in? How big is it? Key trends?

## Competitors

Who else is doing this? What do they do well? Where do they fall short?

## Insights

What have you learned from research, conversations, data?

---
*Paste links, notes, summaries — anything that informs your strategy.*

${STARS}

[Paste context here]")

  tab_descs+=("${STARS}
Scratchpad: Your Notes on Customers (Users) for ${upper_entity}

[Type here]

${STARS}

# Customers (Users)

## Who are your users?

Describe your ideal customer. Demographics, behaviors, pain points.

## What do they need?

What problem are you solving for them?

## Feedback

What have users told you? Quotes, reviews, support requests.

---
*Your AI uses this to understand who you serve and why.*

${STARS}

[Paste context here]")

  tab_descs+=("${STARS}
Scratchpad: Your Notes on Specifications for ${upper_entity}

[Type here]

${STARS}

# Specifications

## Product Overview

What are you building? Key features and capabilities.

## Technical Requirements

Stack, architecture, integrations, constraints.

## Feature Definitions

Detailed specs for features in progress or planned.

---
*Paste PRDs, feature briefs, technical docs — the more detail the better.*

${STARS}

[Paste context here]")

  tab_descs+=("${STARS}
Scratchpad: Your Notes on Transcripts for ${upper_entity}

[Type here]

${STARS}

# Transcripts

## Video Calls

Paste transcripts or notes from Zoom, Google Meet, Teams calls.

## WhatsApp Chats

Copy-paste important WhatsApp conversations and threads.

## Other Conversations

Slack threads, email exchanges, voice memo transcriptions.

---
*Raw transcripts are fine — Context Extractor will distill the key points.*

${STARS}

[Paste context here]")

  tab_descs+=("${STARS}
Scratchpad: Your Notes on Prompts for ${upper_entity}

[Type here]

${STARS}

# Prompts

## Favourite Prompts

What prompts do you use most often? Paste them here with a note on what they do.

## Prompts You Want to Try

Any prompts you have saved, bookmarked, or been meaning to use but never did.

## Prompts to Improve

Prompts that work but could be better. Paste them and note what you would like to change.

## Prompting Style

How do you like to prompt? Short and direct, detailed with examples, conversational? What works best for you?

---
*Your AI agents use this to understand your prompting skill and preferences, and can suggest improvements.*

${STARS}

[Paste context here]")

  tab_descs+=("${STARS}
Scratchpad: Your Notes on Other for ${upper_entity}

[Type here]

${STARS}

# Other

## Meeting Notes

Drop notes from meetings, calls, conversations.

## Ideas

Random thoughts, inspirations, things to explore later.

## References

Links, articles, resources worth keeping.

---
*Anything that does not fit the other tabs goes here. Add more tabs if a category grows large enough.*

${STARS}

[Paste context here]")

  # ── Polish language override ──────────────────────────────────────────
  if [ "$TEMPLATE_LANG" = "pl" ]; then
    tab_names=("Personal AI" "NORTHSTAR" "O ${upper_entity}" "Badania" "Klienci (Użytkownicy)" "Specyfikacje" "Transkrypcje" "Prompty" "Inne")
    tab_descs=()
    tab_descs+=("${title_line_pl}

## Co to jest?

To jest Context Dump dla Twojego Personal AI Workspace.

Wszystko, co tutaj zapiszesz, zostanie zsynchronizowane do Twojego memory vault i przetworzone w wiedzę. Ten kontekst będzie zasilał Twój Personal AI Workspace — gdzie Agenci AI budują Aplikacje i Automatyzacje Biznesowe dla ${upper_entity}.

## Jak tego używać

${howto_items_pl}

## Automatyczna ekstrakcja

Life hack: Możesz użyć swojego ulubionego czatu AI (ChatGPT, Claude, Gemini, Grok), żeby wyciągnąć to, co już o Tobie wie na dany temat.

Jak to działa:
1. Otwórz czat z AI (pamięć musi być WŁĄCZONA — domyślnie jest)
2. Wklej poniższy prompt (jeszcze nie wysyłaj), wklej pytania z wybranej karty, potem wyślij
3. AI przywoła wszystko, co pamięta o danym temacie
4. Skopiuj odpowiedź do sekcji w odpowiedniej karcie tego Context Dump

Prompt do ekstrakcji pamięci (możesz go edytować):
Przypomnij sobie wszystko, co wiesz o mnie w kontekście poniższych tematów. Uwzględnij nie tylko fakty, ale i przebieg — oś czasu, kluczowe kamienie milowe, przeszkody, które pokonałem/am, i jak rzeczy ewoluowały. Przytocz moje bezpośrednie cytaty, silne opinie lub zapadające w pamięć sformułowania, bo oddają mój autentyczny głos. Tam, gdzie pamiętasz konkretne osoby, decyzje lub punkty zwrotne, podaj je z kontekstem i przybliżonymi datami. Uporządkuj odpowiedź z nagłówkami pasującymi do sekcji poniżej, żebym mógł/mogła ją bezpośrednio wkleić do notatek.

Wskazówka: Jeśli odpowiedź nie jest przydatna, kontynuuj rozmowę z AI, żeby ustalić narrację, a potem daj mu prompt ponownie — tym razem zastosuje go tylko do bieżącego czatu.

Zawsze możesz to pominąć i wypełnić sekcje bezpośrednio własną treścią.

## Brudnopis

Każda karta zaczyna się sekcją Brudnopis na samej górze, oddzieloną liniami gwiazdek (***).

Używaj Brudnopisu do:
- Notatek roboczych i szkiców, zanim będą gotowe
- Burzy mózgów i pomysłów na dany temat
- Pracy nad kontekstem przed przekazaniem go do Personal AI

Po pierwszej synchronizacji, tylko zawartość Brudnopisu w każdej karcie (włącznie z nowymi kartami) będzie synchronizowana przy kolejnych uruchomieniach (na żądanie, nie automatycznie). Sekcje szablonu poniżej to jednorazowe rusztowanie, które możesz zostawić lub usunąć.

---

*Dodawaj więcej kart w razie potrzeby. Twoje agenty AI przetworzą je wszystkie.*

## Karty

1. NORTHSTAR - Twoja długoterminowa wizja i misja dla ${upper_entity}
2. O ${upper_entity} - Czym jest ${upper_entity}, komu służy, jak działa
3. Badania - Badania rynku, analiza konkurencji, spostrzeżenia branżowe
4. Klienci (Użytkownicy) - Kim są Twoi użytkownicy, czego potrzebują, opinie
5. Specyfikacje - Specyfikacje produktu, wymagania techniczne, definicje funkcji
6. Transkrypcje - Rozmowy wideo, czaty WhatsApp, zapisy rozmów
7. Prompty - Twoje ulubione prompty, styl promptowania, prompty do poprawy
8. Inne - Wszystko, co nie pasuje do innych kart")

    tab_descs+=("${STARS}
Brudnopis: Twoje notatki o NORTHSTAR dla ${upper_entity}

[Pisz tutaj]

${STARS}

# NORTHSTAR

## Twoja Gwiazda Północna

Jaka jest długoterminowa misja ${upper_entity}? Gdzie chcesz być za rok? Za 5 lat?

## Podstawowe wartości

Jakie zasady kierują każdą decyzją?

## Aktualny priorytet

Co jest teraz najważniejsze?

---
*Pisz swobodnie. To kształtuje sposób, w jaki Twoje agenty AI ustalają priorytety i podejmują decyzje.*

${STARS}

[Wklej kontekst tutaj]")

    tab_descs+=("${STARS}
Brudnopis: Twoje notatki o ${upper_entity} dla ${upper_entity}

[Pisz tutaj]

${STARS}

# O ${upper_entity}

## Czym jest ${upper_entity}?

Opisz swój projekt własnymi słowami.

## Kto za tym stoi?

Założyciele, zespół, kluczowe osoby i ich role.

## Jak to działa?

Główny mechanizm — jak ${upper_entity} tworzy wartość?

## Etap

Na jakim etapie jesteś? Pomysł, MVP, wzrost, skala?

---
*Im więcej Twoje AI wie o ${upper_entity}, tym lepiej może Cię reprezentować.*

${STARS}

[Wklej kontekst tutaj]")

    tab_descs+=("${STARS}
Brudnopis: Twoje notatki o Badaniach dla ${upper_entity}

[Pisz tutaj]

${STARS}

# Badania

## Krajobraz rynkowy

Na jakim rynku działasz? Jak duży jest? Kluczowe trendy?

## Konkurencja

Kto jeszcze to robi? Co robią dobrze? Gdzie mają braki?

## Wnioski

Czego dowiedziałeś/aś się z badań, rozmów, danych?

---
*Wklejaj linki, notatki, podsumowania — wszystko, co wpływa na Twoją strategię.*

${STARS}

[Wklej kontekst tutaj]")

    tab_descs+=("${STARS}
Brudnopis: Twoje notatki o Klientach dla ${upper_entity}

[Pisz tutaj]

${STARS}

# Klienci (Użytkownicy)

## Kim są Twoi użytkownicy?

Opisz idealnego klienta. Demografia, zachowania, problemy.

## Czego potrzebują?

Jaki problem dla nich rozwiązujesz?

## Opinie

Co powiedzieli użytkownicy? Cytaty, recenzje, zgłoszenia.

---
*Twoje AI używa tego, żeby zrozumieć, komu służysz i dlaczego.*

${STARS}

[Wklej kontekst tutaj]")

    tab_descs+=("${STARS}
Brudnopis: Twoje notatki o Specyfikacjach dla ${upper_entity}

[Pisz tutaj]

${STARS}

# Specyfikacje

## Przegląd produktu

Co budujesz? Kluczowe funkcje i możliwości.

## Wymagania techniczne

Stack, architektura, integracje, ograniczenia.

## Definicje funkcji

Szczegółowe specyfikacje funkcji w trakcie realizacji lub planowanych.

---
*Wklejaj PRD-y, briefy funkcji, dokumentację techniczną — im więcej szczegółów, tym lepiej.*

${STARS}

[Wklej kontekst tutaj]")

    tab_descs+=("${STARS}
Brudnopis: Twoje notatki o Transkrypcjach dla ${upper_entity}

[Pisz tutaj]

${STARS}

# Transkrypcje

## Rozmowy wideo

Wklej transkrypcje lub notatki z Zoom, Google Meet, Teams.

## Czaty WhatsApp

Skopiuj i wklej ważne rozmowy i wątki WhatsApp.

## Inne rozmowy

Wątki Slack, wymiana maili, transkrypcje notatek głosowych.

---
*Surowe transkrypcje są w porządku — Context Extractor wyciągnie z nich kluczowe punkty.*

${STARS}

[Wklej kontekst tutaj]")

    tab_descs+=("${STARS}
Brudnopis: Twoje notatki o Promptach dla ${upper_entity}

[Pisz tutaj]

${STARS}

# Prompty

## Ulubione prompty

Jakich promptów używasz najczęściej? Wklej je z opisem, co robią.

## Prompty do wypróbowania

Prompty, które zapisałeś/aś, dodałeś/aś do zakładek, albo chcesz użyć, ale jeszcze tego nie zrobiłeś/aś.

## Prompty do poprawy

Prompty, które działają, ale mogłyby być lepsze. Wklej je i opisz, co chcesz zmienić.

## Styl promptowania

Jak lubisz promptować? Krótko i bezpośrednio, szczegółowo z przykładami, konwersacyjnie? Co działa najlepiej?

---
*Twoje agenty AI używają tego, żeby zrozumieć Twój poziom promptowania i preferencje, i mogą zaproponować ulepszenia.*

${STARS}

[Wklej kontekst tutaj]")

    tab_descs+=("${STARS}
Brudnopis: Twoje notatki o Inne dla ${upper_entity}

[Pisz tutaj]

${STARS}

# Inne

## Notatki ze spotkań

Wrzuć notatki ze spotkań, rozmów, konwersacji.

## Pomysły

Losowe myśli, inspiracje, rzeczy do zbadania później.

## Odniesienia

Linki, artykuły, materiały warte zachowania.

---
*Wszystko, co nie pasuje do innych kart, trafia tutaj. Dodaj więcej kart, jeśli kategoria rozrośnie się wystarczająco.*

${STARS}

[Wklej kontekst tutaj]")
  fi

  local tab_ok=0
  local tab_fail=0
  for i in "${!tab_names[@]}"; do
    local tname="${tab_names[$i]}"
    local tdesc="${tab_descs[$i]}"
    printf "  Creating tab: ${B}${tname}${R}"
    for j in 1 2; do printf "."; sleep 0.1; done

    # Create tab via batchUpdate — use node to safely escape tab name
    local safe_tname; safe_tname=$(node -e "process.stdout.write(JSON.stringify(process.argv[1]).slice(1,-1))" "$tname" 2>/dev/null)
    local tab_result; tab_result=$(run_gws docs documents batchUpdate \
      --params "{\"documentId\": \"${doc_id}\"}" \
      --json "{\"requests\": [{\"addDocumentTab\": {\"tabProperties\": {\"title\": \"${safe_tname}\"}}}]}" 2>/dev/null)

    if [ -n "$tab_result" ]; then
      # Extract the new tab ID — try multiple response paths
      local tab_id; tab_id=$(echo "$tab_result" | node -e "
        const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
        const r=d.replies||[];
        for(const rep of r){
          const at=rep.addDocumentTab||rep.AddDocumentTab||{};
          if(at.tabId){console.log(at.tabId);process.exit(0)}
          if(at.tab&&at.tab.tabProperties){console.log(at.tab.tabProperties.tabId||'');process.exit(0)}
        }
        // Try to get tab from document itself
        const tabs=d.tabs||[];
        if(tabs.length>0){const last=tabs[tabs.length-1];console.log((last.tabProperties||{}).tabId||'');process.exit(0)}
        console.log('');
      " 2>/dev/null) || true

      if [ -n "$tab_id" ]; then
        # Insert text into the new tab — printf converts \n to real newlines, node JSON-escapes
        local json_text; json_text=$(node -e "
          const t=process.argv[1];
          process.stdout.write(JSON.stringify(t).slice(1,-1));" "$tdesc" 2>/dev/null)
        run_gws docs documents batchUpdate \
          --params "{\"documentId\": \"${doc_id}\"}" \
          --json "{\"requests\": [{\"insertText\": {\"text\": \"${json_text}\", \"location\": {\"tabId\": \"${tab_id}\", \"index\": 1}}}]}" > /dev/null 2>&1
        printf " ${G}done${R}\n"
        tab_ok=$((tab_ok + 1))
      else
        # Tab created but can't get ID — try reading the doc to find it
        local doc_data; doc_data=$(run_gws docs documents get --params "{\"documentId\": \"${doc_id}\", \"includeTabsContent\": true}" 2>/dev/null)
        tab_id=$(echo "$doc_data" | node -e "
          const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
          const name=process.argv[1];
          const tabs=d.tabs||[];
          for(const t of tabs){if((t.tabProperties||{}).title===name){console.log(t.tabProperties.tabId||'');process.exit(0)}}
          console.log('');
        " "$tname" 2>/dev/null) || true

        if [ -n "$tab_id" ]; then
          local json_text; json_text=$(printf "%s" "$tdesc" | node -e "
            const t=require('fs').readFileSync('/dev/stdin','utf8');
            process.stdout.write(JSON.stringify(t).slice(1,-1));
          " 2>/dev/null)
          run_gws docs documents batchUpdate \
            --params "{\"documentId\": \"${doc_id}\"}" \
            --json "{\"requests\": [{\"insertText\": {\"text\": \"${json_text}\", \"location\": {\"tabId\": \"${tab_id}\", \"index\": 1}}}]}" > /dev/null 2>&1
          printf " ${G}done${R}\n"
        else
          printf " ${G}created${R} ${D}text skipped${R}\n"
        fi
        tab_ok=$((tab_ok + 1))
      fi
    else
      printf " ${Y}failed${R}\n"
      tab_fail=$((tab_fail + 1))
    fi
  done

  # Try to delete the default "Tab 1" now that other tabs exist
  if [ -n "$default_tab_id" ] && [ $tab_ok -gt 0 ]; then
    # Attempt 1: delete via deleteDocumentTab
    if ! run_gws docs documents batchUpdate \
      --params "{\"documentId\": \"${doc_id}\"}" \
      --json "{\"requests\": [{\"deleteDocumentTab\": {\"tabId\": \"${default_tab_id}\"}}]}" > /dev/null 2>&1; then
      # Attempt 2: delete via deleteTab (alternative API name)
      if ! run_gws docs documents batchUpdate \
        --params "{\"documentId\": \"${doc_id}\"}" \
        --json "{\"requests\": [{\"deleteTab\": {\"tabId\": \"${default_tab_id}\"}}]}" > /dev/null 2>&1; then
        # Deletion failed — rename Tab 1 and write redirect
        run_gws docs documents batchUpdate \
          --params "{\"documentId\": \"${doc_id}\"}" \
          --json "{\"requests\": [{\"updateDocumentTab\": {\"tabProperties\": {\"tabId\": \"${default_tab_id}\", \"title\": \"Start Here\"}, \"fields\": \"title\"}}]}" > /dev/null 2>&1 || true
        local redirect_text="Welcome to your Personal AI Context Dump for ${upper_entity}. Go to the Personal AI tab for instructions."
        local redirect_json; redirect_json=$(node -e "
          const t=process.argv[1];
          process.stdout.write(JSON.stringify(t).slice(1,-1));
        " "$redirect_text" 2>/dev/null) || true
        if [ -n "$redirect_json" ]; then
          run_gws docs documents batchUpdate \
            --params "{\"documentId\": \"${doc_id}\"}" \
            --json "{\"requests\": [{\"insertText\": {\"text\": \"${redirect_json}\", \"location\": {\"tabId\": \"${default_tab_id}\", \"index\": 1}}}]}" > /dev/null 2>&1 || true
        fi
      fi
    fi
  fi

  printf "\n"
  if [ $tab_ok -gt 0 ]; then
    printf "  ${G}✓${R} Template created: ${B}${doc_title}${R}\n"
    printf "    ${D}${tab_ok} tabs created"
    [ $tab_fail -gt 0 ] && printf ", ${tab_fail} failed"
    printf "${R}\n\n"
  else
    printf "  ${G}✓${R} Document created: ${B}${doc_title}${R}\n"
    printf "  ${D}  Tabs could not be created — add sections manually.${R}\n\n"
  fi

  local doc_url="https://docs.google.com/document/d/${doc_id}/edit"
  printf "  ${D}${doc_url}${R}\n\n"
  printf "  ${B}Next steps:${R}\n"
  printf "    1. Open the link above\n"
  printf "    2. Fill in each tab with your context\n"
  printf "    3. Run: ${B}./setup/context-sync.sh --sync ${entity}${R}\n\n"

  # Mark as created
  local dump_marker="$VAULT_PATH/$entity/Logs/.context-dump-created"
  mkdir -p "$(dirname "$dump_marker")"
  date -u +"%Y-%m-%dT%H:%M:%SZ" > "$dump_marker" 2>/dev/null || true
  return 0
}

cmd_sync() {
  local entity="${1:-}"
  require_config
  [ -z "$entity" ] && die "Usage: context-sync.sh --sync <entity>"

  # Verify entity exists
  local found; found=$(node -e "const c=require('${CONFIG_PATH}'); console.log((c.entities||[]).some(e=>e.name==='${entity}')?'yes':'no')" 2>/dev/null)
  [ "$found" != "yes" ] && die "Entity '${entity}' not found in config.json."

  local email; email=$(get_gdrive_email "$entity")
  if [ -z "$email" ]; then
    printf "  ${Y}!${R} No Google Drive connection for ${entity}.\n"
    printf "  ${D}  Run: context-sync.sh --auth <email>${R}\n\n"
    return 1
  fi

  printf "  Syncing ${B}${entity}${R} — ${email}...\n"
  sync_folder "$entity" "$email"
}

cmd_interactive() {
  local entity_arg="${1:-}"
  require_config
  ensure_gws || exit 1

  # ── Welcome screen — no progress bar ────────────────────────
  printf "\n${B}${G}╔${LINE}\n"
  printf "║  Personal AI v${VERSION} — Context Sync\n"
  printf "╚${LINE}${R}\n\n"

  # ── Entity selection ──────────────────────────────────────────
  local entity=""

  if [ -n "$entity_arg" ]; then
    # Entity passed on command line — validate it
    local found; found=$(node -e "const c=require('${CONFIG_PATH}'); console.log((c.entities||[]).some(e=>e.name==='${entity_arg}')?'yes':'no')" 2>/dev/null)
    [ "$found" != "yes" ] && die "Entity '${entity_arg}' not found in config.json."
    entity="$entity_arg"
    printf "  Entity: ${B}${entity}${R}\n\n"
  else
    printf "  Context Sync connects your Google account to Personal AI.\n"
    printf "  Your Google Docs are exported as Markdown and loaded into\n"
    printf "  your Memory, where agents distill them into knowledge.\n\n"

    local entities; entities=$(get_entities)
    local entity_arr=($entities)

    if [ "${#entity_arr[@]}" -eq 0 ]; then
      die "No entities found. Run ./install.sh first."
    elif [ "${#entity_arr[@]}" -eq 1 ]; then
      entity="${entity_arr[0]}"
      printf "  Entity: ${B}${entity}${R}\n\n"
    else
      printf "  ${B}Select entity:${R}\n"
      local idx=1
      for e in "${entity_arr[@]}"; do
        printf "    ${C}%s.${R} %s\n" "$idx" "$e"
        idx=$((idx + 1))
      done
      printf "\n"
      while true; do
        read -rp "  Select [1-${#entity_arr[@]}]: " ECHOICE
        if [[ "$ECHOICE" =~ ^[0-9]+$ ]] && [ "$ECHOICE" -ge 1 ] && [ "$ECHOICE" -le "${#entity_arr[@]}" ]; then
          entity="${entity_arr[$((ECHOICE - 1))]}"
          break
        fi
        printf "  ${Y}Please enter a number between 1 and ${#entity_arr[@]}.${R}\n"
      done
      printf "\n  Entity: ${B}${entity}${R}\n\n"
    fi
  fi

  # ── Check for stored email + existing auth ──────────────────
  local email=""
  local connected=false

  # Try to load stored email for this entity
  email=$(get_gdrive_email "$entity")

  if [ -n "$email" ]; then
    # Activate per-account config directory, then check if auth exists
    set_gws_account "$email"
    printf "  Connecting"
    for i in 1 2 3; do printf "."; sleep 0.1; done
    local active_email; active_email=$(get_active_gws_email)
    if [ "$active_email" = "$email" ]; then
      connected=true
      printf " ${G}connected${R} (${email})\n\n"
    else
      printf " ${Y}needs authentication${R}\n\n"
    fi
  fi

  if ! $connected; then
    # ── Step 1: Google account ──────────────────────────────────
    if [ -z "$email" ]; then
      step_banner 1 3 "Google Account" \
        "Which Google account holds your docs for ${entity}?" \
        "@gmail.com users — just type your username, e.g. john"

      while true; do
        read -rp "  Google account name: " email
        if [ -z "$email" ]; then
          printf "  ${Y}Google account is required for Context Sync.${R}\n"
          continue
        fi
        # Auto-append @gmail.com if no @ present
        if [[ "$email" != *@* ]]; then
          email="${email}@gmail.com"
        fi
        printf "  ${D}→ ${email}${R}\n\n"
        break
      done
    fi

    # Activate per-account config directory for this email
    set_gws_account "$email"

    # ── Step 2: OAuth authentication ────────────────────────────
    step_banner 2 3 "Authenticate" \
      "A scope selector will open — use arrow keys to select Recommended" \
      "Press Space to select, then Enter to confirm"

    printf "  ${B}What will happen:${R}\n"
    printf "    1. A scope selector opens in this terminal\n"
    printf "       ${D}Use arrow keys to navigate to ${B}Recommended${D},${R}\n"
    printf "       ${D}press ${B}Space${D} to select it, then ${B}Enter${D} to confirm${R}\n"
    printf "    2. Open the URL displayed in your browser\n"
    printf "       ${D}Sign in with ${B}${email}${D} and approve access${R}\n\n"

    while true; do
      read -rp "  Ready to launch Google OAuth? [y]: " OAUTH_READY
      [ -z "$OAUTH_READY" ] || [[ "$OAUTH_READY" == [yY]* ]] && break
    done
    printf "\n"

    # Clear ALL .enc files and re-auth — gws only supports one active account
    gws_force_login "$email"
    local auth_rc=$?
    if [ $auth_rc -eq 0 ]; then
      printf "\n  Verifying"
      for i in 1 2 3 4 5; do printf "."; sleep 0.15; done
      local verified_email; verified_email=$(get_active_gws_email)
      if [ "$verified_email" = "$email" ]; then
        printf " ${G}connected${R} (${email})\n\n"
        connected=true
      else
        printf " ${G}connected${R}\n\n"
        connected=true
      fi
    else
      printf "\n  ${Y}!${R} Auth failed. Check your Google Cloud project setup.\n\n"
      return 1
    fi
  fi

  log_setup "GDRIVE_CONNECTED" "$entity" 50 "$email"
  save_sync_state "$entity" "$email" 0

  # ── Step 3: Connected + sync options ────────────────────────
  step_banner 3 3 "Connected" \
    "Google Docs are exported as .md into your Memory" \
    "Context Extractor then distills your knowledge for Agents"

  printf "  ${G}✓${R} Google Drive: ${B}${email}${R}\n"
  printf "  ${G}✓${R} Connected\n\n"

  printf "  What would you like to do?\n\n"
  printf "    ${C}1.${R} ${B}Create Context Dump template${R}\n"
  printf "       ${D}A Google Doc with tabs — NORTHSTAR, Research, Specs, etc.${R}\n"
  printf "       ${D}Each tab has instructions. Fill it in, then sync later.${R}\n\n"
  printf "    ${C}2.${R} ${B}Sync an existing Google Doc${R}\n"
  printf "       ${D}Pick a doc from your Drive — downloads it as .md into${R}\n"
  printf "       ${D}your Memory. Context Extractor processes it immediately.${R}\n\n"

  while true; do
    read -rp "  Select [1/2]: " SYNC_CHOICE
    case "$SYNC_CHOICE" in
      1) create_context_dump "$entity" "$email"; break ;;
      2) sync_single_file "$entity" "$email"; break ;;
      *) printf "  ${Y}Please enter 1 or 2.${R}\n" ;;
    esac
  done
}

# ══════════════════════════════════════════════════════════════════════════
# MAIN
# ══════════════════════════════════════════════════════════════════════════

case "${1:-}" in
  --help|-h)
    cmd_help
    ;;
  --auth)
    cmd_auth "${2:-}"
    ;;
  --status)
    cmd_status
    ;;
  --sync)
    cmd_sync "${2:-}"
    ;;
  --lang-polish)
    TEMPLATE_LANG="pl"
    cmd_interactive "${2:-}"
    ;;
  "")
    cmd_interactive
    ;;
  *)
    # Treat first arg as entity name, optional --lang-polish as second
    if [[ "${2:-}" == "--lang-polish" ]]; then
      TEMPLATE_LANG="pl"
    fi
    cmd_interactive "$1"
    ;;
esac
