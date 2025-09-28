#!/bin/bash

# Kamui OS 全サービス起動スクリプト
# このスクリプトは以下のサービスを起動します：
# - Node.js backend server (port 7777)
# - Hugo development server (port 1313)

# スクリプトのディレクトリを取得
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# 色付きのログ出力用関数
function log_info() {
    printf "\033[1;34m[INFO]\033[0m %s\n" "$1"
}

function log_success() {
    printf "\033[1;32m[SUCCESS]\033[0m %s\n" "$1"
}

function log_error() {
    printf "\033[1;31m[ERROR]\033[0m %s\n" "$1"
}

function log_warn() {
    printf "\033[1;33m[WARNING]\033[0m %s\n" "$1"
}

# ブラウザを自動起動する（Termux等の環境にも対応）
function open_browser() {
    local url="$1"

    if [ -z "$url" ]; then
        log_warn "No URL provided to open_browser."
        return 1
    fi

    if command -v termux-open-url >/dev/null 2>&1; then
        log_info "Opening $url via termux-open-url..."
        termux-open-url "$url" >/dev/null 2>&1 &
        return 0
    fi

    if command -v xdg-open >/dev/null 2>&1; then
        log_info "Opening $url via xdg-open..."
        xdg-open "$url" >/dev/null 2>&1 &
        return 0
    fi

    if command -v open >/dev/null 2>&1; then
        log_info "Opening $url via open..."
        open "$url" >/dev/null 2>&1 &
        return 0
    fi

    if command -v wslview >/dev/null 2>&1; then
        log_info "Opening $url via wslview..."
        wslview "$url" >/dev/null 2>&1 &
        return 0
    fi

    if [ "${OS:-}" = "Windows_NT" ]; then
        log_info "Opening $url via cmd.exe start..."
        cmd.exe /C start "" "$url" >/dev/null 2>&1
        return 0
    fi

    log_warn "Automatic browser launch not supported. Please open $url manually."
    return 1
}

# PIDファイルの設定
PIDS_DIR="$SCRIPT_DIR/.pids"
mkdir -p "$PIDS_DIR"

# .envファイルの存在確認
if [ ! -f "$SCRIPT_DIR/.env" ]; then
    log_error ".env file not found! Please copy env.sample to .env and configure it."
    exit 1
fi

# 既存のプロセスを停止する関数
function stop_all() {
    if command -v screen >/dev/null 2>&1; then
        log_info "Stopping all screen sessions..."
        if screen -list | grep -q "kamui_backend"; then screen -X -S kamui_backend quit; log_info "Stopped screen session: kamui_backend"; fi
        if screen -list | grep -q "kamui_main"; then screen -X -S kamui_main quit; log_info "Stopped screen session: kamui_main"; fi
        if screen -list | grep -q "kamui_hugo"; then screen -X -S kamui_hugo quit; log_info "Stopped screen session: kamui_hugo"; fi
    else
        log_info "Stopping all services using PID files..."
        if [ -f "$PIDS_DIR/node_server.pid" ]; then PID=$(cat "$PIDS_DIR/node_server.pid"); if kill -0 $PID 2>/dev/null; then kill $PID; log_info "Stopped Node.js server (PID: $PID)"; fi; rm -f "$PIDS_DIR/node_server.pid"; fi
        if [ -f "$PIDS_DIR/main_server.pid" ]; then PID=$(cat "$PIDS_DIR/main_server.pid"); if kill -0 $PID 2>/dev/null; then kill $PID; log_info "Stopped Node.js main server (PID: $PID)"; fi; rm -f "$PIDS_DIR/main_server.pid"; fi
        if [ -f "$PIDS_DIR/hugo_server.pid" ]; then PID=$(cat "$PIDS_DIR/hugo_server.pid"); if kill -0 $PID 2>/dev/null; then kill $PID; log_info "Stopped Hugo server (PID: $PID)"; fi; rm -f "$PIDS_DIR/hugo_server.pid"; fi
    fi
}

# Ctrl+Cで終了時にすべてのサービスを停止
trap 'printf "\n"; log_warn "Interrupted. Stopping all services..."; stop_all; exit 0' INT TERM

# 引数チェック
if [ "$1" = "stop" ]; then
    stop_all
    log_success "All services stopped."
    exit 0
fi

# 既存のプロセスがあれば停止
stop_all

# 環境変数を読み込む
log_info "Loading environment variables from .env..."
if [ -f .env ]; then
    set -a  # 自動的にexportする
    source .env
    set +a  # 自動exportを無効化
else
    log_error ".env file not found!"
    exit 1
fi

# 必要な環境変数の確認
if [ -z "$ANTHROPIC_API_KEY" ] && [ -z "$CLAUDE_API_KEY" ]; then
    log_error "ANTHROPIC_API_KEY or CLAUDE_API_KEY must be set in .env file!"
    exit 1
fi

if [ -z "$MCP_BASE_URL" ]; then
    log_error "MCP_BASE_URL must be set in .env file!"
    exit 1
fi

# 環境変数の確認（デバッグ用）
LOG_INFO_MCP_PATH="(env override)"
if [ -n "$CLAUDE_MCP_CONFIG_PATH" ]; then
    MCP_CONFIG_PATH="$CLAUDE_MCP_CONFIG_PATH"
else
    MCP_CONFIG_PATH="$SCRIPT_DIR/mcp/config.json"
    export CLAUDE_MCP_CONFIG_PATH="$MCP_CONFIG_PATH"
    LOG_INFO_MCP_PATH="(auto)"
