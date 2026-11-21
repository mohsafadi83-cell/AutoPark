import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { DataSource, Repository } from 'typeorm';
import { Inject } from '@nestjs/common';
import { APP_CONFIG, AppConfig } from '../config/app.config';
import { Role, SpaceStatus, UserStatus } from '../common/enums';
import { ROLE_PERMISSIONS } from '../common/permissions';
import {
  IntegrationConfigEntity, ParkingSpaceEntity, RoleEntity, UserEntity, VehicleEntity,
} from './entities';
import { DEFAULT_TAG_DESCRIPTIONS, TAG_KEYS } from '../modules/industrial/integration-settings';

@Injectable()
export class SeedService implements OnModuleInit {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    @Inject(APP_CONFIG) private readonly cfg: AppConfig,
    private readonly dataSource: DataSource,
    @InjectRepository(RoleEntity) private readonly rolesRepo: Repository<RoleEntity>,
    @InjectRepository(UserEntity) private readonly usersRepo: Repository<UserEntity>,
    @InjectRepository(VehicleEntity) private readonly vehiclesRepo: Repository<VehicleEntity>,
    @InjectRepository(ParkingSpaceEntity) private readonly spacesRepo: Repository<ParkingSpaceEntity>,
    @InjectRepository(IntegrationConfigEntity) private readonly configRepo: Repository<IntegrationConfigEntity>,
  ) {}

  async onModuleInit() {
    await this.ensureExtendedSchema();
    await this.seedRoles();
    await this.seedIntegrationConfig();
    await this.seedParkingLayout();
    if (this.cfg.seedDemo) {
      await this.seedDemoData();
    } else if (this.cfg.bootstrapAdmin.password) {
      await this.seedBootstrapAdmin();
    }
  }

  private async ensureExtendedSchema() {
    await this.dataSource.query(`
      ALTER TABLE parking_spaces
        ADD COLUMN IF NOT EXISTS parked_by_user_id uuid NULL,
        ADD COLUMN IF NOT EXISTS parked_by_username varchar(60) NULL,
        ADD COLUMN IF NOT EXISTS is_other_vehicle boolean NOT NULL DEFAULT false;
    `);
    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS authorized_devices (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        employee_name varchar(150) NOT NULL,
        username varchar(60) NULL,
        mac_address varchar(32) NULL,
        device_id varchar(80) NULL,
        device_model varchar(100) NULL,
        status varchar(20) NOT NULL DEFAULT 'ACTIVE',
        can_control boolean NOT NULL DEFAULT true,
        revoke_reason varchar(255) NULL,
        revoked_by varchar(60) NULL,
        revoked_at timestamptz NULL,
        last_seen_at timestamptz NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    await this.dataSource.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_authorized_devices_mac
        ON authorized_devices (mac_address) WHERE mac_address IS NOT NULL;
    `);
    await this.dataSource.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_authorized_devices_device_id
        ON authorized_devices (device_id) WHERE device_id IS NOT NULL;
    `);
  }

  private async seedRoles() {
    const descriptions: Record<Role, string> = {
      [Role.SUPER_ADMIN]: 'Full system access including simulation and safety settings',
      [Role.SYSTEM_ADMIN]: 'Manage users, vehicles, parking, and industrial configuration',
      [Role.OPERATOR]: 'Control parking & retrieval operations and monitor system',
      [Role.PARKING_ATTENDANT]: 'Assist customers with parking and retrieval requests',
      [Role.MAINTENANCE_ENGINEER]: 'View diagnostics, commands, alarms, and run simulation tests',
      [Role.CUSTOMER]: 'Register own vehicles and request parking/retrieval',
      [Role.READ_ONLY]: 'Monitor dashboard, parking map, and alarms (read-only)',
    };
    for (const role of Object.values(Role)) {
      await this.rolesRepo.save({
        name: role,
        description: descriptions[role],
        permissions: ROLE_PERMISSIONS[role],
      });
    }
  }

  private async seedIntegrationConfig() {
    const liveS7Tags: Record<string, { address: string; dataType: string; access: string; description: string }> = {
      system_ready_tag: { address: 'M3.7', dataType: 'BOOL', access: 'R', description: 'S7-1200 System Ready flag (MB3 bit 7)' },
      emergency_status_tag: { address: 'M0.0', dataType: 'BOOL', access: 'R', description: 'S7-1200 Emergency Stop status' },
      safety_ok_tag: { address: 'I0.7', dataType: 'BOOL', access: 'R', description: 'S7-1200 Safety circuit input (IB0 bit 7)' },
      heartbeat_tag: { address: 'DB2,INT2', dataType: 'INT', access: 'R', description: 'S7-1200 DB2 word 2 status/heartbeat' },
      machine_state_tag: { address: 'DB2,B4', dataType: 'INT', access: 'R', description: 'S7-1200 DB2 byte 4 machine state' },
      parking_space_status_tag: { address: 'IB0', dataType: 'WORD', access: 'R', description: 'S7-1200 Digital input sensors IB0..IB2' },
      vehicle_position_tag: { address: 'MB13', dataType: 'INT', access: 'R', description: 'S7-1200 Merker byte MB13 position' },
      alarm_tag: { address: 'MW20', dataType: 'WORD', access: 'R', description: 'S7-1200 Alarm word MW20' },
      park_command_tag: { address: 'DB1,X0.0', dataType: 'BOOL', access: 'W', description: 'S7-1200 Park command trigger' },
      retrieve_command_tag: { address: 'DB1,X0.1', dataType: 'BOOL', access: 'W', description: 'S7-1200 Retrieve command trigger' },
      command_id_tag: { address: 'DB1,INT2', dataType: 'INT', access: 'W', description: 'S7-1200 Command ID word' },
      target_space_tag: { address: 'MW10', dataType: 'INT', access: 'W', description: 'S7-1200 Target spot number' },
      command_acknowledgement_tag: { address: 'DB2,INT2', dataType: 'INT', access: 'R', description: 'S7-1200 Command acknowledgement' },
      command_complete_tag: { address: 'DB2,INT6', dataType: 'INT', access: 'R', description: 'S7-1200 Command completion' },
      command_error_tag: { address: 'MW22', dataType: 'INT', access: 'R', description: 'S7-1200 Error word' },
    };

    const existing = await this.configRepo.findOne({ where: { id: 1 } });
    if (existing) {
      const s = (existing.settings ?? {}) as Record<string, unknown>;
      if (s.host !== '192.168.0.27' || existing.protocol !== 'SIEMENS_S7') {
        existing.protocol = 'SIEMENS_S7';
        existing.settings = {
          ...s,
          plcModel: 'Siemens SIMATIC S7-1200 (192.168.0.27:102) + HMI KTP400 (192.168.0.30:5900)',
          host: '192.168.0.27',
          port: 102,
          rack: 0,
          slot: 1,
        };
        existing.tagMap = liveS7Tags;
        await this.configRepo.save(existing);
      }
      return;
    }

    const defaultTagMap: Record<string, unknown> = {};
    for (const k of TAG_KEYS) {
      defaultTagMap[k] = {
        address: '',
        dataType: DEFAULT_TAG_DESCRIPTIONS[k].dataType,
        access: DEFAULT_TAG_DESCRIPTIONS[k].access,
        description: DEFAULT_TAG_DESCRIPTIONS[k].description,
      };
    }

    await this.configRepo.save({
      id: 1,
      protocol: this.cfg.industrial.protocol,
      settings: {
        plcModel: this.cfg.industrial.plcModel,
        host: this.cfg.industrial.host,
        port: this.cfg.industrial.port,
        rack: this.cfg.industrial.rack ?? 0,
        slot: this.cfg.industrial.slot ?? 1,
        opcuaEndpoint: this.cfg.industrial.opcuaEndpoint,
        opcuaSecurityMode: 'None',
        opcuaUsername: null,
        modbusUnitId: 1,
        mqttUrl: this.cfg.industrial.mqttUrl,
        mqttTopicPrefix: 'autopark/plc',
        mqttUsername: null,
        restBaseUrl: this.cfg.industrial.restBaseUrl,
        pollIntervalMs: this.cfg.industrial.pollIntervalMs,
        ackTimeoutMs: this.cfg.industrial.ackTimeoutMs,
        completionTimeoutMs: this.cfg.industrial.completionTimeoutMs,
        heartbeatTimeoutMs: this.cfg.industrial.heartbeatTimeoutMs,
        supportsIdempotentCommands: false,
        readOnly: false,
        syncSpacesFromController: false,
        alarmDefinitions: [
          { bit: 0, code: 'PLC_E_STOP', severity: 'EMERGENCY', description: 'Emergency Stop circuit open' },
          { bit: 1, code: 'PLC_ENTRY_SENSOR', severity: 'CRITICAL', description: 'Entry bay photo-sensor obstructed' },
          { bit: 2, code: 'PLC_OVERHEIGHT', severity: 'WARNING', description: 'Vehicle over-height detected at entry' },
          { bit: 3, code: 'PLC_LIFT_OVERLOAD', severity: 'CRITICAL', description: 'Main lift overload protection tripped' },
        ],
      },
      secrets: {},
      tagMap: defaultTagMap,
      updatedBy: 'system-bootstrap',
    });
  }

  private async seedParkingLayout() {
    // Exact 12 spots from TECHNO Electrical.Jo Siemens KTP400 Basic "Spot Selection" screen (480x272):
    // 4 Lanes (Lane 1..4) × 3 Floors (P1..P3): L11..L13, L21..L23, L31..L33, L41..L43
    const laneCenterX = [96, 202, 313, 424];
    const rowCenterY = [84, 136, 186];

    const desiredNumbers = new Set<string>();
    const desiredRows: Array<{ spaceNumber: string; level: number; zone: string; controllerRef: string }> = [];
    for (let lane = 1; lane <= 4; lane++) {
      for (let p = 1; p <= 3; p++) {
        const num = `L${lane}${p}`;
        desiredNumbers.add(num);
        desiredRows.push({
          spaceNumber: num,
          level: p,
          zone: `Lane ${lane}`,
          controllerRef: `${laneCenterX[lane - 1]},${rowCenterY[p - 1]}`,
        });
      }
    }

    const existing = await this.spacesRepo.find();
    // Free and remove legacy L1-A01..L1-A12 spaces so the DB switches cleanly to L11..L43
    const legacySpaces = existing.filter((s) => !desiredNumbers.has(s.spaceNumber));
    for (const ls of legacySpaces) {
      if (ls.vehicleId) {
        ls.vehicleId = null;
        ls.status = SpaceStatus.AVAILABLE;
        await this.spacesRepo.save(ls);
      }
    }
    if (legacySpaces.length > 0) {
      await this.spacesRepo.remove(legacySpaces);
    }

    const remaining = await this.spacesRepo.find();
    const existingByNumber = new Map(remaining.map((s) => [s.spaceNumber, s]));

    const toInsert = desiredRows
      .filter((r) => !existingByNumber.has(r.spaceNumber))
      .map((r) => ({
        spaceNumber: r.spaceNumber,
        level: r.level,
        zone: r.zone,
        status: SpaceStatus.AVAILABLE,
        vehicleId: null,
        controllerRef: r.controllerRef,
      }));

    if (toInsert.length > 0) {
      await this.spacesRepo.save(toInsert);
    }
    this.logger.log(`Parking layout active: ${desiredRows.length} total spaces (4 Lanes × 3 Floors: L11..L43)`);
  }

  private async seedBootstrapAdmin() {
    const count = await this.usersRepo.count();
    if (count > 0) return;
    const hash = await bcrypt.hash(this.cfg.bootstrapAdmin.password, this.cfg.auth.bcryptRounds);
    await this.usersRepo.save({
      fullName: 'Super Administrator',
      username: this.cfg.bootstrapAdmin.username,
      email: this.cfg.bootstrapAdmin.email,
      passwordHash: hash,
      role: Role.SUPER_ADMIN,
      status: UserStatus.ACTIVE,
      language: 'ar',
    });
  }

  private async seedDemoData() {
    // Default Jordanian users & phone numbers (+962)
    const demoUsers: Array<{ username: string; fullName: string; email: string; phone: string; password: string; role: Role }> = [
      { username: 'superadmin', fullName: 'م. رامي النقا (مدير النظام الأعلى)', email: 'superadmin@autopark.jo', phone: '+962795100001', password: 'Admin@12345', role: Role.SUPER_ADMIN },
      { username: 'admin', fullName: 'خالد الطراونة (مدير النظام)', email: 'admin@autopark.jo', phone: '+962795100002', password: 'Admin@12345', role: Role.SYSTEM_ADMIN },
      { username: 'operator', fullName: 'فهد العبادي (مشغّل النظام)', email: 'operator@autopark.jo', phone: '+962795100003', password: 'Operator@123', role: Role.OPERATOR },
      { username: 'attendant', fullName: 'سعد الزعبي (موظف مواقف)', email: 'attendant@autopark.jo', phone: '+962785100004', password: 'Operator@123', role: Role.PARKING_ATTENDANT },
      { username: 'engineer', fullName: 'م. طارق المومني (مهندس صيانة)', email: 'engineer@autopark.jo', phone: '+962795100005', password: 'Engineer@123', role: Role.MAINTENANCE_ENGINEER },
      { username: 'customer', fullName: 'عميل مواقف (عميل)', email: 'customer@autopark.jo', phone: '+962775100006', password: 'Customer@123', role: Role.CUSTOMER },
      { username: 'viewer', fullName: 'ياسر الحياري (قراءة فقط)', email: 'viewer@autopark.jo', phone: '+962795100007', password: 'Viewer@1234', role: Role.READ_ONLY },
    ];

    const rounds = this.cfg.isTest ? 4 : Math.min(10, this.cfg.auth.bcryptRounds);
    for (const u of demoUsers) {
      const exists = await this.usersRepo.findOne({ where: { username: u.username } });
      if (!exists) {
        await this.usersRepo.save({
          fullName: u.fullName,
          username: u.username,
          email: u.email,
          phone: u.phone,
          passwordHash: await bcrypt.hash(u.password, rounds),
          role: u.role,
          status: UserStatus.ACTIVE,
          language: 'en',
        });
      } else if (exists.phone?.startsWith('+966') || exists.email.endsWith('.local')) {
        exists.fullName = u.fullName;
        exists.email = u.email;
        exists.phone = u.phone;
        await this.usersRepo.save(exists);
      }
    }

    const customer = await this.usersRepo.findOne({ where: { username: 'customer' } });
    const operator = await this.usersRepo.findOne({ where: { username: 'operator' } });
    if (!customer || !operator) return;

    // Migrate any legacy non-Jordanian demo plates if present
    const legacyPlateMap: Record<string, string> = {
      'ABC 1234': '10-45821',
      'KSA 9080': '22-78910',
      'RYD 5500': '15-30492',
    };
    for (const [oldPlate, newPlate] of Object.entries(legacyPlateMap)) {
      const oldVeh = await this.vehiclesRepo.findOne({ where: { plateNumber: oldPlate } });
      if (oldVeh) {
        const conflict = await this.vehiclesRepo.findOne({ where: { plateNumber: newPlate } });
        if (!conflict) {
          oldVeh.plateNumber = newPlate;
          await this.vehiclesRepo.save(oldVeh);
        }
      }
    }

    const vehCount = await this.vehiclesRepo.count();
    if (vehCount === 0) {
      await this.vehiclesRepo.save({
        userId: customer.id,
        plateNumber: '10-45821',
        vehicleType: 'SEDAN',
        brand: 'Toyota',
        model: 'Camry',
        color: 'White',
      });
      const v2 = await this.vehiclesRepo.save({
        userId: customer.id,
        plateNumber: '22-78910',
        vehicleType: 'SUV',
        brand: 'Lexus',
        model: 'RX 350',
        color: 'Black',
      });
      await this.vehiclesRepo.save({
        userId: operator.id,
        plateNumber: '15-30492',
        vehicleType: 'SEDAN',
        brand: 'Hyundai',
        model: 'Ioniq 6',
        color: 'Silver',
      });
    }
  }
}
