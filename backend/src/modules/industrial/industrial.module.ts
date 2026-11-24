import { BadRequestException, Body, Controller, ForbiddenException, Get, Global, Module, Param, Post, Put, Query } from '@nestjs/common';
import { IsBoolean, IsDefined, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { AuthUser, CurrentUser, ReqMeta, RequestMeta, RequirePermissions } from '../../common/decorators';
import { CommandStatus, RequestType } from '../../common/enums';
import { PaginationQuery } from '../../common/pagination';
import { hasPermission, Permission } from '../../common/permissions';
import { MockScenario } from './adapters/mock-industrial.adapter';
import { EmergencyRecoveryAction, SiemensS7Adapter } from './adapters/siemens-s7.adapter';
import { IndustrialIntegrationService } from './industrial.service';
import { VncBridgeService, VncWebController } from './vnc-web.controller';

export class CommandsQuery extends PaginationQuery {
  @IsOptional() @IsString() status?: CommandStatus;
  @IsOptional() @IsString() type?: RequestType;
}

export class SimulationScenarioDto {
  @IsIn([
    'NORMAL', 'FAIL_NEXT', 'TIMEOUT_NEXT', 'GO_OFFLINE', 'GO_ONLINE',
    'RAISE_WARNING', 'RAISE_CRITICAL', 'EMERGENCY_STOP', 'CLEAR_EMERGENCY', 'CLEAR_ALARMS',
  ])
  scenario: MockScenario;
}

export class EmergencyRecoveryDto {
  @IsIn(['COMPLETE_SEQ', 'RETURN_PARK', 'SAFE_RESET', 'ESTOP_ON', 'ESTOP_OFF'])
  action: EmergencyRecoveryAction;
}

export class ManualControlDto {
  @IsString()
  controlKey: string;

  @IsBoolean()
  active: boolean;
}

export class WritePlcTagDto {
  @IsString()
  address: string;

  @IsDefined()
  value: boolean | number;

  @IsOptional() @IsInt() @Min(0) @Max(3000)
  pulseMs?: number;
}

@Controller()
export class IndustrialControllerHttp {
  constructor(private readonly industrial: IndustrialIntegrationService) {}

  @Get('system/status')
  getSystemStatus() {
    return this.industrial.getSystemStatus();
  }

  @Get('industrial/status')
  async getIndustrialStatus() {
    const st = await this.industrial.getSystemStatus();
    const cfg = await this.industrial.getPublicConfig();
    const configured = cfg.protocol === 'MOCK' || Boolean(cfg.host || cfg.opcuaEndpoint || cfg.mqttUrl || cfg.restBaseUrl);
    return { ...st, protocol: cfg.protocol, configured };
  }

  @Get('industrial/s7/live')
  @RequirePermissions(Permission.SYSTEM_MONITOR)
  getLiveS7Diagnostics() {
    const ctrl = this.industrial.getActiveController();
    if (ctrl instanceof SiemensS7Adapter) {
      return ctrl.getLiveDiagnostics();
    }
    return { connected: false, message: 'Active adapter is not SIEMENS_S7', adapter: ctrl?.protocol ?? null };
  }

  @Get('industrial/s7/sensors')
  @RequirePermissions(Permission.SYSTEM_MONITOR)
  getLiveSensorsSnapshot() {
    return this.industrial.getSensorsSnapshot();
  }

  /**
   * Emergency Stop (ESTOP_ON) is safety-critical and allowed for ALL authenticated user roles.
   * Releasing / resetting E-Stop (ESTOP_OFF, SAFE_RESET, etc.) requires ALARMS_ACKNOWLEDGE permission.
   */
  @Post('industrial/s7/recovery')
  executeEmergencyRecovery(
    @Body() body: EmergencyRecoveryDto,
    @CurrentUser() user: AuthUser,
    @ReqMeta() meta: RequestMeta,
  ) {
    const action = body?.action;
    if (!action) throw new BadRequestException('action is required');
    if (
      action !== 'ESTOP_ON' &&
      !(action === 'RETURN_PARK' && hasPermission(user.role, Permission.PARKING_REQUEST)) &&
      !hasPermission(user.role, Permission.ALARMS_ACKNOWLEDGE)
    ) {
      throw new ForbiddenException(
        'Only authorized supervisors/engineers can release Emergency Stop. / إلغاء إيقاف الطوارئ مقتصر على المشرفين أو مدير النظام فقط.',
      );
    }
    return this.industrial.executeEmergencyRecovery(action, user, meta);
  }

  @Post('industrial/s7/manual')
  @RequirePermissions(Permission.DIAGNOSTICS_VIEW)
  executeManualControl(
    @Body() body: ManualControlDto,
    @CurrentUser() user: AuthUser,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.industrial.executeManualControl(body.controlKey, Boolean(body.active), user, meta);
  }

  @Post('industrial/s7/write')
  @RequirePermissions(Permission.CONFIG_MANAGE)
  async writeLiveS7Tag(
    @Body() body: WritePlcTagDto,
    @CurrentUser() user: AuthUser,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.industrial.writeLiveS7Tag(body.address, body.value, body.pulseMs, user, meta);
  }

  @Get('industrial/commands')
  @RequirePermissions(Permission.COMMANDS_VIEW)
  listCommands(@Query() q: CommandsQuery) {
    return this.industrial.listCommands(q);
  }

  @Get('industrial/commands/:id')
  @RequirePermissions(Permission.COMMANDS_VIEW)
  getCommand(@Param('id') id: string) {
    return this.industrial.getCommand(id);
  }

  @Get('industrial/config')
  @RequirePermissions(Permission.CONFIG_MANAGE)
  getConfig() {
    return this.industrial.getPublicConfig();
  }

  @Put('industrial/config')
  @RequirePermissions(Permission.CONFIG_MANAGE)
  updateConfig(@Body() body: Record<string, unknown>, @CurrentUser() user: AuthUser, @ReqMeta() meta: RequestMeta) {
    return this.industrial.updateConfig(body, user, meta);
  }

  @Post('industrial/config/test')
  @RequirePermissions(Permission.CONFIG_MANAGE)
  testConfig(@Body() body?: Record<string, unknown>) {
    return this.industrial.testConnection(body);
  }

  @Get('simulation/state')
  @RequirePermissions(Permission.SIMULATION_CONTROL)
  getSimState() {
    return this.industrial.getSimulationState();
  }

  @Post('simulation/scenario')
  @RequirePermissions(Permission.SIMULATION_CONTROL)
  applyScenario(@Body() dto: SimulationScenarioDto, @CurrentUser() user: AuthUser, @ReqMeta() meta: RequestMeta) {
    return this.industrial.applySimulationScenario(dto.scenario, user, meta);
  }
}

@Global()
@Module({
  providers: [IndustrialIntegrationService, VncBridgeService],
  controllers: [IndustrialControllerHttp, VncWebController],
  exports: [IndustrialIntegrationService, VncBridgeService],
})
export class IndustrialModule {}