fi

log_info "Environment variables loaded:"
log_info "  ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY:0:20}...${ANTHROPIC_API_KEY: -4}"
log_info "  CLAUDE_MCP_CONFIG_PATH: $CLAUDE_MCP_CONFIG_PATH $LOG_INFO_MCP_PATH"
log_info "  CLAUDE_SKIP_PERMISSIONS: $CLAUDE_SKIP_PERMISSIONS"
log_info "  CLAUDE_DEBUG: $CLAUDE_DEBUG"

if [ ! -f "$CLAUDE_MCP_CONFIG_PATH" ]; then
    log_error "MCP config file not found at: $CLAUDE_MCP_CONFIG_PATH"
    exit 1
fi

MCP_STATIC_DIR="$SCRIPT_DIR/static/mcp"
if [ -f "$CLAUDE_MCP_CONFIG_PATH" ]; then
    mkdir -p "$MCP_STATIC_DIR"
    if ! cp "$CLAUDE_MCP_CONFIG_PATH" "$MCP_STATIC_DIR/config.json"; then
        log_warn "Failed to copy MCP config into static directory"
    fi
fi

# ログディレクトリの作成
LOGS_DIR="$SCRIPT_DIR/logs"
mkdir -p "$LOGS_DIR"
touch "$LOGS_DIR/node_server.log" "$LOGS_DIR/main_server.log" "$LOGS_DIR/hugo_server.log"

# Node.js依存関係のインストールチェック（プロジェクト直下）
if [ -f "$SCRIPT_DIR/package.json" ] && [ ! -d "$SCRIPT_DIR/node_modules" ]; then
    log_info "Installing Node.js dependencies (root)..."
    if ! npm install --no-progress --prefer-offline &> "$LOGS_DIR/npm_install_root.log"; then
        log_error "npm install failed. See logs/npm_install_root.log"
        exit 1
    fi
    log_success "Root dependencies installed."
fi

# 1. Node.js backend server の起動
if command -v screen >/dev/null 2>&1; then
    log_info "Starting Node.js backend server in a screen session 'kamui_backend'..."
    screen -S kamui_backend -dm bash -c "cd '$SCRIPT_DIR/backend' && node server.js > '$LOGS_DIR/node_server.log' 2>&1"
else
    log_info "Starting Node.js backend server on port ${PORT:-7777}..."
    cd "$SCRIPT_DIR/backend"
    nohup node server.js > "$LOGS_DIR/node_server.log" 2>&1 &
    NODE_PID=$!
    mkdir -p "$PIDS_DIR"
    echo $NODE_PID > "$PIDS_DIR/node_server.pid"
fi
sleep 2

# 2. Node.js main server (upload/expose proxy) の起動
if command -v screen >/dev/null 2>&1; then
    log_info "Starting Node.js main server in a screen session 'kamui_main'..."
    screen -S kamui_main -dm bash -c "cd '$SCRIPT_DIR' && node server.js > '$LOGS_DIR/main_server.log' 2>&1"
else
    cd "$SCRIPT_DIR"
    log_info "Starting Node.js main server on port 3001..."
    nohup node server.js > "$LOGS_DIR/main_server.log" 2>&1 &
    MAIN_PID=$!
    mkdir -p "$PIDS_DIR"
    echo $MAIN_PID > "$PIDS_DIR/main_server.pid"
fi
sleep 2

# 3. Hugo development server の起動
if command -v screen >/dev/null 2>&1; then
    log_info "Starting Hugo development server in a screen session 'kamui_hugo'..."
    screen -S kamui_hugo -dm bash -c "cd '$SCRIPT_DIR' && hugo server -D -p 1313 > '$LOGS_DIR/hugo_server.log' 2>&1"
else
    log_info "Starting Hugo development server on port 1313..."
    cd "$SCRIPT_DIR"
    nohup hugo server -D -p 1313 > "$LOGS_DIR/hugo_server.log" 2>&1 &
    HUGO_PID=$!
    mkdir -p "$PIDS_DIR"
    echo $HUGO_PID > "$PIDS_DIR/hugo_server.pid"
fi
sleep 3

# サービス情報の表示
printf "\n"
log_success "All services started!"
printf "\n"
printf "Service URLs:\n"
printf "  - Kamui OS (Hugo):     http://localhost:1313/\n"
printf "  - Node.js API:         http://localhost:%s/\n" "${PORT:-7777}"
printf "  - Upload API Proxy:    http://localhost:3001/\n"
printf "\n"
printf "To stop all services, run: ./start_all.sh stop\n"
if command -v screen >/dev/null 2>&1; then
    printf "To view logs, attach to screen sessions (e.g., screen -r kamui_hugo).\n"
else
    printf "Log files are in the 'logs' directory.\n"
fi
printf "Press Ctrl+C to stop this script (if tailing logs).\n"

# 自動でブラウザを起動
KAMUI_URL="http://localhost:1313/"
if [ "${SKIP_AUTO_BROWSER:-0}" != "1" ]; then
    log_info "Attempting to launch browser for $KAMUI_URL"
    if open_browser "$KAMUI_URL"; then
        log_success "Requested browser launch for $KAMUI_URL"
    else
        log_warn "Could not open browser automatically. Access $KAMUI_URL manually."
    fi
else
    log_info "SKIP_AUTO_BROWSER=1 が設定されているためブラウザ起動をスキップしました。"
fi
printf "\n"
log_info "Startup script finished. Services are running in the background."
