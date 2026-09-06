# Brake Lockup Simulation --- Implementation Guidance

## Purpose

Implement brake lockup as a **time-dependent wheel dynamics event**, not
merely as an instantaneous Boolean comparison.

A wheel may lock immediately after brake application if brake torque
greatly exceeds available tire-road traction, but it can also lock later
during the braking event. This can happen because brake torque, vehicle
speed, wheel speed, tire slip, and especially front/rear normal loads
change as the vehicle decelerates.

The simulation should therefore advance through small timesteps,
calculate the state of each wheel independently, and determine when each
tire transitions from normal rolling through increasing longitudinal
slip to full lock.

This is particularly important for unconventional motorcycle geometries
such as long, low, recumbent motorcycles, where center-of-gravity
height, wheelbase, and static weight distribution can produce
substantially different braking load transfer from a conventional
motorcycle.

------------------------------------------------------------------------

# 1. Core Physical Principle

Brake lockup should be based on the relationship between:

1.  Brake torque applied to the wheel.
2.  Tire-road force available at the contact patch.
3.  Wheel rotational inertia and angular velocity.
4.  Vehicle longitudinal velocity.
5.  Dynamic normal load on the tire.

For a simple tire model, maximum available longitudinal tire force can
initially be approximated as:

\[ F\_{tire,max} = `\mu`{=tex}\_{tire} N \]

where:

-   `mu_tire` = tire-road coefficient of friction
-   `N` = instantaneous normal force on that tire

The corresponding maximum torque that the road can approximately react
through the tire is:

\[ T\_{road,max} = F\_{tire,max} r\_{tire} \]

where:

-   `r_tire` = effective rolling radius

If braking demands more longitudinal tire force than the contact patch
can provide while maintaining low slip, the wheel begins to decelerate
rotationally faster than the vehicle is decelerating translationally.
Slip therefore increases.

Full wheel lock is the limiting condition where wheel angular velocity
reaches approximately zero while vehicle velocity remains greater than
zero.

------------------------------------------------------------------------

# 2. Do Not Treat Lockup as Only a Static Threshold

A first-order implementation could use:

``` text
if requested_tire_force > mu_tire * normal_load:
    locked = True
```

This is useful as a diagnostic threshold, but the primary simulation
should preferably calculate wheel angular velocity dynamically.

The wheel rotational equation can be represented approximately as:

\[ I_w `\dot{\omega}`{=tex} = T\_{road} - T\_{brake} \]

where:

-   `I_w` = wheel/tire rotational inertia
-   `omega` = wheel angular velocity
-   `T_road` = torque applied to the wheel through tire-road interaction
-   `T_brake` = braking torque

Integrating angular acceleration over time allows wheel speed to diverge
naturally from vehicle speed as braking exceeds the tire's ability to
maintain rolling.

------------------------------------------------------------------------

# 3. Tire Slip Ratio

Calculate longitudinal braking slip for each wheel.

A useful definition is:

\[ s = `\frac{V - \omega r}{V}`{=tex} \]

where:

-   `V` = vehicle longitudinal velocity
-   `omega` = wheel angular velocity
-   `r` = effective tire radius

Interpretation:

  -----------------------------------------------------------------------
                                      Slip Approximate state
  ---------------------------------------- ------------------------------
                                         0 Pure rolling

                      Small positive value Normal braking slip

                           Increasing slip Tire approaching traction
                                           limit

                              \~0.10--0.20 Often near peak longitudinal
                                           force for many tire/surface
                                           combinations

                                       1.0 Wheel stopped while vehicle is
                                           moving --- full lock
  -----------------------------------------------------------------------

Do **not** hard-code 10--20% slip as a universal peak-friction value.
Actual peak slip depends on tire construction, road surface, normal
load, temperature, pressure, and other factors.

The initial simulator can use a simple constant coefficient of friction.
A later tire model should replace this with a longitudinal
force-versus-slip curve.

------------------------------------------------------------------------

# 4. Dynamic Weight Transfer

Normal load on each wheel must change during braking.

For a simplified rigid vehicle on level ground, longitudinal braking
load transfer can be approximated as:

\[ `\Delta `{=tex}N = `\frac{m a h}{L}`{=tex} \]

where:

-   `m` = total vehicle mass
-   `a` = magnitude of longitudinal deceleration
-   `h` = center-of-gravity height above the ground
-   `L` = wheelbase

During braking:

-   Front normal load increases.
-   Rear normal load decreases.

