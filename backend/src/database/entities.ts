import {
  Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn, PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';
import {
  AlarmSeverity, AlarmStatus, CommandStatus, EventCategory, NotificationType, RequestSource, RequestStatus, RequestType,
  Role, SpaceStatus, UserStatus,
} from '../common/enums';

/* ───────────────────────────── roles ───────────────────────────── */
@Entity('roles')
export class RoleEntity {
  @PrimaryColumn({ type: 'varchar', length: 40 })
  name: Role;

  @Column({ type: 'varchar', length: 255, nullable: true })
  description: string | null;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  permissions: string[];

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}

/* ───────────────────────────── users ───────────────────────────── */
export interface UserPreferences {
  notifyParking: boolean;
  notifyAlarms: boolean;
  notifyMaintenance: boolean;
}

@Entity('users')
export class UserEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 150 })
  fullName: string;

  @Index('uq_users_username', { unique: true })
  @Column({ type: 'varchar', length: 60 })
  username: string;

  @Index('uq_users_email', { unique: true })
  @Column({ type: 'varchar', length: 255 })
  email: string;

  @Column({ type: 'varchar', length: 30, nullable: true })
  phone: string | null;

  @Column({ type: 'varchar', length: 100, select: false })
  passwordHash: string;

  @ManyToOne(() => RoleEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'role', referencedColumnName: 'name' })
  roleRef?: RoleEntity;

  @Column({ type: 'varchar', length: 40 })
  role: Role;

  @Column({ type: 'varchar', length: 20, default: UserStatus.ACTIVE })
  status: UserStatus;

  @Column({ type: 'varchar', length: 5, default: 'ar' })
  language: 'ar' | 'en';

  @Column({ type: 'jsonb', default: () => `'{"notifyParking":true,"notifyAlarms":true,"notifyMaintenance":true}'` })
  preferences: UserPreferences;

  @Column({ type: 'int', default: 0 })
  failedLoginAttempts: number;

  @Column({ type: 'timestamptz', nullable: true })
  lockedUntil: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  passwordChangedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  lastLogin: Date | null;
}

/* ───────────────────────── refresh_tokens ───────────────────────── */
@Entity('refresh_tokens')
export class RefreshTokenEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('ix_refresh_tokens_user')
  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: UserEntity;

  /** SHA-256 of the opaque token. The raw token is never stored. */
  @Index('uq_refresh_tokens_hash', { unique: true })
  @Column({ type: 'varchar', length: 64 })
  tokenHash: string;

  /** Rotation family — reuse of a revoked token revokes the whole family. */
  @Index('ix_refresh_tokens_family')
  @Column({ type: 'uuid' })
  familyId: string;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  revokedAt: Date | null;

  @Column({ type: 'varchar', length: 45, nullable: true })
  ipAddress: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  userAgent: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}

/* ───────────────────────────── vehicles ───────────────────────────── */
@Entity('vehicles')
@Index('uq_vehicles_plate_active', ['plateNumber'], { unique: true, where: '"deleted_at" IS NULL' })
export class VehicleEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('ix_vehicles_user')
  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => UserEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'user_id' })
  user?: UserEntity;

  @Column({ type: 'varchar', length: 20 })
  plateNumber: string;

  @Column({ type: 'varchar', length: 40, nullable: true })
  vehicleType: string | null;

  @Column({ type: 'varchar', length: 60, nullable: true })
  brand: string | null;

  @Column({ type: 'varchar', length: 60, nullable: true })
  model: string | null;

  @Column({ type: 'varchar', length: 40, nullable: true })
  color: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  /** Soft delete keeps parking history intact (zero data loss). */
  @Column({ type: 'timestamptz', nullable: true })
  deletedAt: Date | null;
}

/* ─────────────────────────── parking_spaces ─────────────────────────── */
@Entity('parking_spaces')
@Index('ix_parking_spaces_level_zone', ['level', 'zone'])
export class ParkingSpaceEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('uq_parking_spaces_number', { unique: true })
  @Column({ type: 'varchar', length: 20 })
  spaceNumber: string;

  @Column({ type: 'int' })
  level: number;

  @Column({ type: 'varchar', length: 20 })
  zone: string;

  @Column({ type: 'varchar', length: 20, default: SpaceStatus.AVAILABLE })
  status: SpaceStatus;

  /** A vehicle can only occupy one space. */
  @Index('uq_parking_spaces_vehicle', { unique: true, where: '"vehicle_id" IS NOT NULL' })
  @Column({ type: 'uuid', nullable: true })
  vehicleId: string | null;

  @ManyToOne(() => VehicleEntity, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'vehicle_id' })
  vehicle?: VehicleEntity | null;

  /** Controller-side address / index of this bay (from the supplier's tag list). */
  @Column({ type: 'varchar', length: 50, nullable: true })
  controllerRef: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  statusReason: string | null;

  /** Employee who moved the lift and parked the current vehicle in this bay. */
  @Column({ type: 'uuid', nullable: true })
  parkedByUserId: string | null;

  @Column({ type: 'varchar', length: 60, nullable: true })
  parkedByUsername: string | null;

  /** True when the employee parked someone else's/another vehicle (purple), false for own car (yellow). */
  @Column({ type: 'boolean', default: false })
  isOtherVehicle: boolean;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}

