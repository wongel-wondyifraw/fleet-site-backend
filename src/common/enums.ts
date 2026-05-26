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

// Roles for application users (login accounts); used by RolesGuard and JWT payload.
export enum UserRole {
  ADMIN = 'ADMIN',
  SITE_MANAGER = 'SITE_MANAGER',
  TIME_KEEPER = 'TIME_KEEPER',
}
