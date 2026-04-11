# Mototelos Motorcycle Dynamics

Physics simulation app for motorcycle components. Enter simple geometries and run engineering analysis on suspension, frames, and aerodynamic parts.

## Features (Roadmap)

- **Suspension** — Spring/damper ODE simulation with configurable rate, length, and damping on line drawings of linkage geometry
- **Frame FEA** — Beam and node finite element analysis of frame components with stress/displacement output
- **CFD** (future) — Computational fluid dynamics analysis of fairings and aerodynamic parts

## Tech Stack

- **Backend:** Python 3.12+ / FastAPI / NumPy / SciPy / Polars
- **Frontend:** SvelteKit 2 / Svelte 5 / TypeScript / Tailwind CSS v4 / Vite 7
- **Communication:** REST API + WebSocket for real-time simulation state
- **Persistence:** SQLite

See [tech_stack.md](tech_stack.md) for full architecture details.

## Quick Start

```bash
./launcher.sh
```

This will:
1. Create a Python virtual environment in `backend/.venv` (if needed)
2. Install Python dependencies from `backend/requirements.txt`
3. Install npm dependencies in `frontend/` (if needed)
4. Start the backend on http://localhost:8000
5. Start the frontend on http://localhost:5173

Re-running `./launcher.sh` kills any existing instances and restarts cleanly.

API docs are available at http://localhost:8000/docs when the backend is running.

## Project Structure

```
backend/          Python FastAPI server + simulation engine
frontend/         SvelteKit app (UI, visualization)
tech_stack.md     Architecture documentation
launcher.sh       Launch/restart script
```