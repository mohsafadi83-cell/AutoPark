import * as mqtt from 'mqtt';
import * as net from 'net';
import { Protocol } from '../../../common/enums';
import {
  CommandFeedback, ConnectionTestResult, ControllerAlarm, ControllerCommand, ControllerError, ControllerEvent,
  ControllerEventListener, ControllerSpaceStatus, ControllerStatus, IndustrialController, OFFLINE_STATUS,
} from '../industrial-controller.interface';
import { IntegrationSettings } from '../integration-settings';

/**
 * MQTT Industrial Gateway Adapter.
 * Subscribes to `{prefix}/status`, `{prefix}/alarms`, `{prefix}/command/feedback`
 * and publishes commands to `{prefix}/command/request` with QoS 1.
 */
export class MqttAdapter implements IndustrialController {
  readonly protocol = Protocol.MQTT;
  readonly capabilities: { idempotentCommands: boolean; spaceSync: boolean; pushEvents: boolean };

  private client: mqtt.MqttClient | null = null;
  private listeners = new Set<ControllerEventListener>();
  private status: ControllerStatus = { ...OFFLINE_STATUS };
  private alarms: ControllerAlarm[] = [];
  private feedbacks = new Map<string, CommandFeedback>();

  constructor(private readonly settings: IntegrationSettings, private readonly writeEnabled: boolean) {
    this.capabilities = { idempotentCommands: settings.supportsIdempotentCommands, spaceSync: false, pushEvents: true };
  }

  private get prefix(): string {
    return (this.settings.mqttTopicPrefix || 'autopark/plc').replace(/\/+$/, '');
  }

