#!/usr/bin/env python3
"""
launcher.py - Windows launcher for Mototelos Motorcycle Dynamics.
Compatible with Local Hoster (accepts -p/-b port flags and --stop).

Supports:
    python launcher.py                  # Start the app
    python launcher.py -p 5173 -b 8000  # Start with custom ports
    python launcher.py --stop           # Stop the app via PID files
"""

import argparse
import os
import platform
import signal
import subprocess
import sys
import time

ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.join(ROOT_DIR, "backend")
FRONTEND_DIR = os.path.join(ROOT_DIR, "frontend")
BACKEND_PID_FILE = os.path.join(ROOT_DIR, ".backend.pid")
FRONTEND_PID_FILE = os.path.join(ROOT_DIR, ".frontend.pid")

IS_WINDOWS = platform.system() == "Windows"
MIN_PYTHON = (3, 10)


def _find_suitable_python():
    """Find a Python >= MIN_PYTHON for creating the venv.

    On Windows, tries the 'py' launcher first (picks newest installed).
    Falls back to sys.executable.
    """
    if IS_WINDOWS:
        # Try the Windows Python Launcher which finds the best installed version
        try:
            result = subprocess.run(
                ["py", "-3", "--version"],
                capture_output=True, text=True
            )
            if result.returncode == 0:
                # Parse version from "Python 3.x.y"
                ver_str = result.stdout.strip().split()[1]
                parts = tuple(int(x) for x in ver_str.split(".")[:2])
                if parts >= MIN_PYTHON:
                    return ["py", "-3"]
        except FileNotFoundError:
            pass

    if sys.version_info >= MIN_PYTHON:
        return [sys.executable]

    sys.exit(
        f"ERROR: Python {MIN_PYTHON[0]}.{MIN_PYTHON[1]}+ is required "
        f"(you are running {sys.version_info.major}.{sys.version_info.minor} "
        f"from {sys.executable}).\n"
        f"Install a newer Python and re-run this script with it,\n"
        f"or ensure the 'py' launcher is installed (comes with python.org builds)."
    )


def _wait_for_port(port, timeout=15):
    """Block until localhost:port accepts a TCP connection."""
    import socket
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with socket.create_connection(("127.0.0.1", port), timeout=1):
                return True
        except OSError:
            time.sleep(0.5)
    print(f"WARNING: port {port} not reachable after {timeout}s")
    return False


def get_venv_python():
    """Return the path to the venv python, or sys.executable as fallback."""
    if IS_WINDOWS:
        venv_python = os.path.join(BACKEND_DIR, ".venv", "Scripts", "python.exe")
    else:
        venv_python = os.path.join(BACKEND_DIR, ".venv", "bin", "python")
    return venv_python if os.path.isfile(venv_python) else sys.executable


