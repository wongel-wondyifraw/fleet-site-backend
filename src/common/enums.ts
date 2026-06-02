export enum VehicleType {
  TRUCK = 'TRUCK',
  EXCAVATOR = 'EXCAVATOR',
  LOADER = 'LOADER',
  BULLDOZER = 'BULLDOZER',
  CRANE = 'CRANE',
  PICKUP = 'PICKUP',
  TANKER = 'TANKER',
  OTHER = 'OTHER',
}

export enum VehicleStatus {
  ACTIVE = 'ACTIVE',
  IDLE = 'IDLE',
  IN_MAINTENANCE = 'IN_MAINTENANCE',
  OUT_OF_SERVICE = 'OUT_OF_SERVICE',
  RETIRED = 'RETIRED',
}

export enum FuelType {
  DIESEL = 'DIESEL',
  PETROL = 'PETROL',
  ELECTRIC = 'ELECTRIC',
  HYBRID = 'HYBRID',
}

export enum AttendanceStatus {
  CHECKED_IN = 'CHECKED_IN',
  CHECKED_OUT = 'CHECKED_OUT',
  ABSENT = 'ABSENT',
  ON_LEAVE = 'ON_LEAVE',
}

// Roll-up state for a driver's expected workday on a given site/date. EXPECTED
// is the lazy default before any punches; PRESENT/ON_BREAK/DONE are derived
// from the punch stream; ABSENT only applies to past dates with no DAY_IN;
// ON_LEAVE is a manual override that survives recalculation.
export enum AttendanceDayStatus {
  EXPECTED = 'EXPECTED',
  PRESENT = 'PRESENT',
  ON_BREAK = 'ON_BREAK',
  DONE = 'DONE',
  ABSENT = 'ABSENT',
  ON_LEAVE = 'ON_LEAVE',
}

// Discrete clock events recorded against an AttendanceDay. DAY_IN/DAY_OUT
// bracket the shift; LUNCH_* and MAINT_* are paired in/out events that open
// and close breaks within the shift.
export enum AttendancePunchType {
  DAY_IN = 'DAY_IN',
  DAY_OUT = 'DAY_OUT',
  LUNCH_OUT = 'LUNCH_OUT',
  LUNCH_IN = 'LUNCH_IN',
  MAINT_OUT = 'MAINT_OUT',
  MAINT_IN = 'MAINT_IN',
}

// Punch types that require an odometer reading (km) when recorded manually.
// Mirrors the frontend ODOMETER_REQUIRED_PUNCH_TYPES set in attendanceHelpers.
export const ODOMETER_REQUIRED_PUNCH_TYPES = new Set<AttendancePunchType>([
  AttendancePunchType.DAY_IN,
  AttendancePunchType.DAY_OUT,
  AttendancePunchType.LUNCH_OUT,
  AttendancePunchType.LUNCH_IN,
]);

export enum SiteShift {
  DAY = 'DAY',
  NIGHT = 'NIGHT',
  SPLIT = 'SPLIT',
}

export enum DriverStatus {
  ACTIVE = 'ACTIVE',
  ON_LEAVE = 'ON_LEAVE',
  SUSPENDED = 'SUSPENDED',
  TERMINATED = 'TERMINATED',
}

// Ethiopian driving license classes.
//   PUBLIC_* (ህዝብ)    -> passenger / public-transport classes.
//   DRY_CARGO_* (ደረቅ) -> dry-cargo / freight classes.
// The numeric suffix (1-3) is the local rating that the license covers.
export enum LicenseClass {
  PUBLIC_1 = 'PUBLIC_1',
  PUBLIC_2 = 'PUBLIC_2',
  PUBLIC_3 = 'PUBLIC_3',
  DRY_CARGO_1 = 'DRY_CARGO_1',
  DRY_CARGO_2 = 'DRY_CARGO_2',
  DRY_CARGO_3 = 'DRY_CARGO_3',
}

export enum SiteStatus {
  PLANNING = 'PLANNING',
  ACTIVE = 'ACTIVE',
  ON_HOLD = 'ON_HOLD',
  COMPLETED = 'COMPLETED',
  CLOSED = 'CLOSED',
}

export enum SiteType {
  CONSTRUCTION = 'CONSTRUCTION',
  MINING = 'MINING',
  INFRASTRUCTURE = 'INFRASTRUCTURE',
  DEMOLITION = 'DEMOLITION',
  QUARRY = 'QUARRY',
  DEPOT = 'DEPOT',
  OTHER = 'OTHER',
}

// Lifecycle states for vehicle trips. PLANNED is the default on create;
// IN_PROGRESS / COMPLETED / CANCELLED are set as the trip progresses.
export enum TripStatus {
  PLANNED = 'PLANNED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}
