from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import math
import json
from pathlib import Path

app = FastAPI(
    title="Mototelos Motorcycle Dynamics",
    version="0.1.0",
    description="Physics simulation for motorcycle components",
)

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"^http://(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
async def health():
    return {"status": "ok", "app": "Mototelos Motorcycle Dynamics"}


# ── Braking API ───────────────────────────────────────────────────────────────

class BrakeParams(BaseModel):
    disc_diameter_mm: float = 320
    number_of_pots: int = 4
    piston_diameter_mm: float = 30
    pad_coefficient_of_friction: float = 0.45
    master_cylinder_dia_mm: float = 16
    lever_ratio: float = 4.0


class VehicleParams(BaseModel):
    wheelbase_mm: float = 1400
    cog_height_mm: float = 550
    cog_position_pct: float = 48
    total_mass_kg: float = 210
    front_tire_radius_mm: float = 310
    rear_tire_radius_mm: float = 315
    front_tire_grip: float = 1.2
    rear_tire_grip: float = 1.1


class BrakingRequest(BaseModel):
    front_brake: BrakeParams = BrakeParams()
    rear_brake: BrakeParams = BrakeParams(disc_diameter_mm=220, number_of_pots=2, piston_diameter_mm=34, pad_coefficient_of_friction=0.42, master_cylinder_dia_mm=14, lever_ratio=3.5)
    vehicle: VehicleParams = VehicleParams()
    front_lever_force_n: float = 150
    rear_pedal_force_n: float = 80
    linked: bool = False
    link_ratio: float = 0.7
    initial_speed_kph: float = 100


G = 9.81


def _clamping_force(brake: BrakeParams, input_force: float) -> float:
    piston_area = math.pi * (brake.piston_diameter_mm / 2) ** 2
    master_area = math.pi * (brake.master_cylinder_dia_mm / 2) ** 2
    hydraulic_ratio = (piston_area * brake.number_of_pots) / master_area
    return input_force * brake.lever_ratio * hydraulic_ratio


def _brake_torque(brake: BrakeParams, clamp_force: float) -> float:
    effective_radius = (brake.disc_diameter_mm / 2 * 0.8) / 1000
    return clamp_force * brake.pad_coefficient_of_friction * 2 * effective_radius


@app.post("/api/braking/compute")
async def compute_braking(req: BrakingRequest):
    front_input = req.front_lever_force_n
    rear_input = req.rear_pedal_force_n

    if req.linked:
        total = front_input + rear_input
        front_input = total * req.link_ratio
        rear_input = total * (1 - req.link_ratio)

    front_clamp = _clamping_force(req.front_brake, front_input)
    rear_clamp = _clamping_force(req.rear_brake, rear_input)

    front_torque = _brake_torque(req.front_brake, front_clamp)
    rear_torque = _brake_torque(req.rear_brake, rear_clamp)

    front_force = front_torque / (req.vehicle.front_tire_radius_mm / 1000)
    rear_force = rear_torque / (req.vehicle.rear_tire_radius_mm / 1000)

    total_brake_force = front_force + rear_force
    decel_ms2 = total_brake_force / req.vehicle.total_mass_kg
    decel_g = decel_ms2 / G

    weight_transfer = (req.vehicle.total_mass_kg * decel_ms2 * req.vehicle.cog_height_mm) / req.vehicle.wheelbase_mm
    total_weight = req.vehicle.total_mass_kg * G
    front_static = total_weight * (1 - req.vehicle.cog_position_pct / 100)
    rear_static = total_weight * (req.vehicle.cog_position_pct / 100)

    front_axle_load = front_static + weight_transfer
    rear_axle_load = rear_static - weight_transfer

    v0 = req.initial_speed_kph / 3.6
    effective_decel = min(decel_ms2, G * max(req.vehicle.front_tire_grip, req.vehicle.rear_tire_grip))
    stopping_time = v0 / effective_decel if effective_decel > 0 else float("inf")
    stopping_distance = (v0 ** 2) / (2 * effective_decel) if effective_decel > 0 else float("inf")

    return {
        "deceleration_g": round(decel_g, 3),
        "deceleration_ms2": round(decel_ms2, 2),
        "weight_transfer_n": round(weight_transfer, 1),
        "front_axle_load_n": round(front_axle_load, 1),
        "rear_axle_load_n": round(rear_axle_load, 1),
        "front_brake_torque_nm": round(front_torque, 1),
        "rear_brake_torque_nm": round(rear_torque, 1),
        "front_brake_force_n": round(front_force, 1),
        "rear_brake_force_n": round(rear_force, 1),
        "front_lockup": front_force > front_axle_load * req.vehicle.front_tire_grip,
        "rear_lockup": rear_force > max(0, rear_axle_load) * req.vehicle.rear_tire_grip,
        "stopping_distance_m": round(stopping_distance, 2),
        "stopping_time_s": round(stopping_time, 3),
    }


# ── Vehicle Design Save/Load ─────────────────────────────────────────────────

VEHICLES_DIR = Path(__file__).resolve().parent.parent.parent / "vehicles"
VEHICLES_DIR.mkdir(exist_ok=True)


def _safe_filename(name: str) -> str:
    """Sanitize name to prevent path traversal."""
    clean = "".join(c for c in name if c.isalnum() or c in ("-", "_", " ")).strip()
    if not clean:
        raise HTTPException(status_code=400, detail="Invalid vehicle name")
    return clean


@app.get("/api/vehicles")
async def list_vehicles():
    """List all saved vehicle designs."""
    files = sorted(VEHICLES_DIR.glob("*.json"))
    return [{"name": f.stem} for f in files]


@app.get("/api/vehicles/{name}")
async def get_vehicle(name: str):
    """Load a vehicle design by name."""
    clean = _safe_filename(name)
    path = VEHICLES_DIR / f"{clean}.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Vehicle not found")
    return json.loads(path.read_text(encoding="utf-8"))


@app.post("/api/vehicles/{name}")
async def save_vehicle(name: str, design: dict):
    """Save a vehicle design."""
    clean = _safe_filename(name)
    path = VEHICLES_DIR / f"{clean}.json"
    path.write_text(json.dumps(design, indent=2), encoding="utf-8")
    return {"status": "saved", "name": clean}


@app.delete("/api/vehicles/{name}")
async def delete_vehicle(name: str):
    """Delete a vehicle design."""
    clean = _safe_filename(name)
    path = VEHICLES_DIR / f"{clean}.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Vehicle not found")
    path.unlink()
    return {"status": "deleted", "name": clean}