def kill_pid(pid):
    """Kill a process by PID, including child processes on Windows."""
    if IS_WINDOWS:
        subprocess.call(
            ["taskkill", "/F", "/T", "/PID", str(pid)],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
    else:
        try:
            os.killpg(os.getpgid(pid), signal.SIGTERM)
        except (ProcessLookupError, PermissionError, OSError):
            pass


def kill_port(port):
    """Kill whatever process is using the given port."""
    if IS_WINDOWS:
        result = subprocess.run(
            ["netstat", "-ano", "-p", "TCP"],
            capture_output=True, text=True
        )
        for line in result.stdout.splitlines():
            if f":{port}" in line and "LISTENING" in line:
                parts = line.split()
                pid = int(parts[-1])
                kill_pid(pid)
    else:
        result = subprocess.run(
            ["lsof", "-ti", f":{port}"],
            capture_output=True, text=True
        )
        for pid_str in result.stdout.strip().splitlines():
            try:
                os.kill(int(pid_str), signal.SIGTERM)
            except (ProcessLookupError, PermissionError):
                pass


def stop(frontend_port, backend_port):
    """Stop running servers using PID files and port fallback."""
    for pid_file, label in [
        (BACKEND_PID_FILE, "backend"),
        (FRONTEND_PID_FILE, "frontend"),
    ]:
        if os.path.isfile(pid_file):
            with open(pid_file, "r") as f:
                pid = int(f.read().strip())
            print(f"Stopping {label} (PID {pid})...")
            kill_pid(pid)
            os.remove(pid_file)

    # Kill by port as fallback
    kill_port(backend_port)
    kill_port(frontend_port)
    print("Stopped.")


def start(frontend_port, backend_port):
    """Start backend and frontend servers."""
    print("=" * 44)
    print("  Mototelos Motorcycle Dynamics — Launcher")
    print("=" * 44)
    print()

    # Kill existing instances
    stop(frontend_port, backend_port)
    time.sleep(1)

    # ── Backend setup ──
    print("Setting up backend...")
    venv_dir = os.path.join(BACKEND_DIR, ".venv")
    if not os.path.isdir(venv_dir):
        print("Creating Python virtual environment...")
        py_cmd = _find_suitable_python()
        subprocess.run(py_cmd + ["-m", "venv", venv_dir], check=True)

    python = get_venv_python()

    # Upgrade pip to avoid resolution failures with old bundled pip
    subprocess.run(
        [python, "-m", "pip", "install", "-q", "--upgrade", "pip"],
        check=True,
    )

    # Install deps
    subprocess.run(
        [python, "-m", "pip", "install", "-q", "-r",
         os.path.join(BACKEND_DIR, "requirements.txt")],
        check=True,
    )

    # Start backend
    print(f"Starting backend on http://localhost:{backend_port} ...")
    creation_flags = subprocess.CREATE_NEW_PROCESS_GROUP if IS_WINDOWS else 0
    backend_proc = subprocess.Popen(
        [python, "-m", "uvicorn", "app.main:app",
         "--host", "0.0.0.0", "--port", str(backend_port)],
        cwd=BACKEND_DIR,
        creationflags=creation_flags,
    )
    with open(BACKEND_PID_FILE, "w") as f:
        f.write(str(backend_proc.pid))

    # Wait for backend to be reachable before starting frontend
    _wait_for_port(backend_port)

    # ── Frontend setup ──
    print("Setting up frontend...")
    npm_cmd = "npm.cmd" if IS_WINDOWS else "npm"
    node_cmd = "node" if not IS_WINDOWS else "node.exe"

    # Check Node.js version
    try:
        node_ver_out = subprocess.run(
            [node_cmd, "--version"], capture_output=True, text=True
        ).stdout.strip()  # e.g. "v18.17.0"
        node_ver = tuple(int(x) for x in node_ver_out.lstrip("v").split(".")[:2])
        if node_ver < (18, 13):
            sys.exit(
                f"ERROR: Node.js >= 18.13 is required (found {node_ver_out}).\n"
                f"Download a current version from https://nodejs.org/"
            )
    except FileNotFoundError:
        sys.exit("ERROR: Node.js not found. Install from https://nodejs.org/")

    if not os.path.isdir(os.path.join(FRONTEND_DIR, "node_modules")):
        print("Installing npm dependencies...")
        subprocess.run([npm_cmd, "install"], cwd=FRONTEND_DIR, check=True)

    # Start frontend
    print(f"Starting frontend on http://localhost:{frontend_port} ...")
    frontend_env = os.environ.copy()
    frontend_env["BACKEND_PORT"] = str(backend_port)
    frontend_proc = subprocess.Popen(
        [npm_cmd, "run", "dev", "--", "--host", "0.0.0.0",
         "--port", str(frontend_port)],
        cwd=FRONTEND_DIR,
        creationflags=creation_flags,
        env=frontend_env,
    )
    with open(FRONTEND_PID_FILE, "w") as f:
        f.write(str(frontend_proc.pid))

    # ── Done ──
    print()
    print("=" * 44)
    print(f"  Backend:  http://localhost:{backend_port}")
    print(f"  API docs: http://localhost:{backend_port}/docs")
    print(f"  Frontend: http://localhost:{frontend_port}")
    print("=" * 44)
    print()
    print("Press Ctrl+C to stop both servers.")

    # Wait for processes (keeps launcher alive for Local Hoster)
    try:
        backend_proc.wait()
        frontend_proc.wait()
    except KeyboardInterrupt:
        print("\nShutting down...")
        kill_pid(backend_proc.pid)
        kill_pid(frontend_proc.pid)
        for pf in (BACKEND_PID_FILE, FRONTEND_PID_FILE):
            if os.path.isfile(pf):
                os.remove(pf)
        print("Done.")
        sys.exit(0)


def main():
    parser = argparse.ArgumentParser(description="Mototelos launcher")
    parser.add_argument("-p", "--frontend-port", type=int, default=5173,
                        help="Frontend port number")
    parser.add_argument("-b", "--backend-port", type=int, default=8000,
                        help="Backend port number")
    parser.add_argument("--stop", action="store_true",
                        help="Stop running servers")
    args = parser.parse_args()

    if args.stop:
        stop(args.frontend_port, args.backend_port)
    else:
        start(args.frontend_port, args.backend_port)


if __name__ == "__main__":
    main()
