# Frame tab — this pass only

Work in this repo (`motorcycle_dynamics_v4`). Do not start Transmission Designer, a second app, or any FEA solver.

## Goal

Make **Frame → 0. Geometry Layout** usable for tracing the Phase 1 mule from a shop photo.

## Must do

### 1. Reference image background

- Load a local image (shop screencap / photo) onto the Geometry Layout canvas as a **background**.
- Controls: show/hide, opacity, scale, pan. It is a tracing aid, not a node or member.
- Do not bake the bitmap into the vehicle graph.
- Persist opacity/transform in `vehicle.frame` JSON if cheap. If you store a file path, treat it as local-only (it will not survive GitHub).

### 2. Letterbox the editor

- Give the Frame UI a **letterbox**: wide canvas, short height, canvas is the main thing.
- Collapse, hide, or move the long encyclopedia under tabs **1–10** (2D Truss through Solid/Nonlinear). Those tabs stay notes. Do not implement them.
- Stop the description block under tab 0 from eating vertical space.

## Hold (already true — do not regress)

- Members already have `diameter` and `thickness` (tube). Keep assignment on select.
- Named node types already exist: `steering_head`, `rear_axle`, `engine`, `seat`, anchors. Keep them.
- Save/load already merges into vehicle JSON under `frame` via `vehicleStore`. Keep that.
- **Geometry** and **Frame FEA** routes stay stubs.
- One vehicle in the file. Frame wheelbase / rake / tire radii should follow the loaded vehicle (`phase1` / `my_bike`), not Frame's own defaults of **1500 mm / 27° / 312 mm**. Those defaults are not the mule.
- Mule envelope (estimates, not proven specs): ~**2794 mm (110 in)** wheelbase, ~1500 lb, leading-link, CX hardtail. **Confirm units/scale** before treating 1500 mm as the mule — it is not.
- Do not add MotoTelos to new public copy.

## Done when

1. User can load a shop screencap, fade it, and trace nodes/members over it.
2. The canvas is letterboxed; FEA-ladder prose is out of the way.
3. Existing phase1 front-end overlay still works.
4. Drop a new shot in `screencaps/` showing the letterbox + reference image.

Keep the change in this repo only.
