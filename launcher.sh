#!/usr/bin/env bash
set -euo pipefail

# ── Mototelos Motorcycle Dynamics — Launcher ──────────────────────────────────
# Launches the backend (FastAPI) and frontend (SvelteKit) dev servers.
# If already running, kills existing processes and restarts.

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$PROJECT_DIR/backend"
FRONTEND_DIR="$PROJECT_DIR/frontend"
BACKEND_PORT=8000
FRONTEND_PORT=5173
BACKEND_PID_FILE="$PROJECT_DIR/.backend.pid"
FRONTEND_PID_FILE="$PROJECT_DIR/.frontend.pid"

# ── Helpers ───────────────────────────────────────────────────────────────────

kill_if_running() {
    local pid_file="$1"
    local label="$2"
    if [[ -f "$pid_file" ]]; then
        local pid
        pid=$(<"$pid_file")
        if kill -0 "$pid" 2>/dev/null; then
            echo "Stopping existing $label (PID $pid)..."
            kill "$pid" 2>/dev/null || true
            sleep 1
            kill -0 "$pid" 2>/dev/null && kill -9 "$pid" 2>/dev/null || true
        fi
        rm -f "$pid_file"
    fi
    # Also kill anything on the port as a fallback
    local port_pid
    port_pid=$(lsof -ti :"${3}" 2>/dev/null || true)
    if [[ -n "$port_pid" ]]; then
        echo "Killing process on port ${3} (PID $port_pid)..."
        echo "$port_pid" | xargs kill 2>/dev/null || true
        sleep 1
    fi
}

check_python() {
    if command -v python3 &>/dev/null; then
        echo "python3"
    elif command -v python &>/dev/null; then
        echo "python"
    else
        echo "ERROR: Python not found. Install Python 3.12+." >&2
        exit 1
    fi
}

check_node() {
    if ! command -v node &>/dev/null; then
        echo "ERROR: Node.js not found. Install Node.js 20+." >&2
        exit 1
    fi
    if ! command -v npm &>/dev/null; then
        echo "ERROR: npm not found." >&2
        exit 1
    fi
}

# ── Main ──────────────────────────────────────────────────────────────────────

echo "============================================"
echo "  Mototelos Motorcycle Dynamics — Launcher"
echo "============================================"
echo ""

PYTHON=$(check_python)
check_node

# Kill existing instances
kill_if_running "$BACKEND_PID_FILE" "backend" "$BACKEND_PORT"
kill_if_running "$FRONTEND_PID_FILE" "frontend" "$FRONTEND_PORT"

# ── Backend setup ─────────────────────────────────────────────────────────────

echo "Setting up backend..."

# Create venv if it doesn't exist
if [[ ! -d "$BACKEND_DIR/.venv" ]]; then
    echo "Creating Python virtual environment..."
    "$PYTHON" -m venv "$BACKEND_DIR/.venv"
fi

# Activate and install deps
source "$BACKEND_DIR/.venv/bin/activate"
pip install -q -r "$BACKEND_DIR/requirements.txt"

# Start backend
echo "Starting backend on http://localhost:$BACKEND_PORT ..."
cd "$BACKEND_DIR"
uvicorn app.main:app --host 0.0.0.0 --port "$BACKEND_PORT" --reload &
BACKEND_PID=$!
echo "$BACKEND_PID" > "$BACKEND_PID_FILE"
cd "$PROJECT_DIR"

# ── Frontend setup ────────────────────────────────────────────────────────────

echo "Setting up frontend..."

# Install npm deps if needed
if [[ ! -d "$FRONTEND_DIR/node_modules" ]]; then
    echo "Installing npm dependencies..."
    cd "$FRONTEND_DIR"
    npm install
    cd "$PROJECT_DIR"
fi

# Start frontend
echo "Starting frontend on http://localhost:$FRONTEND_PORT ..."
cd "$FRONTEND_DIR"
npm run dev -- --host 0.0.0.0 --port "$FRONTEND_PORT" &
FRONTEND_PID=$!
echo "$FRONTEND_PID" > "$FRONTEND_PID_FILE"
cd "$PROJECT_DIR"

# ── Done ──────────────────────────────────────────────────────────────────────

echo ""
echo "============================================"
echo "  Backend:  http://localhost:$BACKEND_PORT"
echo "  API docs: http://localhost:$BACKEND_PORT/docs"
echo "  Frontend: http://localhost:$FRONTEND_PORT"
echo "============================================"
echo ""
echo "Press Ctrl+C to stop both servers."

# Trap Ctrl+C to clean up both processes
cleanup() {
    echo ""
    echo "Shutting down..."
    kill "$BACKEND_PID" 2>/dev/null || true
    kill "$FRONTEND_PID" 2>/dev/null || true
    rm -f "$BACKEND_PID_FILE" "$FRONTEND_PID_FILE"
    wait 2>/dev/null
    echo "Done."
    exit 0
}
trap cleanup INT TERM

# Wait for either process to exit
wait
