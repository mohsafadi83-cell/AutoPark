import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection, OnGatewayDisconnect, WebSocketGateway, WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Inject } from '@nestjs/common';
import { APP_CONFIG, AppConfig } from '../../config/app.config';
import { Role } from '../../common/enums';
import { isStaff } from '../../common/permissions';

interface SocketUser {
  sub: string;
  username: string;
  role: Role;
}

@WebSocketGateway({
  namespace: '/realtime',
  cors: { origin: true, credentials: true },
})
@Injectable()
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect, OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  server?: Server;

  private heartbeatTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly jwtService: JwtService,
    @Inject(APP_CONFIG) private readonly cfg: AppConfig,
  ) {}

  onModuleInit() {
    this.heartbeatTimer = setInterval(() => {
      this.emitToAll('heartbeat', { time: new Date().toISOString() });
    }, 10000);
    this.heartbeatTimer.unref?.();
  }

  onModuleDestroy() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
  }

  async handleConnection(client: Socket) {
    try {
      const rawToken =
        (client.handshake.auth?.token as string) ||
        (client.handshake.headers?.authorization?.replace(/^Bearer\s+/i, '') as string);
      if (!rawToken) throw new Error('Missing token');
      const payload = await this.jwtService.verifyAsync<SocketUser>(rawToken, {
        secret: this.cfg.auth.accessSecret,
      });
      client.data.user = payload;
      await client.join(`user:${payload.sub}`);
      if (isStaff(payload.role)) {
        await client.join('staff');
      }
    } catch {
      client.emit('auth.error', { message: 'Unauthorized WebSocket connection' });
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    void client;
  }

  emitToAll(event: string, payload: unknown) {
    this.server?.emit(event, payload);
  }

  emitToStaff(event: string, payload: unknown) {
    this.server?.to('staff').emit(event, payload);
  }

  emitToUserAndStaff(userId: string, event: string, payload: unknown) {
    this.server?.to(`user:${userId}`).to('staff').emit(event, payload);
  }

  emitToUser(userId: string, event: string, payload: unknown) {
    this.server?.to(`user:${userId}`).emit(event, payload);
  }
}