Therefore:

\[ N_f = N\_{f,static} + `\Delta `{=tex}N \]

\[ N_r = N\_{r,static} - `\Delta `{=tex}N \]

Available tire force consequently changes:

\[ F\_{front,max} = `\mu`{=tex}\_{front} N_f \]

\[ F\_{rear,max} = `\mu`{=tex}\_{rear} N_r \]

This creates an important dynamic effect:

**A wheel that does not lock when braking begins may lock later.**

For example, if the rear tire initially has enough normal force to
support the commanded brake torque, it may remain below the traction
limit. As deceleration develops and load transfers forward, rear normal
force decreases. If rear brake torque remains approximately constant,
the available rear tire force can fall below the required braking force
and rear slip will begin increasing.

The sequence can therefore be:

``` text
Rolling
    ↓
Increasing brake force
    ↓
Increasing deceleration
    ↓
Forward load transfer
    ↓
Reduced rear normal force
    ↓
Reduced rear tire force capability
    ↓
Increasing rear slip
    ↓
Peak tire force
    ↓
Post-peak sliding
    ↓
Full rear wheel lock
```

This behavior is particularly relevant when comparing conventional
motorcycles with long-wheelbase, low-CG recumbent motorcycles.

------------------------------------------------------------------------

# 5. Brake Pad Friction and Tire Friction Must Be Separate

Do not use one generic friction coefficient for the entire braking
system.

There are at least two fundamentally different friction interfaces.

## Brake pad / rotor friction

Brake pad coefficient of friction contributes to brake torque.

A simplified relationship is:

\[ T_b `\approx `{=tex}`\mu`{=tex}*{pad} F*{clamp} r\_{effective} \]

The complete calculation may also account for:

-   number of friction surfaces
-   piston area
-   hydraulic line pressure
-   effective rotor radius
-   caliper geometry
-   mechanical efficiency

The brake system causal chain can eventually be modeled as:

``` text
Lever or pedal input
    ↓
Master-cylinder pressure
    ↓
Hydraulic line pressure
    ↓
Caliper piston force
    ↓
Pad clamp force
    ↓
Pad/rotor friction
    ↓
Brake torque
```

## Tire / road friction

The tire-road coefficient controls how much longitudinal force can be
transmitted to the road.

``` text
Brake torque
    ↓
Wheel angular deceleration
    ↓
Tire slip
    ↓
Tire-road longitudinal force
    ↓
Vehicle deceleration
```

Keep these two friction coefficients and physical systems separate in
the software architecture.

------------------------------------------------------------------------

# 6. Recommended Time-Step Simulation

When the user presses **Apply Brakes**, do not calculate only a final
stopping distance.

Advance the simulation in small internal timesteps.

A starting timestep on the order of approximately 1--5 ms may be
appropriate for the wheel/braking solver, while the visual animation can
render independently at approximately 60 frames per second.

At every physics timestep, perform approximately the following sequence:

1.  Read current vehicle longitudinal velocity.
2.  Read current front and rear wheel angular velocities.
3.  Calculate current vehicle acceleration/deceleration.
4.  Calculate dynamic front and rear normal loads.
5.  Calculate available longitudinal tire force for each wheel.
6.  Calculate commanded front and rear brake torque.
7.  Calculate tire-road longitudinal forces.
8.  Calculate tire torque acting on each wheel.
9.  Calculate wheel angular acceleration.
10. Integrate wheel angular velocity.
11. Calculate front and rear slip ratios.
12. Determine the current tire state.
13. Calculate total vehicle longitudinal force.
14. Integrate vehicle acceleration to obtain new velocity.
15. Integrate velocity to obtain distance traveled.
16. Record simulation history.
17. Continue until vehicle speed reaches zero or the simulation is
    terminated.

Conceptually:

``` text
while vehicle_speed > 0:

    calculate_dynamic_axle_loads()

    calculate_brake_torque_front()
    calculate_brake_torque_rear()

    calculate_front_tire_force()
    calculate_rear_tire_force()

    calculate_front_wheel_angular_acceleration()
    calculate_rear_wheel_angular_acceleration()

    integrate_wheel_speeds()

    calculate_front_slip()
    calculate_rear_slip()

    calculate_vehicle_deceleration()

    integrate_vehicle_speed()
    integrate_vehicle_position()

    detect_and_record_lockup_events()

    save_timestep_results()
```