  async connect(): Promise<void> {
    if (!this.settings.mqttUrl) throw new ControllerError('MQTT broker URL is not configured', 'NOT_CONFIGURED');
    await new Promise<void>((resolve, reject) => {
      const c = mqtt.connect(this.settings.mqttUrl!, {
        username: this.settings.mqttUsername ?? undefined,
        password: this.settings.mqttPassword ?? undefined,
        connectTimeout: 4000,
        reconnectPeriod: 0,
      });
      this.client = c;
      const onErr = (err: Error) => {
        c.end(true);
        reject(new ControllerError(`MQTT connect error: ${err.message}`, 'NOT_CONNECTED'));
      };
      c.once('error', onErr);
      c.once('connect', () => {
        c.removeListener('error', onErr);
        c.subscribe([`${this.prefix}/status`, `${this.prefix}/alarms`, `${this.prefix}/command/feedback`], { qos: 1 });
        this.status = { ...this.status, connected: true, plcConnected: true, lastHeartbeat: new Date() };
        this.emit({ type: 'CONNECTION', connected: true });
        resolve();
      });
      c.on('message', (topic, buf) => this.onMessage(topic, buf));
      c.on('close', () => {
        this.status = { ...OFFLINE_STATUS };
        this.emit({ type: 'CONNECTION', connected: false, reason: 'MQTT connection closed' });
      });
    });
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await new Promise<void>((r) => this.client!.end(false, {}, () => r()));
      this.client = null;
    }
    this.status = { ...OFFLINE_STATUS };
  }

  isConnected(): boolean {
    return Boolean(this.client?.connected);
  }

  async getSystemStatus(): Promise<ControllerStatus> {
    return { ...this.status, connected: this.isConnected() };
  }

  async getParkingStatus(): Promise<ControllerSpaceStatus[] | null> {
    return null;
  }

  async sendParkCommand(cmd: ControllerCommand): Promise<void> {
    await this.publishCommand(cmd);
  }

  async sendRetrieveCommand(cmd: ControllerCommand): Promise<void> {
    await this.publishCommand(cmd);
  }

  private async publishCommand(cmd: ControllerCommand): Promise<void> {
    if (!this.client?.connected) throw new ControllerError('MQTT broker not connected', 'NOT_CONNECTED');
    if (!this.writeEnabled || this.settings.readOnly) throw new ControllerError('Writes disabled by configuration', 'REJECTED');
    const payload = JSON.stringify({
      commandId: cmd.commandId,
      sequence: cmd.sequence,
      type: cmd.type,
      spaceNumber: cmd.spaceNumber,
      controllerRef: cmd.controllerRef,
      plateNumber: cmd.plateNumber,
      timestamp: new Date().toISOString(),
    });
    this.feedbacks.set(cmd.commandId, { commandId: cmd.commandId, status: 'RECEIVED', progress: 0 });
    await new Promise<void>((resolve, reject) => {
      this.client!.publish(`${this.prefix}/command/request`, payload, { qos: 1 }, (err) => {
        if (err) return reject(new ControllerError(`MQTT publish failed: ${err.message}`, 'WRITE_FAILED'));
        resolve();
      });
    });
  }

  async getCommandStatus(commandId: string): Promise<CommandFeedback> {
    return this.feedbacks.get(commandId) ?? { commandId, status: 'UNKNOWN' };
  }

  async getActiveAlarms(): Promise<ControllerAlarm[]> {
    return [...this.alarms];
  }

  subscribeToEvents(listener: ControllerEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async testConnection(): Promise<ConnectionTestResult> {
    const t = Date.now();
    try {
      await this.connect();
      await this.disconnect();
      return { ok: true, message: 'MQTT broker connected successfully', latencyMs: Date.now() - t };
    } catch (e) {
      return { ok: false, message: (e as Error).message, latencyMs: null };
    }
  }

  private onMessage(topic: string, buf: Buffer) {
    try {
      const data = JSON.parse(buf.toString('utf8'));
      if (topic.endsWith('/status')) {
        this.status = {
          connected: true,
          plcConnected: Boolean(data.plcConnected ?? true),
          systemReady: Boolean(data.systemReady),
          emergencyStop: Boolean(data.emergencyStop),
          safetyOk: Boolean(data.safetyOk ?? !data.emergencyStop),
          machineState: data.machineState ?? 'IDLE',
          lastHeartbeat: new Date(),
          activeCommandId: data.activeCommandId ?? null,
          raw: data,
        };
        this.emit({ type: 'STATUS', status: this.status });
      } else if (topic.endsWith('/alarms') && Array.isArray(data)) {
        this.alarms = data;
        this.emit({ type: 'ALARMS', alarms: this.alarms });
      } else if (topic.endsWith('/command/feedback') && data.commandId) {
        const fb: CommandFeedback = {
          commandId: data.commandId,
          status: data.status,
          progress: data.progress,
          phase: data.phase,
          errorCode: data.errorCode,
          errorMessage: data.errorMessage,
          raw: data,
        };
        this.feedbacks.set(fb.commandId, fb);
        this.emit({ type: 'COMMAND', feedback: fb });
      }
    } catch {
      /* ignore malformed frame */
    }
  }

  private emit(e: ControllerEvent) {
    for (const l of this.listeners) {
      try {
        l(e);
      } catch {
        /* ignore */
      }
    }
  }
}

/**
 * REST API Gateway Adapter & Custom TCP/IP Industrial Protocol Adapter.
 */
export class RestGatewayAdapter implements IndustrialController {
  readonly protocol = Protocol.REST_GATEWAY;
  readonly capabilities: { idempotentCommands: boolean; spaceSync: boolean; pushEvents: boolean };
  private connected = false;
  private listeners = new Set<ControllerEventListener>();
  private lastStatus: ControllerStatus = { ...OFFLINE_STATUS };

  constructor(private readonly settings: IntegrationSettings, private readonly writeEnabled: boolean) {
    this.capabilities = { idempotentCommands: settings.supportsIdempotentCommands, spaceSync: false, pushEvents: false };
  }

  private get baseUrl(): string {
    if (!this.settings.restBaseUrl) throw new ControllerError('REST gateway base URL is not configured', 'NOT_CONFIGURED');
    return this.settings.restBaseUrl.replace(/\/+$/, '');
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { 'content-type': 'application/json' };
    if (this.settings.restApiKey) h['x-api-key'] = this.settings.restApiKey;
    return h;
  }

  async connect(): Promise<void> {
    await this.getSystemStatus();
    this.connected = true;
    this.emit({ type: 'CONNECTION', connected: true });
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    this.emit({ type: 'CONNECTION', connected: false });
  }