/* ─────────────────────────── industrial_commands ─────────────────────────── */
@Entity('industrial_commands')
@Index('ix_industrial_commands_status', ['status'])
export class IndustrialCommandEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Globally unique idempotency key sent to the controller. */
  @Index('uq_industrial_commands_command_id', { unique: true })
  @Column({ type: 'varchar', length: 50 })
  commandId: string;

  @Column({ type: 'varchar', length: 20 })
  commandType: RequestType;

  @Column({ type: 'uuid', nullable: true })
  requestedBy: string | null;

  @ManyToOne(() => UserEntity, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'requested_by' })
  requestedByUser?: UserEntity | null;

  @Column({ type: 'uuid', nullable: true })
  vehicleId: string | null;

  @ManyToOne(() => VehicleEntity, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'vehicle_id' })
  vehicle?: VehicleEntity | null;

  @Column({ type: 'uuid', nullable: true })
  parkingSpaceId: string | null;

  @ManyToOne(() => ParkingSpaceEntity, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'parking_space_id' })
  parkingSpace?: ParkingSpaceEntity | null;

  @Index('ix_industrial_commands_request')
  @Column({ type: 'uuid', nullable: true })
  parkingRequestId: string | null;

  @Column({ type: 'varchar', length: 20, default: CommandStatus.CREATED })
  status: CommandStatus;

  @Column({ type: 'jsonb', nullable: true })
  payload: Record<string, unknown> | null;

  @Column({ type: 'jsonb', nullable: true })
  controllerResponse: Record<string, unknown> | null;

  @Column({ type: 'int', default: 0 })
  progress: number;

  @Column({ type: 'varchar', length: 60, nullable: true })
  phase: string | null;

  /** Number of times the command was written to the controller. Must stay <= 1 unless the protocol is idempotent. */
  @Column({ type: 'int', default: 0 })
  sendAttempts: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  validatedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  authorizedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  sentAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  acknowledgedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @Column({ type: 'text', nullable: true })
  errorMessage: string | null;
}

/* ─────────────────────────── parking_requests ─────────────────────────── */
@Entity('parking_requests')
@Index('ix_parking_requests_user_created', ['userId', 'createdAt'])
@Index('ix_parking_requests_status', ['status'])
export class ParkingRequestEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('uq_parking_requests_number', { unique: true })
  @Column({ type: 'varchar', length: 30 })
  requestNumber: string;

  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => UserEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'user_id' })
  user?: UserEntity;

  @Index('ix_parking_requests_vehicle')
  @Column({ type: 'uuid' })
  vehicleId: string;

  @ManyToOne(() => VehicleEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'vehicle_id' })
  vehicle?: VehicleEntity;

  @Column({ type: 'varchar', length: 10 })
  requestType: RequestType;

  @Column({ type: 'varchar', length: 10, default: RequestSource.MOBILE })
  source: RequestSource;

  @Column({ type: 'varchar', length: 20, default: RequestStatus.PENDING })
  status: RequestStatus;

  @Column({ type: 'uuid', nullable: true })
  parkingSpaceId: string | null;

  @ManyToOne(() => ParkingSpaceEntity, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'parking_space_id' })
  parkingSpace?: ParkingSpaceEntity | null;

  @Column({ type: 'uuid', nullable: true })
  industrialCommandId: string | null;

  @ManyToOne(() => IndustrialCommandEntity, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'industrial_command_id' })
  command?: IndustrialCommandEntity | null;

  /** step key -> ISO timestamp at which the step was reached. */
  @Column({ type: 'jsonb', default: () => "'{}'" })
  timeline: Record<string, string>;

  @Column({ type: 'varchar', length: 40, nullable: true })
  failedStep: string | null;

  @Column({ type: 'text', nullable: true })
  errorMessage: string | null;

  /**
   * Duplicate-prevention lock: equals vehicle_id while the request is active, NULL afterwards.
   * The unique index guarantees at most ONE active request per vehicle, even under concurrency.
   */
  @Index('uq_parking_requests_active_vehicle', { unique: true, where: '"active_lock" IS NOT NULL' })
  @Column({ type: 'uuid', nullable: true })
  activeLock: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  completedAt: Date | null;
}

/* ─────────────────────────── system_events ─────────────────────────── */
@Entity('system_events')
@Index('ix_system_events_created', ['createdAt'])
@Index('ix_system_events_category', ['category'])
export class SystemEventEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 60 })
  eventType: string;

  @Column({ type: 'varchar', length: 20 })
  category: EventCategory;

  @Column({ type: 'varchar', length: 20, default: AlarmSeverity.INFO })
  severity: AlarmSeverity;

  @Column({ type: 'text' })
  message: string;

  @Column({ type: 'varchar', length: 100, default: 'BACKEND' })
  source: string;

  @Column({ type: 'jsonb', nullable: true })
  data: Record<string, unknown> | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}