The exact ordering should ultimately be implemented carefully to avoid
numerical inconsistencies between load transfer, tire force, and vehicle
acceleration. An iterative solution within each timestep may later be
desirable because tire forces determine deceleration while deceleration
determines load transfer.

------------------------------------------------------------------------

# 7. Wheel State Model

Rather than storing only:

``` text
locked = true/false
```

maintain a wheel-state model.

Possible states:

``` text
FREE_ROLLING
BRAKING
APPROACHING_LIMIT
PEAK_GRIP
SLIDING
LOCKED
```

The exact thresholds can initially be approximate and later become
dependent on the tire model.

Store continuous values regardless of the displayed state:

``` text
wheel_angular_velocity
wheel_surface_velocity
vehicle_velocity
slip_ratio
normal_load
tire_longitudinal_force
available_tire_force
brake_torque
road_torque
angular_acceleration
```

The state labels are primarily useful for UI and event reporting; the
physics should rely on continuous quantities.

------------------------------------------------------------------------

# 8. Lockup Event Detection

A lockup event should be recorded when a wheel reaches effectively zero
angular velocity while the vehicle remains in motion.

Use a small numerical tolerance rather than requiring exactly zero.

For example, conceptually:

``` text
if wheel_omega <= omega_lock_threshold
and vehicle_speed > vehicle_stop_threshold:
    wheel_state = LOCKED
```

Record:

``` text
lockup_time
vehicle_speed_at_lockup
distance_at_lockup
normal_load_at_lockup
brake_torque_at_lockup
tire_force_at_lockup
slip_at_lockup
```

Front and rear lockup events must be tracked independently.

------------------------------------------------------------------------

# 9. Animation Requirements

The animation should visibly represent wheel rotational speed relative
to vehicle translational speed.

During normal rolling:

\[ `\omega `{=tex}r `\approx `{=tex}V \]

As braking slip develops:

\[ `\omega `{=tex}r \< V \]

At complete lock:

\[ `\omega `{=tex}= 0 \]

while:

\[ V \> 0 \]

Therefore, if a wheel locks at 1.37 seconds into a braking event, the
animation should visibly stop that wheel's rotation while the motorcycle
continues moving forward and decelerating.

Do not simply change the wheel color while continuing to rotate it at
vehicle speed.

Useful visual states could include:

-   Normal: standard wheel appearance
-   Approaching limit: warning indicator
-   Significant slip: highlighted tire/contact patch
-   Locked: wheel visibly stops rotating and lock indicator appears

------------------------------------------------------------------------

# 10. Real-Time Wheel Information

Display information independently for the front and rear wheel.

Example:

``` text
FRONT BRAKE / TIRE

Normal Load:       824 lb / 3.66 kN
Available Force:   741 lbf / 3.30 kN
Longitudinal Force:690 lbf / 3.07 kN
Vehicle Speed:     49.0 mph / 78.9 km/h
Wheel Speed:       46.2 mph / 74.4 km/h
Slip Ratio:        5.7%
Brake Torque:      ...
State:             BRAKING
```

For a locked wheel:

``` text
REAR WHEEL — LOCKED

Lock Time:         1.37 s
Vehicle Speed:     41.8 mph / 67.3 km/h
Distance:          37.4 ft / 11.4 m
Slip:              ~100%
```

The values above are illustrative UI examples, not validation data.

------------------------------------------------------------------------

# 11. Recommended Graphs

Record sufficient timestep data to plot at least three histories.

## Vehicle and wheel speed versus time

Plot:

-   Vehicle speed
-   Front wheel circumferential speed: `omega_front * r_front`
-   Rear wheel circumferential speed: `omega_rear * r_rear`

This graph makes incipient slip and full lock visually obvious.

## Slip ratio versus time

Plot:

-   Front slip
-   Rear slip

Mark lockup events on the graph.

## Axle normal load versus time

Plot:

-   Front normal force
-   Rear normal force

This directly demonstrates the relationship between braking
deceleration, load transfer, and rear-wheel lock tendency.

Additional useful plots later include:

-   Brake torque versus time
-   Tire longitudinal force versus time
-   Deceleration versus time
-   Stopping distance versus time
-   Tire friction utilization versus time

------------------------------------------------------------------------

# 12. Recommended Data Architecture

Keep brake, wheel, tire, and vehicle models separate.

Example conceptual structure:

``` text
VehicleModel
├── mass
├── wheelbase
├── cg_position
├── cg_height
├── velocity
└── position

FrontWheel
├── radius
├── inertia
├── angular_velocity
├── slip
└── state

RearWheel
├── radius
├── inertia
├── angular_velocity
├── slip
└── state

FrontBrake
├── rotor
├── caliper
├── pad_mu
├── hydraulic_parameters
└── brake_torque

RearBrake
├── rotor
├── caliper
├── pad_mu
├── hydraulic_parameters
└── brake_torque

FrontTire
├── tire_road_mu
├── normal_load
├── longitudinal_force
└── future_slip_curve

RearTire
├── tire_road_mu
├── normal_load
├── longitudinal_force
└── future_slip_curve
```

Suggested Python module boundaries:

``` text
simulation/
    braking/
        brake_model.py
        hydraulic_model.py
        brake_torque.py

    tires/
        tire_simple.py
        tire_slip.py
        tire_force.py

    wheels/
        wheel_dynamics.py
        wheel_state.py

    vehicle/
        longitudinal_dynamics.py
        weight_transfer.py
        mass_properties.py

    solver/
        braking_timestep.py
        integration.py
        event_detection.py

    results/
        braking_results.py
        event_log.py
        time_history.py

    visualization/
        brake_animation.py
        wheel_animation.py
        braking_plots.py
```

------------------------------------------------------------------------

# 13. Development Progression

## Version 1 --- Simple physical model

Implement:

-   Constant tire-road coefficient of friction
-   Dynamic front/rear load transfer
-   Independent front/rear brake torque
-   Wheel rotational inertia
-   Wheel angular velocity
-   Slip ratio
-   Dynamic lockup event detection
-   Time histories
-   Animated wheel lock

This is sufficient to create a physically meaningful first brake
simulation.

## Version 2 --- Slip-dependent tire model

Replace the hard constant-friction limit with a tire force-versus-slip
relationship.

Conceptually:

``` text
Longitudinal tire force
        ↑
        |        /\
        |       /  \
        |      /    \____
        |_____/
        +----------------→ slip
             peak
```

This allows the simulator to model:

-   Linear/low-slip braking region
-   Increasing tire force
-   Peak longitudinal grip
-   Post-peak force reduction
-   Locked-wheel sliding friction

This is substantially better than treating the tire as having a single
hard traction threshold.

## Version 3 --- More complete brake system

Add:

-   Master cylinder
-   Hydraulic pressure
-   Caliper piston areas
-   Pad coefficient
-   Effective rotor radius
-   Front/rear brake bias
-   Lever/pedal force
-   Brake application ramp rate
-   Thermal effects later

## Version 4 --- More complete tire/vehicle model

Eventually add:

-   Load-sensitive tire friction
-   Road surface selection
-   Tire temperature
-   Combined longitudinal/lateral force
-   Tire relaxation length
-   Suspension movement
-   Pitch dynamics
-   Aerodynamic drag/downforce
-   ABS control model

------------------------------------------------------------------------

# 14. Important Numerical Consideration

Brake lockup, tire force, vehicle deceleration, and load transfer form a
coupled problem:

``` text
Tire force
    ↓
Vehicle deceleration
    ↓
Load transfer
    ↓
Normal tire load
    ↓
Available tire force
    ↓
Vehicle deceleration
```

A simple implementation can solve this sequentially using sufficiently
small timesteps.

A more accurate implementation should iterate the
tire-force/load-transfer solution within each timestep until the
calculated deceleration and axle loads converge.

This avoids introducing artificial one-timestep delays into the
load-transfer calculation.

------------------------------------------------------------------------

# 15. Primary Design Principle

The simulator should **calculate lockup as an emergent result of the
dynamics rather than scheduling or directly commanding a lockup event**.

The user commands brake application.

The simulation calculates:

``` text
Brake input
    ↓
Brake torque
    ↓
Wheel angular acceleration
    ↓
Wheel speed
    ↓
Tire slip
    ↓
Tire force
    ↓
Vehicle deceleration
    ↓
Dynamic axle loading
    ↓
Available tire force
```

If the resulting dynamics drive a wheel to effectively zero angular
velocity while the motorcycle is still moving, the simulator records and
animates the lockup event at that actual simulation time.

This architecture also allows a wheel to:

-   never lock,
-   lock immediately,
-   lock after a delay,
-   approach lock without reaching it,
-   or, in a future ABS model, repeatedly approach and recover from
    excessive slip.

That is the appropriate foundation for progressively more sophisticated
motorcycle braking simulation.
