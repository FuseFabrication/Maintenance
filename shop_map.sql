-- Shop floor map: run once in the Supabase SQL Editor (safe to run again).
-- Adds the map position columns and sets the machine positions (feet; same coordinates as shop-layout.svg).
-- Read off ExistingBuilding.idw (PDF export 11/11/2025), confirmed by Mike 11/20/2026.
-- Orientation: bottom of the drawing = west, top = east, left = north, right = south.
-- Coordinates: x = feet from the left end of the 460' dimension line, y = feet down from the top wall of the main bay.
-- Only sets a position where none is saved yet, so moves made in the app are kept.
alter table public.assets add column if not exists map_x real;
alter table public.assets add column if not exists map_y real;

update public.assets set map_x = 448.8, map_y = 26.0 where id = 'FUSE-LSR-001' and map_x is null;  -- Laser
update public.assets set map_x = 410.4, map_y = 25.1 where id = 'FUSE-PB-002' and map_x is null;  -- Left press brake = 250T
update public.assets set map_x = 429.8, map_y = 25.2 where id = 'FUSE-PB-001' and map_x is null;  -- Right press brake = 400T
update public.assets set map_x = 389.1, map_y = 60.7 where id = 'FUSE-SHR-001' and map_x is null;  -- Shear
update public.assets set map_x = 302.1, map_y = 28.6 where id = 'FUSE-ROL-001' and map_x is null;  -- 10' 3-roll (Webb plate roll)
update public.assets set map_x = 206.2, map_y = 27.6 where id = 'FUSE-ROL-002' and map_x is null;  -- 10' 4-roll (Americor)
update public.assets set map_x = 227.3, map_y = 28.5 where id = 'FUSE-ROL-003' and map_x is null;  -- 4' 3-roll (GMC slip roll)
update public.assets set map_x = 235.2, map_y = 27.0 where id = 'FUSE-IRN-002' and map_x is null;  -- Drawn ironworker = Edwards
update public.assets set map_x = 289.2, map_y = 27.0 where id = 'FUSE-IRN-001' and map_x is null;  -- GEKA, box added between upper saw and 10' 3-roll
update public.assets set map_x = 272.9, map_y = 27.6 where id = 'FUSE-SAW-001' and map_x is null;  -- Upper saw = 12D
update public.assets set map_x = 277.1, map_y = 44.6 where id = 'FUSE-SAW-002' and map_x is null;  -- Lower saw = S-20A
update public.assets set map_x = 352.0, map_y = 27.5 where id = 'FUSE-CNC-002' and map_x is null;  -- Left Yama Seiki = newer serial (24002)
update public.assets set map_x = 378.0, map_y = 27.0 where id = 'FUSE-CNC-001' and map_x is null;  -- Right Yama Seiki (22004)
update public.assets set map_x = 346.5, map_y = 4.1 where id = 'FUSE-LTH-003' and map_x is null;  -- Left lathe = Lion
update public.assets set map_x = 373.1, map_y = 4.6 where id = 'FUSE-LTH-001' and map_x is null;  -- Right lathe = LeBlond
update public.assets set map_x = 321.6, map_y = 15.2 where id = 'FUSE-LTH-004' and map_x is null;  -- Angled machine = Okuma LB3000
update public.assets set map_x = -92.0, map_y = -28.0 where id = 'FUSE-BLS-001' and map_x is null;  -- Sand blasting room
update public.assets set map_x = -62.4, map_y = -24.0 where id = 'FUSE-PNT-001' and map_x is null;  -- Paint booth
update public.assets set map_x = 465.5, map_y = 25.2 where id = 'FUSE-LSR-001-DST' and map_x is null;  -- Camfil dust collector, outside the laser bay south wall (right end of the building)
update public.assets set map_x = 317.8, map_y = 27.7 where id = 'FUSE-LTH-002' and map_x is null;  -- Machine right of the 10' 3-roll = US Industrial lathe
update public.assets set map_x = 313.61, map_y = 17.02 where id = 'FUSE-TMB-001' and map_x is null;  -- Tumbler, 2' x 4', along the angled wall above the US Industrial lathe
update public.assets set map_x = 339.31, map_y = 18.94 where id = 'FUSE-MIL-002' and map_x is null;  -- Grizzly mill, between the Okuma LB3000 and the left Yama Seiki
update public.assets set map_x = 339.31, map_y = 31.77 where id = 'FUSE-MIL-001' and map_x is null;  -- Bridgeport mill, against the machine-shop west wall (bottom of drawing) below the Grizzly
update public.assets set map_x = 438.1, map_y = 53.0 where id = 'FUSE-JIB-001' and map_x is null;  -- Jib crane (pivot), down-left of the laser
update public.assets set map_x = 398.03, map_y = 14.1 where id = 'FUSE-SHP-001' and map_x is null;  -- Shaper, machine-shop south wall (right side) just below the outside door
update public.assets set map_x = 320.95, map_y = 32.9 where id = 'FUSE-GRD-001' and map_x is null;  -- Surface grinder, inside the machine-shop north wall (left side) near the overhead door
update public.assets set map_x = 448.8, map_y = 76.5 where id = 'FUSE-LSR-001-GAS' and map_x is null;  -- Laser assist gas, 8' square outside the laser bay west wall, in line with the laser
update public.assets set map_x = 364.1, map_y = 21.9 where id = 'FUSE-MET-001' and map_x is null;  -- FARO arm, between the two Yama Seikis, just east of where they start
update public.assets set map_x = 365.9, map_y = 21.9 where id = 'FUSE-MET-002' and map_x is null;  -- FARO probe, with the FARO arm just east of the Yama Seikis
update public.assets set map_x = 90.76, map_y = 9.5 where id = 'FUSE-TNK-001' and map_x is null;  -- 500 gal air tank, southmost of the compressor group outside the north door by the welding areas
update public.assets set map_x = 86.5, map_y = 9.5 where id = 'FUSE-CMP-004' and map_x is null;  -- Quincy compressor (Polar dryer drawn just west of it), next to the 500 gal tank
update public.assets set map_x = 398.03, map_y = 2.47 where id = 'FUSE-CMP-003' and map_x is null;  -- Hodge HTM15 compressor, machine shop back right corner
-- PENDING: only one Kaeser exists. Set the right ID, then remove the other machine record.
-- update public.assets set map_x = 81.25, map_y = 9.5 where id = 'FUSE-CMP-00?' and map_x is null;  -- The one Kaeser compressor, north of the Quincy. Assign to FUSE-CMP-001 or FUSE-CMP-002 once confirmed.
update public.assets set map_x = 231.8, map_y = 73.48 where id = 'FUSE-MIX-001' and map_x is null;  -- Thermco gas mixer, 8' square outside the west wall just north of the man door, above the 460' dimension
update public.assets set map_x = 155.85, map_y = 84.93 where id = 'FUSE-TEL-002' and map_x is null;  -- JLG SkyTrak, parked outside the west wall between the two lower welding areas, rear 5' off the wall
update public.assets set map_x = 168.35, map_y = 84.93 where id = 'FUSE-TEL-001' and map_x is null;  -- Ingersoll Rand VR-1044C, parked beside the JLG (same outline)
update public.assets set map_x = 401.55, map_y = 61.4 where id = 'FUSE-FLT-001' and map_x is null;  -- 5,000 lb forklift #1, parked inside just south (right) of the shear
update public.assets set map_x = 236.45, map_y = 57.5 where id = 'FUSE-FLT-002' and map_x is null;  -- 5,000 lb forklift #2, parked inside just south (right) of the lower welding area, by the overhead door, clear of the man-door swing
update public.assets set map_x = 147.0, map_y = 34.0 where id = 'FUSE-FLT-003' and map_x is null;  -- 8,000 lb forklift, parked in the open floor between the upper and lower welding areas
update public.assets set map_x = -78.0, map_y = -20.1 where id = 'FUSE-SKS-001' and map_x is null;  -- John Deere 317D skid steer, parked west of the sand blasting and paint booth bays
update public.assets set map_x = 36.0, map_y = 70.06 where id = 'FUSE-LFT-001' and map_x is null;  -- Skyjack 3219 scissor lift, against the west wall just north of the project staging
update public.assets set map_x = 10.0, map_y = 44.0 where id = 'FUSE-OHC-001' and map_x is null;  -- 5-ton crane #1, north end of the building, north of the project staging
update public.assets set map_x = 30.0, map_y = 44.0 where id = 'FUSE-OHC-002' and map_x is null;  -- 5-ton crane #2, north end of the building, north of the project staging
update public.assets set map_x = 328.0, map_y = 52.0 where id = 'FUSE-OHC-003' and map_x is null;  -- 5-ton crane #3, main bay opposite the machine shop overhead door
update public.assets set map_x = 420.0, map_y = 45.0 where id = 'FUSE-OHC-004' and map_x is null;  -- 5-ton crane #4, laser bay between the press brakes, near the laser
update public.assets set map_x = 390.0, map_y = 22.0 where id = 'FUSE-OHC-005' and map_x is null;  -- 1/2-ton crane, machine shop open floor between the right Yama Seiki and the east wall