/* ───────────────────────────── alarms ───────────────────────────── */
@Entity('alarms')
@Index('ix_alarms_status', ['status'])
@Index('ix_alarms_created', ['createdAt'])
export class AlarmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 40 })
  alarmCode: string;

  @Column({ type: 'varchar', length: 20 })
  severity: AlarmSeverity;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'varchar', length: 100 })
  source: string;

  @Column({ type: 'varchar', length: 20, default: AlarmStatus.ACTIVE })
  status: AlarmStatus;

  /** CONTROLLER alarms are cleared only by the controller; BACKEND alarms by the backend condition. */
  @Column({ type: 'varchar', length: 20, default: 'CONTROLLER' })
  origin: 'CONTROLLER' | 'BACKEND';

  /** "source:code" while unresolved — prevents duplicate active alarms. */
  @Index('uq_alarms_active_key', { unique: true, where: '"active_key" IS NOT NULL' })
  @Column({ type: 'varchar', length: 160, nullable: true })
  activeKey: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @Column({ type: 'uuid', nullable: true })
  acknowledgedBy: string | null;

  @ManyToOne(() => UserEntity, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'acknowledged_by' })
  acknowledgedByUser?: UserEntity | null;

  @Column({ type: 'timestamptz', nullable: true })
  acknowledgedAt: Date | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  acknowledgeNote: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  resolvedAt: Date | null;
}

/* ───────────────────────────── audit_logs ───────────────────────────── */
@Entity('audit_logs')
@Index('ix_audit_logs_created', ['createdAt'])
@Index('ix_audit_logs_user', ['userId'])
export class AuditLogEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', nullable: true })
  userId: string | null;

  @Column({ type: 'varchar', length: 60, nullable: true })
  username: string | null;

  @Column({ type: 'varchar', length: 80 })
  action: string;

  @Column({ type: 'varchar', length: 60, nullable: true })
  entity: string | null;

  @Column({ type: 'varchar', length: 60, nullable: true })
  entityId: string | null;

  @Column({ type: 'varchar', length: 45, nullable: true })
  ipAddress: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  userAgent: string | null;

  @Column({ type: 'jsonb', nullable: true })
  details: Record<string, unknown> | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}

/* ───────────────────────────── notifications ───────────────────────────── */
@Entity('notifications')
@Index('ix_notifications_user_created', ['userId', 'createdAt'])
export class NotificationEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: UserEntity;

  @Column({ type: 'varchar', length: 40 })
  type: NotificationType;

  @Column({ type: 'varchar', length: 200 })
  title: string;

  @Column({ type: 'text' })
  body: string;

  @Column({ type: 'jsonb', nullable: true })
  data: Record<string, unknown> | null;

  @Column({ type: 'timestamptz', nullable: true })
  readAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}

@Entity('device_tokens')
export class DeviceTokenEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('ix_device_tokens_user')
  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: UserEntity;

  @Index('uq_device_tokens_token', { unique: true })
  @Column({ type: 'varchar', length: 500 })
  token: string;

  @Column({ type: 'varchar', length: 10 })
  platform: 'android' | 'ios' | 'web';

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  lastSeenAt: Date;
}

/* ─────────────────────────── integration_config ─────────────────────────── */
@Entity('integration_config')
export class IntegrationConfigEntity {
  @PrimaryColumn({ type: 'int' })
  id: number;

  @Column({ type: 'varchar', length: 20 })
  protocol: string;

  /** Non-secret settings (host, port, rack, slot, endpoints, timeouts…). */
  @Column({ type: 'jsonb', default: () => "'{}'" })
  settings: Record<string, unknown>;

  /** AES-256-GCM encrypted secrets (passwords / API keys). */
  @Column({ type: 'jsonb', default: () => "'{}'" })
  secrets: Record<string, string>;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  tagMap: Record<string, unknown>;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @Column({ type: 'varchar', length: 60, nullable: true })
  updatedBy: string | null;
}

/* ─────────────────────────── authorized_devices (MAC / Device ID) ─────────────────────────── */
@Entity('authorized_devices')
export class AuthorizedDeviceEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 150 })
  employeeName: string;

  @Column({ type: 'varchar', length: 60, nullable: true })
  username: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  macAddress: string | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  deviceId: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  deviceModel: string | null;

  @Column({ type: 'varchar', length: 20, default: 'ACTIVE' })
  status: 'ACTIVE' | 'REVOKED';

  @Column({ type: 'boolean', default: true })
  canControl: boolean;

  @Column({ type: 'varchar', length: 255, nullable: true })
  revokeReason: string | null;

  @Column({ type: 'varchar', length: 60, nullable: true })
  revokedBy: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  revokedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  lastSeenAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}

export const ALL_ENTITIES = [
  RoleEntity, UserEntity, RefreshTokenEntity, VehicleEntity, ParkingSpaceEntity, IndustrialCommandEntity,
  ParkingRequestEntity, SystemEventEntity, AlarmEntity, AuditLogEntity, NotificationEntity, DeviceTokenEntity,
  IntegrationConfigEntity, AuthorizedDeviceEntity,
];
