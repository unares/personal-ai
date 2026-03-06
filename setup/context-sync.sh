#!/bin/bash
# Personal AI — Google Drive Context Sync
# Syncs Google Docs into memory-vault Raw/ for Context Extractor.
# Uses Google Workspace CLI (gws) — https://github.com/googleworkspace/cli
#
# Usage:
#   context-sync.sh                    # interactive: pick entity, show menu
#   context-sync.sh --status           # show all entities' Drive connection status
#   context-sync.sh --sync <entity>    # trigger sync for entity
#   context-sync.sh --auth <email>     # authenticate Google account
#   context-sync.sh --help             # show usage
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
source "$REPO_DIR/version.sh"
VAULT_PATH="$REPO_DIR/memory-vault"
CONFIG_PATH="$REPO_DIR/config.json"

G="\033[32m" Y="\033[33m" C="\033[36m" B="\033[1m" D="\033[2m" R="\033[0m"
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
  [ -f "$state_file" ] && node -e "const s=JSON.parse(require('fs').readFileSync('${state_file}','utf8')); console.log(s.email||'')" 2>/dev/null || echo ""
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

gws_account_flag() {
  local email="${1:-}"
  if [ -n "$email" ]; then
    echo "--account $email"
  fi
}

list_google_docs() {
  local email="${1:-}"
  local acct; acct=$(gws_account_flag "$email")
  gws $acct drive files list --params '{"q": "mimeType=\"application/vnd.google-apps.document\"", "pageSize": 50, "fields": "files(id,name,modifiedTime)"}' 2>/dev/null
}

list_drive_folders() {
  local email="${1:-}"
  local acct; acct=$(gws_account_flag "$email")
  gws $acct drive files list --params '{"q": "mimeType=\"application/vnd.google-apps.folder\"", "pageSize": 50, "fields": "files(id,name)"}' 2>/dev/null
}

list_docs_in_folder() {
  local folder_id="$1" email="${2:-}"
  local acct; acct=$(gws_account_flag "$email")
  gws $acct drive files list --params "{\"q\": \"'${folder_id}' in parents and mimeType='application/vnd.google-apps.document'\", \"pageSize\": 50, \"fields\": \"files(id,name,modifiedTime)\"}" 2>/dev/null
}

export_doc_as_md() {
  local doc_id="$1" output_path="$2" email="${3:-}"
  local acct; acct=$(gws_account_flag "$email")
  local tmp_file="/tmp/pai-export-${doc_id}.md"

  # Try markdown export first (available since mid-2024)
  if gws $acct drive files export --params "{\"fileId\": \"${doc_id}\", \"mimeType\": \"text/markdown\"}" > "$tmp_file" 2>/dev/null && [ -s "$tmp_file" ]; then
    mv "$tmp_file" "$output_path"
    return 0
  fi

  # Fallback: plain text export
  if gws $acct drive files export --params "{\"fileId\": \"${doc_id}\", \"mimeType\": \"text/plain\"}" > "$tmp_file" 2>/dev/null && [ -s "$tmp_file" ]; then
    mv "$tmp_file" "$output_path"
    return 0
  fi

  rm -f "$tmp_file"
  return 1
}

create_google_doc() {
  local title="$1" email="${2:-}"
  local acct; acct=$(gws_account_flag "$email")
  gws $acct docs documents create --json "{\"title\": \"${title}\"}" 2>/dev/null
}

