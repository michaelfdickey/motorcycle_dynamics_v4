# Mototelos Motorcycle Dynamics — Technology Stack

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                    Frontend                          │
│             SvelteKit + TypeScript                   │
│  ┌─────────────┐ ┌─────────────┐ ┌──────────────┐  │
│  │  SVG Line   │ │  Three.js   │ │  Observable  │  │
│  │  Drawings   │ │  (3D, future)│ │  Plot(charts)│  │
│  └─────────────┘ └─────────────┘ └──────────────┘  │
│                 Tailwind CSS                         │
└──────────┬────────────────────┬──────────────────────┘
           │ REST (CRUD)        │ WebSocket (sim state)
           ▼                    ▼
┌─────────────────────────────────────────────────────┐
│                    Backend                           │
│              FastAPI (Python 3.12+)                  │
│  ┌──────────────────────────────────────────────┐   │
│  │          Simulation Engine                    │   │
│  │   NumPy · SciPy · Numba · Polars             │   │
│  │   (suspension, FEA, kinematics, CFD future)   │   │
│  └──────────────────────────────────────────────┘   │
│  ┌──────────────┐  ┌────────────────────────────┐   │
│  │  Persistence  │  │  Simulation Scheduling     │   │
│  │  SQLite/JSON  │  │  Fixed-timestep tick loop  │   │
│  └──────────────┘  └────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

---

## Backend — Python 3.12+

### API Framework

| Package | Version | Purpose |
|---|---|---|
| **FastAPI** | >=0.110 | REST + WebSocket API server |
| **Uvicorn** | >=0.29 | ASGI server for FastAPI |
| **Pydantic** | >=2.6 | Request/response validation, simulation config schemas |

- REST endpoints for CRUD: save/load bike configurations, component geometries, simulation results.
- WebSocket endpoints for real-time simulation state streaming to the frontend.
- Auto-generated OpenAPI docs at `/docs`.

### Core Math & Science

| Package | Version | Purpose |
|---|---|---|
| **NumPy** | >=1.26 | Array math, linear algebra, core numerical ops |
| **SciPy** | >=1.12 | ODE solvers (suspension dynamics), sparse linear algebra (FEA), optimization |
| **Numba** | >=0.59 | JIT compilation for hot-path simulation loops (FEA assembly, ODE inner loops) |
| **Polars** | >=0.20 | Fast DataFrames for simulation results, time-series data, parameter sweeps |

### Simulation Engine

| Component | Approach |
|---|---|
| **Suspension ODE** | Spring-damper systems solved via `scipy.integrate.solve_ivp` |
| **Beam/Node FEA** | Sparse stiffness matrix assembly + direct solve via `scipy.sparse.linalg` |
| **Kinematics** | Linkage geometry computed from pivot points and constraints |
| **State management** | Immutable snapshot per solve step; frontend subscribes via WebSocket |
| **Headless mode** | Engine runs without frontend for batch parameter sweeps |

### Persistence

| Package | Purpose |
|---|---|
| **SQLite** (via `aiosqlite`) | Save/load bike configs, simulation results, component libraries |
| **JSON** | Snapshot serialization for WebSocket transport and file export |

### Development & Testing

| Package | Purpose |
|---|---|
| **pytest** | Unit and integration testing |
| **pytest-asyncio** | Async test support for FastAPI endpoints |
| **ruff** | Linting and formatting |
| **mypy** | Static type checking |

---

## Frontend — TypeScript + SvelteKit

### Framework

| Package | Version | Purpose |
|---|---|---|
| **SvelteKit** | >=2.0 | App framework with routing, SSR/CSR, reactive state |
| **TypeScript** | >=5.4 | Type safety across the frontend |
| **Vite** | (bundled) | Build tooling, HMR |

### Visualization

| Package | Purpose | Use Cases |
|---|---|---|
| **SVG (Svelte components)** | Reactive line drawings | Frame geometry, suspension linkage schematics, spring/damper diagrams |
| **Three.js** | 3D rendering (future) | 3D frame visualization, CFD result rendering |
| **Observable Plot** | Statistical charts (future) | Force vs. displacement, stress distributions, parameter sweep results |

### Styling

| Package | Purpose |
|---|---|
| **Tailwind CSS** | Utility-first styling, responsive layout, dark-mode support |

### State & Communication

| Concern | Approach |
|---|---|
| **Client state** | Svelte stores (reactive, minimal boilerplate) |
| **REST calls** | Native `fetch` with typed wrappers |
| **WebSocket** | Native `WebSocket` API for real-time sim state |

---

## Communication Protocol

### REST API

```
POST   /api/simulation          Create new simulation
GET    /api/simulation/{id}     Load simulation state
PUT    /api/simulation/{id}     Update simulation config
DELETE /api/simulation/{id}     Delete simulation

GET    /api/components           List component library
POST   /api/components           Add component
```

### WebSocket (real-time sim state)

```
WS /ws/simulation/{id}

Server -> Client:
  { type: "result",  data: <SimulationSnapshot> }
  { type: "status",  data: <SolverStatus> }

Client -> Server:
  { type: "command", data: { action: "run", params: {...} } }
  { type: "command", data: { action: "pause" } }
```

---

## Project Structure

```
motorcycle_dynamics_v4/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI app entry
│   │   ├── api/
│   │   │   └── routes.py        # REST + WS endpoints
│   │   ├── simulation/
│   │   │   ├── suspension.py    # Spring-damper ODE solver
│   │   │   ├── fea.py           # Beam/node finite element analysis
│   │   │   ├── kinematics.py    # Linkage geometry
│   │   │   └── engine.py        # Core simulation runner
│   │   └── models/
│   │       ├── schemas.py       # Pydantic models
│   │       └── config.py        # Simulation config
│   ├── tests/
│   ├── pyproject.toml
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── routes/              # SvelteKit pages
│   │   ├── lib/
│   │   │   ├── components/      # Svelte components
│   │   │   ├── stores/          # Svelte stores
│   │   │   └── types/           # TypeScript types
│   │   └── app.html
│   ├── static/
│   ├── svelte.config.js
│   ├── vite.config.ts
│   ├── tsconfig.json
│   └── package.json
├── tech_stack.md
├── launcher.sh
└── README.md
```

---

## Key Architectural Decisions

1. **Simulation is server-authoritative.** The backend owns all physics. The frontend is a view layer that never computes dynamics.
2. **Fixed-timestep solvers.** ODE and FEA solvers use deterministic steps for reproducibility.
3. **Snapshot-based state sync.** Each solve produces an immutable result snapshot streamed via WebSocket.
4. **Numba for hot paths only.** Default is readable NumPy/SciPy code. Numba `@njit` applied selectively to profiled bottlenecks.
5. **SVG-first visualization.** Line drawings of frame geometry and suspension use reactive SVG. Three.js reserved for future 3D work.
6. **Typed end-to-end.** Pydantic schemas on the backend, TypeScript on the frontend.

---

## Minimum Versions & Runtime

| Requirement | Version |
|---|---|
| Python | >=3.12 |
| Node.js | >=20 LTS |
| npm | >=10 |
| OS | macOS 12+, Windows 10+, Linux |
| Browser | Chrome/Edge 120+, Firefox 121+, Safari 17+ |

---

## Roadmap

| Phase | Scope |
|---|---|
| **v1** | Suspension spring/damper ODE sim, SVG line drawings of linkage geometry, basic parameter input |
| **v2** | Beam/node frame FEA with Numba-accelerated solvers, stress/displacement overlays |
| **v3** | CFD via OpenFOAM/PyFR wrapper, Three.js for 3D mesh result visualization |