  isConnected(): boolean {
    return this.connected;
  }

  async getSystemStatus(): Promise<ControllerStatus> {
    const res = await fetch(`${this.baseUrl}/status`, { headers: this.headers(), signal: AbortSignal.timeout(4000) }).catch((e) => {
      throw new ControllerError(`REST gateway unreachable: ${(e as Error).message}`, 'NOT_CONNECTED');
    });
    if (!res.ok) throw new ControllerError(`REST gateway HTTP ${res.status}`, 'NOT_CONNECTED');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const d: any = await res.json();
    this.lastStatus = {
      connected: true,
      plcConnected: Boolean(d.plcConnected ?? true),
      systemReady: Boolean(d.systemReady),
      emergencyStop: Boolean(d.emergencyStop),
      safetyOk: Boolean(d.safetyOk ?? !d.emergencyStop),
      machineState: d.machineState ?? 'IDLE',
      lastHeartbeat: new Date(),
      activeCommandId: d.activeCommandId ?? null,
      raw: d,
    };
    return this.lastStatus;
  }

  async getParkingStatus(): Promise<ControllerSpaceStatus[] | null> {
    return null;
  }

  async sendParkCommand(cmd: ControllerCommand): Promise<void> {
    await this.postCommand(cmd);
  }

  async sendRetrieveCommand(cmd: ControllerCommand): Promise<void> {
    await this.postCommand(cmd);
  }

  private async postCommand(cmd: ControllerCommand): Promise<void> {
    if (!this.writeEnabled || this.settings.readOnly) throw new ControllerError('Writes disabled by configuration', 'REJECTED');
    const res = await fetch(`${this.baseUrl}/commands`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(cmd),
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) throw new ControllerError(`REST gateway command rejected (HTTP ${res.status})`, 'WRITE_FAILED');
  }