write_to_google_doc() {
  local doc_id="$1" content="$2" email="${3:-}"
  local acct; acct=$(gws_account_flag "$email")
  # Use the gws docs +write skill for appending content
  gws $acct docs +write --document-id "$doc_id" --text "$content" 2>/dev/null
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

  ensure_gws || exit 1

  printf "${B}${G}╔${LINE}\n"
  printf "║  Personal AI v${VERSION} — Google Drive Authentication\n"
  printf "╚${LINE}${R}\n\n"

  printf "  Authenticating ${B}${email}${R}...\n\n"
  printf "  ${B}Two steps:${R}\n"
  printf "    1. Select scopes — pick ${B}Recommended${R} and press Enter\n"
  printf "    2. Open the URL in your browser to authorize\n\n"

  if gws auth login --account "$email" --scopes drive,docs; then
    printf "\n  ${G}✓${R} Google Drive authenticated for ${B}${email}${R}\n"

    # Set as default account for convenience
    gws auth default "$email" 2>/dev/null || true

    log_setup "GDRIVE_CONNECTED" "" 50 "$email"
    printf "  ${G}+50 Pts.${R} for connecting Google Drive!\n\n"

    # Quick test: list files
    printf "  Verifying access...\n"
    local test_result; test_result=$(gws --account "$email" drive files list --params '{"pageSize": 1, "fields": "files(id)"}' 2>/dev/null) || true
    if [ -n "$test_result" ]; then
      printf "  ${G}✓${R} Drive access confirmed\n\n"
    else
      printf "  ${Y}!${R} Auth succeeded but Drive access could not be verified.\n"
      printf "  ${D}  Try: gws --account ${email} drive files list${R}\n\n"
    fi
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
      printf "    Google Drive:  ${G}✓${R} connected (${email})\n"
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

  printf "\n  Listing your Google Docs...\n\n"
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

  # Display numbered list
  echo "$doc_list" | node -e "
    const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
    (d.files||[]).forEach((f,i) => {
      const mod = f.modifiedTime ? '  ' + f.modifiedTime.substring(0,10) : '';
      console.log('    ' + (i+1) + '. ' + f.name + '\x1b[2m' + mod + '\x1b[0m');
    });
  " 2>/dev/null

  printf "\n"
  read -rp "  Select document number: " DOC_NUM

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
  local safe_name; safe_name=$(echo "$doc_name" | tr ' ' '-' | tr -cd '[:alnum:]-_')
  local output_dir="$VAULT_PATH/$entity/Raw/Other"
  mkdir -p "$output_dir"
  local output_path="$output_dir/${safe_name}.md"

  printf "\n  Exporting ${B}${doc_name}${R}...\n"
  local bar; bar=$(progress_bar 8 16)
  printf "  [${bar}] exporting...\r"

  if export_doc_as_md "$doc_id" "$output_path" "$email"; then
    bar=$(progress_bar 16 16)
    printf "  [${bar}] done ${G}✓${R}    \n"
    printf "  ${G}✓${R} ${doc_name} → Raw/Other/${safe_name}.md\n"
    printf "  ${D}Context Extractor will distill it automatically.${R}\n\n"
    save_sync_state "$entity" "$email" 1
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
    local safe; safe=$(echo "$dname" | tr ' ' '-' | tr -cd '[:alnum:]-_')
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

  local doc_title="${entity}'s PersonalAI context dump"
  printf "\n  Creating ${B}${doc_title}${R} in Google Docs...\n\n"

  # Create the doc via gws Docs API
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

  # Write the template content section by section
  local content="# ${entity}'s PersonalAI Context Dump

What is this?

This document is a structured brain dump for your Personal AI system.
Everything you write here gets synced to your entity vault and distilled
by Context Extractor into actionable knowledge for Clark and AIOO.

How to use it:
1. Write freely in each section below
2. Don't worry about formatting — raw thoughts are fine
3. Volume matters — the more context you provide, the better your AI agents understand you
4. Run context-sync.sh --sync ${entity} to pull updates into your vault

---

CLARK — Strategic Thinking
Scope: Long-term vision, priorities, what matters most
Do: brain-dump strategy, doubts, big decisions pending
Don't: list tasks — that's AIOO's job

[Write here]

---

SUBMISSIONS — Work in Progress
Scope: Things you're actively working on or submitting
Do: paste drafts, proposals, applications

[Write here]

---

HITLs — Human-in-the-Loop Decisions
Scope: Decisions that need your input before AI can proceed
Do: record your reasoning, preferences, constraints

[Write here]

---

CODING — Technical Context
Scope: Code-related notes, architecture decisions, tech stack
Do: paste error messages, architecture diagrams, API notes

[Write here]

---

AIOO — Operational Notes
Scope: Day-to-day operations, processes, workflows
Do: describe how things work, recurring tasks, SOPs

[Write here]

---

OTHER — Everything Else
Scope: Anything that doesn't fit above
Do: meeting notes, random ideas, links, references

[Write here]"

  printf "  Writing template content...\n"
  if write_to_google_doc "$doc_id" "$content" "$email"; then
    printf "  ${G}✓${R} Context dump created: ${B}${doc_title}${R}\n"
    printf "  ${D}  Open it in Google Drive, fill in the sections, then run:${R}\n"
    printf "  ${D}  context-sync.sh --sync ${entity}${R}\n\n"
  else
    printf "  ${G}✓${R} Document created (template write may need manual editing)\n"
    printf "  ${D}  Find \"${doc_title}\" in Google Drive and fill it in.${R}\n\n"
  fi

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

  printf "  Syncing ${B}${entity}${R} (${email})...\n"
  sync_folder "$entity" "$email"
}