  async getCommandStatus(commandId: string): Promise<CommandFeedback> {
    const res = await fetch(`${this.baseUrl}/commands/${encodeURIComponent(commandId)}`, {
      headers: this.headers(),
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return { commandId, status: 'UNKNOWN' };
    return (await res.json()) as CommandFeedback;
  }

  async getActiveAlarms(): Promise<ControllerAlarm[]> {
    const res = await fetch(`${this.baseUrl}/alarms`, { headers: this.headers(), signal: AbortSignal.timeout(4000) });
    if (!res.ok) return [];
    return (await res.json()) as ControllerAlarm[];
  }

  subscribeToEvents(listener: ControllerEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async testConnection(): Promise<ConnectionTestResult> {
    const t = Date.now();
    try {
      await this.getSystemStatus();
      return { ok: true, message: 'REST gateway responded', latencyMs: Date.now() - t };
    } catch (e) {
      return { ok: false, message: (e as Error).message, latencyMs: null };
    }
  }

  private emit(e: ControllerEvent) {
    for (const l of this.listeners) {
      try {
        l(e);
      } catch {
        /* ignore */
      }
    }
  }
}

/**
 * Custom framing TCP/IP adapter (newline-delimited JSON frames over TCP socket).
 * Ready to be tailored once the supplier provides the byte framing specification.
 */
export class CustomTcpAdapter implements IndustrialController {
  readonly protocol = Protocol.CUSTOM_TCP;
  readonly capabilities: { idempotentCommands: boolean; spaceSync: boolean; pushEvents: boolean };
  private socket: net.Socket | null = null;
  private listeners = new Set<ControllerEventListener>();
  private status: ControllerStatus = { ...OFFLINE_STATUS };
  private feedbacks = new Map<string, CommandFeedback>();

  constructor(private readonly settings: IntegrationSettings, private readonly writeEnabled: boolean) {
    this.capabilities = { idempotentCommands: settings.supportsIdempotentCommands, spaceSync: false, pushEvents: true };
  }

  async connect(): Promise<void> {
    const host = this.settings.host || '192.168.0.30';
    const port = this.settings.port || 5900;
    await new Promise<void>((resolve, reject) => {
      const s = net.connect({ host, port, timeout: 4000 }, () => {
        this.socket = s;
        this.status = {
          ...this.status,
          connected: true,
          plcConnected: true,
          systemReady: true,
          safetyOk: true,
          machineState: 'IDLE',
          lastHeartbeat: new Date(),
        };
        this.emit({ type: 'CONNECTION', connected: true });
        resolve();
      });
      s.once('error', (e) => reject(new ControllerError(`VNC/TCP connect failed (${host}:${port}): ${e.message}`, 'NOT_CONNECTED')));
      s.once('timeout', () => {
        s.destroy();
        reject(new ControllerError(`VNC/TCP connection timeout (${host}:${port}) — check Ethernet cable & subnet 192.168.0.x`, 'NOT_CONNECTED'));
      });
      s.on('close', () => {
        this.socket = null;
        this.status = { ...OFFLINE_STATUS };
        this.emit({ type: 'CONNECTION', connected: false, reason: 'TCP socket closed' });
      });
    });
  }

  async disconnect(): Promise<void> {
    this.socket?.destroy();
    this.socket = null;
  }

  isConnected(): boolean {
    return Boolean(this.socket && !this.socket.destroyed);
  }

  async getSystemStatus(): Promise<ControllerStatus> {
    return { ...this.status, connected: this.isConnected() };
  }

  async getParkingStatus(): Promise<ControllerSpaceStatus[] | null> {
    return null;
  }

  async sendParkCommand(cmd: ControllerCommand): Promise<void> {
    await this.sendFrame(cmd);
  }

  async sendRetrieveCommand(cmd: ControllerCommand): Promise<void> {
    await this.sendFrame(cmd);
  }

  private async sendFrame(cmd: ControllerCommand): Promise<void> {
    if (!this.isConnected() || !this.socket) throw new ControllerError('Custom TCP socket not connected', 'NOT_CONNECTED');
    if (!this.writeEnabled || this.settings.readOnly) throw new ControllerError('Writes disabled by configuration', 'REJECTED');
    this.feedbacks.set(cmd.commandId, { commandId: cmd.commandId, status: 'RECEIVED', progress: 0 });
    await new Promise<void>((resolve, reject) => {
      this.socket!.write(JSON.stringify(cmd) + '\n', (err) => {
        if (err) return reject(new ControllerError(`TCP write failed: ${err.message}`, 'WRITE_FAILED'));
        resolve();
      });
    });
  }

  async getCommandStatus(commandId: string): Promise<CommandFeedback> {
    return this.feedbacks.get(commandId) ?? { commandId, status: 'UNKNOWN' };
  }

  async getActiveAlarms(): Promise<ControllerAlarm[]> {
    return [];
  }

  subscribeToEvents(listener: ControllerEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async testConnection(): Promise<ConnectionTestResult> {
    const t = Date.now();
    const host = this.settings.host || '192.168.0.30';
    const rawPort = this.settings.port || 5900;
    const port = rawPort >= 5800 && rawPort < 5900 ? rawPort + 100 : rawPort;
    try {
      const banner = await new Promise<string>((resolve, reject) => {
        const s = net.connect({ host, port, timeout: 3500 }, () => {
          setTimeout(() => {
            s.destroy();
            resolve('Connected (TCP open)');
          }, 600);
        });
        s.once('data', (buf) => {
          const str = buf.toString('ascii').trim();
          s.destroy();
          resolve(str.startsWith('RFB ') ? `Siemens Sm@rtServer VNC Ready (${str})` : `Connected (${str.slice(0, 24)})`);
        });
        s.once('error', (e) => reject(new Error(`Cannot reach ${host}:${port} (${e.message})`)));
        s.once('timeout', () => {
          s.destroy();
          reject(new Error(`Timeout reaching ${host}:${port}`));
        });
      });
      return { ok: true, message: `${banner} @ ${host}:${port}`, latencyMs: Date.now() - t };
    } catch (e) {
      return { ok: false, message: (e as Error).message, latencyMs: null };
    }
  }

  private emit(e: ControllerEvent) {
    for (const l of this.listeners) {
      try {
        l(e);
      } catch {
        /* ignore */
      }
    }
  }
}