cmd_interactive() {
  require_config
  ensure_gws || exit 1

  printf "${B}${G}╔${LINE}\n"
  printf "║  Personal AI v${VERSION} — Context Sync\n"
  printf "╚${LINE}${R}\n\n"

  local entities; entities=$(get_entities)
  local entity_arr=($entities)
  local entity=""

  if [ "${#entity_arr[@]}" -eq 0 ]; then
    die "No entities found. Run ./install.sh first."
  elif [ "${#entity_arr[@]}" -eq 1 ]; then
    entity="${entity_arr[0]}"
    printf "  Entity: ${B}${entity}${R}\n\n"
  else
    printf "  ${B}Select entity (enter number):${R}\n"
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

  # Determine email from existing state or prompt
  local email; email=$(get_gdrive_email "$entity")
  if [ -z "$email" ]; then
    printf "  ${D}No Google Drive connected for ${entity}.${R}\n"
    read -rp "  Google account email (or Enter to skip): " email
    if [ -z "$email" ]; then
      printf "  ${D}Skipped.${R}\n\n"
      return 0
    fi
    # Check if already authenticated with gws
    if gws --account "$email" drive files list --params '{"pageSize": 1, "fields": "files(id)"}' > /dev/null 2>&1; then
      printf "  ${G}✓${R} Already authenticated as ${B}${email}${R}\n\n"
    else
      printf "  Authenticating ${B}${email}${R}...\n\n"
      printf "  ${B}Two steps:${R}\n"
      printf "    1. Select scopes — pick ${B}Recommended${R} and press Enter\n"
      printf "    2. Open the URL in your browser to authorize\n\n"
      if gws auth login --account "$email" --scopes drive,docs; then
        printf "  ${G}✓${R} Connected\n\n"
      else
        printf "  ${Y}!${R} Auth failed. Run: context-sync.sh --auth ${email}\n\n"
        return 1
      fi
    fi
    log_setup "GDRIVE_CONNECTED" "$entity" 50 "$email"
    save_sync_state "$entity" "$email" 0
  fi

  step_banner 2 3 "Context Sync — ${entity}" \
    "Google Drive powers context loading for your entity" \
    "Files are exported as .md and processed by Context Extractor" \
    "+50 Pts. for connecting Google Drive!"

  printf "  What would you like to do?\n"
  printf "    ${C}1.${R} Upload a single file          ${D}(pick one Google Doc)${R}\n"
  printf "    ${C}2.${R} Upload a folder               ${D}(all docs in a Drive folder)${R}\n"
  printf "    ${C}3.${R} Create Context Dump template  ${D}(empty skeleton doc for later sync)${R}\n"
  printf "    ${C}S.${R} Skip\n\n"

  read -rp "  Select [1/2/3/S]: " SYNC_CHOICE
  case "$SYNC_CHOICE" in
    1) sync_single_file "$entity" "$email" ;;
    2) sync_folder "$entity" "$email" ;;
    3) create_context_dump "$entity" "$email" ;;
    [Ss]) printf "  ${D}Skipped.${R}\n\n" ;;
    *) printf "  ${Y}Invalid selection.${R}\n\n" ;;
  esac
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
  "")
    cmd_interactive
    ;;
  *)
    printf "  ${Y}Unknown option:${R} $1\n"
    cmd_help
    exit 1
    ;;
esac
