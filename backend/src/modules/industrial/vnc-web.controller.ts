import { Body, Controller, Get, HttpCode, Injectable, Logger, OnModuleDestroy, Post, Res } from '@nestjs/common';
import { execFileSync } from 'child_process';
import { Response } from 'express';
import * as net from 'net';
import { Public } from '../../common/decorators';

/**
 * Encrypts a 16-byte VNC challenge with the VNC password (bit-reversed 8-byte DES key in ECB mode).
 * Uses Windows .NET DESCryptoServiceProvider via a fast one-shot call so it works on Node 24 (OpenSSL 3) without legacy providers.
 */
function encryptVncChallengeDes(challenge: Buffer, password: string): Buffer {
  const chalHex = challenge.toString('hex');
  const pwB64 = Buffer.from(password || '', 'ascii').toString('base64');
  const psScript = `
    $chal = [byte[]]::new(16)
    for($i=0;$i -lt 16;$i++){ $chal[$i] = [Convert]::ToByte('${chalHex}'.Substring($i*2,2),16) }
    $pw = [System.Text.Encoding]::ASCII.GetBytes([System.Text.Encoding]::ASCII.GetString([Convert]::FromBase64String('${pwB64}')))
    $key = [byte[]]::new(8)
    for($i=0;$i -lt 8 -and $i -lt $pw.Length;$i++){
      $b = $pw[$i]; $r = 0
      for($bit=0;$bit -lt 8;$bit++){ if($b -band (1 -shl $bit)){ $r = $r -bor (1 -shl (7-$bit)) } }
      $key[$i] = [byte]$r
    }
    $des = [System.Security.Cryptography.DES]::Create()
    $des.Mode = [System.Security.Cryptography.CipherMode]::ECB
    $des.Padding = [System.Security.Cryptography.PaddingMode]::None
    $enc = $des.CreateEncryptor($key, [byte[]]::new(8))
    $out = [byte[]]::new(16)
    [void]$enc.TransformBlock($chal,0,8,$out,0)
    [void]$enc.TransformBlock($chal,8,8,$out,8)
    [BitConverter]::ToString($out).Replace('-','')
  `;
  const outHex = execFileSync('powershell.exe', ['-NoProfile', '-Command', psScript], {
    encoding: 'utf8',
    timeout: 4000,
  }).trim();
  return Buffer.from(outHex, 'hex');
}

@Injectable()
export class VncBridgeService implements OnModuleDestroy {
  private readonly logger = new Logger(VncBridgeService.name);
  private socket: net.Socket | null = null;
  private connected = false;
  private host = '192.168.0.30';
  private port = 5900;
  private serverName = 'Siemens Sm@rtServer';
  private serverVersion = '';
  private width = 480;
  private height = 272;
  private fb: Buffer = Buffer.alloc(480 * 272 * 4);
  private lastError: string | null = null;
  private pollTimer: NodeJS.Timeout | null = null;

  onModuleDestroy() {
    this.disconnect();
  }

  getStatus() {
    return {
      connected: this.connected,
      host: this.host,
      port: this.port,
      serverName: this.serverName,
      serverVersion: this.serverVersion,
      width: this.width,
      height: this.height,
      lastError: this.lastError,
    };
  }

  disconnect() {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = null;
    this.connected = false;
    this.socket?.destroy();
    this.socket = null;
  }

  async connect(rawHost: string, rawPort: number | undefined, password: string): Promise<ReturnType<VncBridgeService['getStatus']>> {
    this.disconnect();
    this.lastError = null;

    let h = (rawHost || '192.168.0.30').trim().replace(/^vnc:\/\//i, '').replace(/^http:\/\//i, '');
    let p = rawPort || 5900;
    if (h.includes(':')) {
      const idx = h.lastIndexOf(':');
      const hp = h.slice(0, idx).trim();
      const pp = Number(h.slice(idx + 1).trim());
      if (hp) h = hp;
      if (Number.isFinite(pp) && pp > 0) p = pp;
    }
    // Map Siemens HTTP Java-applet port 5800 -> RFB VNC port 5900
    if (p >= 5800 && p < 5900) p += 100;
    this.host = h;
    this.port = p;

    await new Promise<void>((resolve, reject) => {
      const sock = net.connect({ host: this.host, port: this.port, timeout: 4000 });
      this.socket = sock;
      let rx = Buffer.alloc(0);
      let stage: 'VERSION' | 'SECTYPES' | 'CHALLENGE' | 'AUTHRES' | 'SERVERINIT' | 'STREAM' = 'VERSION';
      let use33 = false;

      const fail = (msg: string) => {
        this.lastError = msg;
        this.disconnect();
        reject(new Error(msg));
      };

      sock.once('error', (e) => fail(`VNC connection error (${this.host}:${this.port}): ${e.message}`));
      sock.once('timeout', () => fail(`VNC timeout (${this.host}:${this.port})`));
      sock.on('close', () => {
        this.connected = false;
      });

      const processBuffer = () => {
        while (true) {
          if (stage === 'VERSION') {
            if (rx.length < 12) return;
            const verStr = rx.subarray(0, 12).toString('ascii');
            rx = rx.subarray(12);
            this.serverVersion = verStr.trim();
            if (!verStr.startsWith('RFB ')) return fail(`Invalid RFB banner: ${this.serverVersion}`);
            use33 = verStr.includes('003.003') || verStr.includes('003.889');
            sock.write(use33 ? 'RFB 003.003\n' : 'RFB 003.008\n', 'ascii');
            stage = 'SECTYPES';
          } else if (stage === 'SECTYPES') {
            if (use33) {
              if (rx.length < 4) return;
              const st = rx.readInt32BE(0);
              rx = rx.subarray(4);
              if (st === 1) {
                sock.write(Buffer.from([1])); // ClientInit shared=1
                stage = 'SERVERINIT';
              } else if (st === 2) {
                stage = 'CHALLENGE';
              } else {
                return fail(`VNC server rejected connection (type=${st})`);
              }
            } else {
              if (rx.length < 1) return;
              const count = rx[0];
              if (count === 0) return fail('VNC server returned 0 security types');
              if (rx.length < 1 + count) return;
              const types = [...rx.subarray(1, 1 + count)];
              rx = rx.subarray(1 + count);
              const chosen = types.includes(1) ? 1 : types.includes(2) ? 2 : types[0];
              sock.write(Buffer.from([chosen]));
              if (chosen === 2) stage = 'CHALLENGE';
              else if (chosen === 1) stage = 'AUTHRES';
              else return fail(`Unsupported VNC security type ${chosen}`);
            }
          } else if (stage === 'CHALLENGE') {
            if (rx.length < 16) return;
            const chal = rx.subarray(0, 16);
            rx = rx.subarray(16);
            const resp = encryptVncChallengeDes(chal, password);
            sock.write(resp);
            stage = 'AUTHRES';
          } else if (stage === 'AUTHRES') {
            if (rx.length < 4) return;
            const res = rx.readInt32BE(0);
            rx = rx.subarray(4);
            if (res !== 0) return fail('Invalid VNC Password (Sm@rtServer rejected authentication)');
            sock.write(Buffer.from([1])); // ClientInit: shared = 1
            stage = 'SERVERINIT';
          } else if (stage === 'SERVERINIT') {
            if (rx.length < 24) return;
            const w = rx.readUInt16BE(0);
            const h = rx.readUInt16BE(2);
            const nameLen = rx.readInt32BE(20);
            if (rx.length < 24 + nameLen) return;
            this.width = w || 480;
            this.height = h || 272;
            this.serverName = rx.subarray(24, 24 + nameLen).toString('utf8');
            rx = rx.subarray(24 + nameLen);
            this.fb = Buffer.alloc(this.width * this.height * 4, 0);

            // SetPixelFormat: 32bpp, depth 24, little-endian, true-color, R=255@16, G=255@8, B=255@0
            const pf = Buffer.alloc(20, 0);
            pf[0] = 0; pf[4] = 32; pf[5] = 24; pf[6] = 0; pf[7] = 1;
            pf.writeUInt16BE(255, 8); pf.writeUInt16BE(255, 10); pf.writeUInt16BE(255, 12);
            pf[14] = 16; pf[15] = 8; pf[16] = 0;
            sock.write(pf);

            // SetEncodings: Raw (0) only for rock-solid decoding
            const enc = Buffer.from([2, 0, 0, 1, 0, 0, 0, 0]);
            sock.write(enc);

            this.connected = true;
            stage = 'STREAM';
            this.requestUpdate(false);
            this.pollTimer = setInterval(() => this.requestUpdate(true), 120);
            this.pollTimer.unref?.();
            resolve();
          } else if (stage === 'STREAM') {
            if (rx.length < 1) return;
            const msgType = rx[0];
            if (msgType === 0) {
              if (rx.length < 4) return;
              const nRects = rx.readUInt16BE(2);
              let off = 4;
              for (let i = 0; i < nRects; i++) {
                if (rx.length < off + 12) return;
                const rxPos = rx.readUInt16BE(off);
                const ryPos = rx.readUInt16BE(off + 2);
                const rw = rx.readUInt16BE(off + 4);
                const rh = rx.readUInt16BE(off + 6);
                const enc = rx.readInt32BE(off + 8);
                off += 12;
                if (enc === 0) {
                  const byteLen = rw * rh * 4;
                  if (rx.length < off + byteLen) return;
                  for (let row = 0; row < rh; row++) {
                    if (ryPos + row >= this.height) break;
                    const srcStart = off + row * rw * 4;
                    const dstStart = ((ryPos + row) * this.width + rxPos) * 4;
                    const copyBytes = Math.min(rw * 4, (this.width - rxPos) * 4);
                    if (copyBytes > 0) {
                      rx.copy(this.fb, dstStart, srcStart, srcStart + copyBytes);
                    }
                  }
                  off += byteLen;
                } else {
                  return;
                }
              }
              rx = rx.subarray(off);
            } else if (msgType === 2) {
              rx = rx.subarray(1);
            } else if (msgType === 3) {
              if (rx.length < 8) return;
              const len = rx.readInt32BE(4);
              if (rx.length < 8 + len) return;
              rx = rx.subarray(8 + len);
            } else {
              rx = rx.subarray(1);
            }
          }
        }
      };

      sock.on('data', (chunk: Buffer) => {
        rx = Buffer.concat([rx, chunk]);
        try {
          processBuffer();
        } catch (err) {
          this.logger.warn(`VNC stream error: ${(err as Error).message}`);
        }
      });
    });

    return this.getStatus();
  }

  requestUpdate(incremental: boolean) {
    if (!this.connected || !this.socket) return;
    const req = Buffer.alloc(10);
    req[0] = 3;
    req[1] = incremental ? 1 : 0;
    req.writeUInt16BE(0, 2);
    req.writeUInt16BE(0, 4);
    req.writeUInt16BE(this.width, 6);
    req.writeUInt16BE(this.height, 8);
    this.socket.write(req);
  }

  static readonly SPOT_COORDS: Record<string, { x: number; y: number }> = {
    L11: { x: 96, y: 84 },
    L12: { x: 96, y: 136 },
    L13: { x: 96, y: 186 },
    L21: { x: 202, y: 84 },
    L22: { x: 202, y: 136 },
    L23: { x: 202, y: 186 },
    L31: { x: 313, y: 84 },
    L32: { x: 313, y: 136 },
    L33: { x: 313, y: 186 },
    L41: { x: 424, y: 84 },
    L42: { x: 424, y: 136 },
    L43: { x: 424, y: 186 },
    ADMIN: { x: 235, y: 247 },
    ALARMS: { x: 23, y: 112 },
  };

  sendPointer(x: number, y: number, mask: number) {
    if (!this.connected || !this.socket) return;
    const cx = Math.max(0, Math.min(this.width - 1, Math.round(x)));
    const cy = Math.max(0, Math.min(this.height - 1, Math.round(y)));
    const msg = Buffer.alloc(6);
    msg[0] = 5;
    msg[1] = mask & 0xff;
    msg.writeUInt16BE(cx, 2);
    msg.writeUInt16BE(cy, 4);
    this.socket.write(msg);
  }

  async tapSpot(spotOrCoord: string): Promise<{ ok: boolean; x: number; y: number }> {
    let coords = VncBridgeService.SPOT_COORDS[spotOrCoord.toUpperCase()];
    if (!coords && spotOrCoord.includes(',')) {
      const [xs, ys] = spotOrCoord.split(',');
      const x = Number(xs);
      const y = Number(ys);
      if (Number.isFinite(x) && Number.isFinite(y)) coords = { x, y };
    }
    if (!coords) throw new Error(`Unknown HMI spot code: ${spotOrCoord}`);
    this.sendPointer(coords.x, coords.y, 1);
    await new Promise((r) => setTimeout(r, 150));
    this.sendPointer(coords.x, coords.y, 0);
    this.requestUpdate(false);
    return { ok: true, x: coords.x, y: coords.y };
  }

  /** Encodes current 32-bpp framebuffer as a standard 24-bit BMP image for zero-dependency browser rendering. */
  buildBmpBuffer(): Buffer {
    const w = this.width;
    const h = this.height;
    const rowStride = (w * 3 + 3) & ~3;
    const pixelDataSize = rowStride * h;
    const fileSize = 54 + pixelDataSize;
    const bmp = Buffer.alloc(fileSize, 0);

    bmp.write('BM', 0, 'ascii');
    bmp.writeUInt32LE(fileSize, 2);
    bmp.writeUInt32LE(54, 10);
    bmp.writeUInt32LE(40, 14);
    bmp.writeInt32LE(w, 18);
    bmp.writeInt32LE(-h, 22); // top-down BMP
    bmp.writeUInt16LE(1, 26);
    bmp.writeUInt16LE(24, 28);
    bmp.writeUInt32LE(pixelDataSize, 34);

    for (let y = 0; y < h; y++) {
      const dstRow = 54 + y * rowStride;
      const srcRow = y * w * 4;
      for (let x = 0; x < w; x++) {
        const s = srcRow + x * 4;
        const d = dstRow + x * 3;
        bmp[d] = this.fb[s];         // B
        bmp[d + 1] = this.fb[s + 1]; // G
        bmp[d + 2] = this.fb[s + 2]; // R
      }
    }
    return bmp;
  }
}

@Controller('industrial/vnc')
export class VncWebController {
  constructor(private readonly vnc: VncBridgeService) {}

  @Public()
  @Get('status')
  status() {
    return this.vnc.getStatus();
  }

  @Public()
  @Post('connect')
  @HttpCode(200)
  connect(@Body() body: { host?: string; port?: number; password?: string }) {
    return this.vnc.connect(body.host || '192.168.0.30', body.port || 5900, body.password || '');
  }

  @Public()
  @Post('pointer')
  @HttpCode(204)
  pointer(@Body() body: { x: number; y: number; mask: number }) {
    this.vnc.sendPointer(body.x, body.y, body.mask);
  }

  @Public()
  @Post('tap')
  @HttpCode(200)
  tap(@Body() body: { spot: string }) {
    return this.vnc.tapSpot(body.spot);
  }

  @Public()
  @Get('frame.bmp')
  frame(@Res() res: Response) {
    res.setHeader('Content-Type', 'image/bmp');
    res.setHeader('Cache-Control', 'no-store');
    res.send(this.vnc.buildBmpBuffer());
  }

  @Public()
  @Get('view')
  viewPage(@Res() res: Response) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(`<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no" />
  <title>Auto Park — تطبيق التحكم المباشر بالماكنة (S7-1200 + HMI)</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; font-family: 'Segoe UI', Tahoma, sans-serif; background: #070d19; color: #e2e8f0; min-height: 100vh; }
    header { background: #0f172a; border-bottom: 1px solid #1e293b; padding: 12px 18px; display: flex; flex-wrap: wrap; gap: 10px; align-items: center; justify-content: space-between; }
    .controls { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
    input, button, select { padding: 8px 12px; border-radius: 8px; border: 1px solid #334155; background: #09101d; color: #f8fafc; font-size: 13.5px; }
    button { background: #0ea5e9; border: none; font-weight: 700; cursor: pointer; transition: 0.15s; }
    button:hover { background: #0284c7; transform: translateY(-1px); }
    button:active { transform: translateY(0); }
    .grid-layout { display: grid; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); gap: 14px; padding: 14px; }
    .card { background: #0f172a; border: 1px solid #1e293b; border-radius: 14px; padding: 14px; box-shadow: 0 12px 30px rgba(0,0,0,0.35); }
    .card-title { font-weight: 800; font-size: 14.5px; color: #38bdf8; margin-bottom: 10px; display: flex; align-items: center; justify-content: space-between; }
    .spot-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; direction: ltr; }
    .spot-btn { background: linear-gradient(145deg, #1e293b, #0f172a); border: 2px solid #334155; color: #f8fafc; padding: 14px 6px; border-radius: 10px; font-size: 15px; font-weight: 800; text-align: center; cursor: pointer; }
    .spot-btn:hover, .spot-btn.active { border-color: #38bdf8; background: #0c4a6e; box-shadow: 0 0 14px rgba(56,189,248,0.35); }
    .spot-btn small { display: block; font-size: 11px; color: #94a3b8; font-weight: 600; margin-top: 2px; }
    .lane-headers { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; direction: ltr; text-align: center; font-size: 12px; font-weight: 800; color: #facc15; margin-top: 6px; }
    .io-grid { display: grid; grid-template-columns: repeat(8, 1fr); gap: 5px; direction: ltr; margin-bottom: 8px; }
    .led { padding: 5px 2px; border-radius: 6px; font-size: 11px; font-weight: 700; text-align: center; background: #1e293b; color: #64748b; border: 1px solid #334155; }
    .led.on-in { background: rgba(34,197,94,0.2); color: #4ade80; border-color: #22c55e; box-shadow: 0 0 8px rgba(34,197,94,0.3); }
    .led.on-out { background: rgba(245,158,11,0.22); color: #fbbf24; border-color: #f59e0b; box-shadow: 0 0 8px rgba(245,158,11,0.3); }
    #screenWrap { border: 2px solid #1e293b; border-radius: 10px; overflow: hidden; background: #020617; text-align: center; }
    #screen { display: block; width: 100%; height: auto; cursor: crosshair; touch-action: none; }
    .kv { display: flex; flex-wrap: wrap; gap: 6px; direction: ltr; font-family: Consolas, monospace; font-size: 12px; }
    .kv span { background: #1e293b; padding: 4px 8px; border-radius: 6px; border: 1px solid #334155; }
    .changes-box { max-height: 110px; overflow-y: auto; font-family: Consolas, monospace; font-size: 11.5px; background: #070d19; padding: 8px; border-radius: 8px; border: 1px solid #1e293b; direction: ltr; }
  </style>
</head>
<body>
  <header>
    <div>
      <strong>🎛️ تطبيق التحكم المباشر بالماكنة — TECHNO Electrical.Jo (SIMATIC S7-1200 + HMI)</strong>
      <div id="status" style="font-size:12.5px;color:#4ade80;font-weight:700">🟢 متصل بـ SIMATIC S7-1200 (192.168.0.27:102)</div>
    </div>
    <div class="controls">
      <input id="host" value="192.168.0.30:5900" placeholder="192.168.0.30:5900" dir="ltr" style="width:150px" />
      <input id="pass" type="password" placeholder="كلمة مرور VNC (إن وجدت)" dir="ltr" style="width:165px" />
      <button onclick="connectVnc()">🔌 ربط شاشة VNC</button>
    </div>
  </header>

  <div class="grid-layout">
    <!-- 1. Direct 12-Spot Selection Touch Pad (Matches TECHNO Electrical.Jo HMI) -->
    <div class="card">
      <div class="card-title">
        <span>🕹️ لوحة اختيار المصفات المباشرة (Spot Selection — 12 مصف)</span>
        <span id="lastSpotBadge" style="font-size:12px;color:#facc15">اختر مصفاً للتحكم</span>
      </div>
      <div class="spot-grid">
        <div class="spot-btn" id="btn-L11" onclick="controlSpot('L11')">L11<small>P1 · Lane 1</small></div>
        <div class="spot-btn" id="btn-L21" onclick="controlSpot('L21')">L21<small>P1 · Lane 2</small></div>
        <div class="spot-btn" id="btn-L31" onclick="controlSpot('L31')">L31<small>P1 · Lane 3</small></div>
        <div class="spot-btn" id="btn-L41" onclick="controlSpot('L41')">L41<small>P1 · Lane 4</small></div>

        <div class="spot-btn" id="btn-L12" onclick="controlSpot('L12')">L12<small>P2 · Lane 1</small></div>
        <div class="spot-btn" id="btn-L22" onclick="controlSpot('L22')">L22<small>P2 · Lane 2</small></div>
        <div class="spot-btn" id="btn-L32" onclick="controlSpot('L32')">L32<small>P2 · Lane 3</small></div>
        <div class="spot-btn" id="btn-L42" onclick="controlSpot('L42')">L42<small>P2 · Lane 4</small></div>

        <div class="spot-btn" id="btn-L13" onclick="controlSpot('L13')">L13<small>P3 · Lane 1</small></div>
        <div class="spot-btn" id="btn-L23" onclick="controlSpot('L23')">L23<small>P3 · Lane 2</small></div>
        <div class="spot-btn" id="btn-L33" onclick="controlSpot('L33')">L33<small>P3 · Lane 3</small></div>
        <div class="spot-btn" id="btn-L43" onclick="controlSpot('L43')">L43<small>P3 · Lane 4</small></div>
      </div>
      <div class="lane-headers">
        <span>Lane 1</span><span>Lane 2</span><span>Lane 3</span><span>Lane 4</span>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px">
        <button style="background:#f59e0b;color:#09101d" onclick="controlSpot('ALARMS')">⚠️ زر التنبيهات على الشاشة [3]</button>
        <button style="background:#3b82f6" onclick="controlSpot('ADMIN')">👤 زر Administrator</button>
      </div>

      <!-- Direct S7-1200 Tag Pulse / Write -->
      <div style="margin-top:14px;padding-top:12px;border-top:1px solid #1e293b">
        <div style="font-size:12.5px;font-weight:700;color:#94a3b8;margin-bottom:8px">⚡ إرسال أمر مباشر إلى SIMATIC S7-1200 (192.168.0.27:102):</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap" dir="ltr">
          <input id="plcTagAddr" value="DB1,X0.0" placeholder="M10.0 أو DB1,X0.0 أو MW10" style="flex:1;min-width:130px" />
          <button onclick="plcPulse()" style="background:#10b981">Pulse (نبضة 1←0)</button>
          <button onclick="plcWrite(true)" style="background:#0284c7">ON (1)</button>
          <button onclick="plcWrite(false)" style="background:#475569">OFF (0)</button>
        </div>
      </div>
    </div>

    <!-- 2. Live SIMATIC S7-1200 PLC Sensors, Outputs & Memory (192.168.0.27:102) -->
    <div class="card">
      <div class="card-title">
        <span>📡 قراءات الـ PLC الحية — SIMATIC S7-1200 (192.168.0.27:102)</span>
        <span id="plcHb" style="font-size:11.5px;color:#4ade80">متصل ●</span>
      </div>
      <div style="font-size:12px;color:#94a3b8;margin-bottom:4px">مداخل الحساسات الرقمية (Digital Inputs I0.0 .. I2.7):</div>
      <div id="inLeds" class="io-grid"></div>
      <div style="font-size:12px;color:#94a3b8;margin-bottom:4px">المخارج الرقمية للمحركات/الكونتاكتورات (Digital Outputs Q0.0 .. Q2.7):</div>
      <div id="outLeds" class="io-grid"></div>
      <div style="font-size:12px;color:#94a3b8;margin:8px 0 4px">الذاكرة وبلوكات البيانات (Merkers & Data Blocks DB1 / DB2):</div>
      <div id="plcKv" class="kv"></div>
      <div style="font-size:12px;color:#38bdf8;margin:10px 0 4px;font-weight:700">🔍 كاشف تغير إشارات الـ S7-1200 اللحظي (Tag Change Sniffer):</div>
      <div id="plcChanges" class="changes-box">لا توجد تغيرات مسجلة بعد — اضغط أي زر على الشاشة لرؤية عنوان الـ Tag الذي يتغير في الـ PLC!</div>
    </div>

    <!-- 3. Live Siemens KTP400 Basic VNC Screen (192.168.0.30:5900) -->
    <div class="card">
      <div class="card-title">
        <span>🖥️ شاشة الـ HMI الحية (Siemens KTP400 — 192.168.0.30:5900)</span>
        <span id="vncBadge" style="font-size:11.5px;color:#94a3b8">بانتظار ربط VNC</span>
      </div>
      <div id="screenWrap">
        <img id="screen" src="/api/v1/industrial/vnc/frame.bmp" alt="Siemens HMI Screen" />
      </div>
    </div>
  </div>

  <script>
    let connected = false, fbW = 480, fbH = 272, mask = 0;
    const img = document.getElementById('screen');
    const st = document.getElementById('status');

    async function connectVnc() {
      st.style.color = '#facc15';
      st.textContent = '⏳ جاري ربط شاشة VNC على ' + document.getElementById('host').value + '...';
      try {
        const res = await fetch('/api/v1/industrial/vnc/connect', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            host: document.getElementById('host').value,
            password: document.getElementById('pass').value
          })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'فشل اتصال VNC');
        connected = data.connected;
        fbW = data.width || 480;
        fbH = data.height || 272;
        document.getElementById('vncBadge').style.color = '#4ade80';
        document.getElementById('vncBadge').textContent = '🟢 بث حي (' + fbW + 'x' + fbH + ')';
        st.style.color = '#4ade80';
        st.textContent = '🟢 متصل بالـ S7-1200 (192.168.0.27:102) وبشاشة الـ HMI (192.168.0.30:5900)';
      } catch (e) {
        st.style.color = '#f87171';
        st.textContent = '❌ VNC: ' + e.message;
      }
    }

    async function controlSpot(spot) {
      document.querySelectorAll('.spot-btn').forEach(b => b.classList.remove('active'));
      const btn = document.getElementById('btn-' + spot);
      if (btn) btn.classList.add('active');
      document.getElementById('lastSpotBadge').textContent = 'جاري إرسال الأمر للمصف ' + spot + '...';

      if (connected) {
        const res = await fetch('/api/v1/industrial/vnc/tap', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ spot })
        });
        if (res.ok) {
          const d = await res.json();
          document.getElementById('lastSpotBadge').textContent = '🟢 تم اختيار ' + spot + ' على الشاشة (' + d.x + ',' + d.y + ')';
        }
      } else {
        document.getElementById('lastSpotBadge').textContent = '⚡ تم اختيار ' + spot + ' (اربط VNC أعلاه للضغط على الشاشة)';
      }
    }

    async function plcPulse() {
      const address = document.getElementById('plcTagAddr').value.trim();
      const res = await fetch('/api/v1/industrial/s7/write', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, value: true, pulseMs: 350 })
      });
      const d = await res.json();
      st.textContent = d.ok ? ('🟢 تم إرسال نبضة إلى S7-1200: ' + address) : ('❌ ' + (d.message || 'خطأ'));
    }

    async function plcWrite(val) {
      const address = document.getElementById('plcTagAddr').value.trim();
      const res = await fetch('/api/v1/industrial/s7/write', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, value: val })
      });
      const d = await res.json();
      st.textContent = d.ok ? ('🟢 تم كتابة ' + val + ' في S7-1200: ' + address) : ('❌ ' + (d.message || 'خطأ'));
    }

    async function pollS7Live() {
      try {
        const res = await fetch('/api/v1/industrial/s7/live');
        if (!res.ok) return;
        const d = await res.json();
        if (!d.connected) {
          document.getElementById('plcHb').style.color = '#f87171';
          document.getElementById('plcHb').textContent = 'غير متصل ○';
          return;
        }
        document.getElementById('plcHb').style.color = '#4ade80';
        document.getElementById('plcHb').textContent = 'متصل ● MB60=' + (d.merkers?.MB60 ?? '');

        if (d.inputs?.bits) {
          document.getElementById('inLeds').innerHTML = d.inputs.bits
            .map(b => '<div class="led ' + (b.on ? 'on-in' : '') + '">' + b.bit + '</div>').join('');
        }
        if (d.outputs?.bits) {
          document.getElementById('outLeds').innerHTML = d.outputs.bits
            .map(b => '<div class="led ' + (b.on ? 'on-out' : '') + '">' + b.bit + '</div>').join('');
        }
        const m = d.merkers || {};
        const db = d.dataBlocks || {};
        document.getElementById('plcKv').innerHTML = [
          'IB0=' + (d.inputs?.IB0 ?? 0),
          'IB2=' + (d.inputs?.IB2 ?? 0),
          'QB2=' + (d.outputs?.QB2 ?? 0),
          'MB3=' + (m.MB3 ?? 0),
          'MB7=' + (m.MB7 ?? 0),
          'MB9=' + (m.MB9 ?? 0),
          'MB13=' + (m.MB13 ?? 0),
          'MB60=' + (m.MB60 ?? 0),
          'MB450=' + (m.MB450 ?? 0),
          'DB1=[' + (db.DB1 || []).join(',') + ']',
          'DB2=[' + (db.DB2 || []).join(',') + ']'
        ].map(x => '<span>' + x + '</span>').join('');

        if (Array.isArray(d.recentChanges) && d.recentChanges.length > 0) {
          document.getElementById('plcChanges').innerHTML = d.recentChanges
            .slice(0, 12)
            .map(c => '<div>[' + c.time.slice(11, 19) + '] <b style="color:#38bdf8">' + c.tag + '</b>: ' + JSON.stringify(c.from) + ' → <b style="color:#4ade80">' + JSON.stringify(c.to) + '</b></div>')
            .join('');
        }
      } catch {}
    }

    setInterval(pollS7Live, 900);
    pollS7Live();

    setInterval(() => {
      if (connected) {
        img.src = '/api/v1/industrial/vnc/frame.bmp?t=' + Date.now();
      }
    }, 150);

    function coords(ev) {
      const r = img.getBoundingClientRect();
      const clientX = ev.touches ? ev.touches[0].clientX : ev.clientX;
      const clientY = ev.touches ? ev.touches[0].clientY : ev.clientY;
      return {
        x: Math.round(((clientX - r.left) / r.width) * fbW),
        y: Math.round(((clientY - r.top) / r.height) * fbH)
      };
    }
    function sendPtr(x, y, m) {
      if (!connected) return;
      fetch('/api/v1/industrial/vnc/pointer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ x, y, mask: m })
      });
    }
    img.addEventListener('mousedown', (e) => { e.preventDefault(); mask = 1; const c = coords(e); sendPtr(c.x, c.y, mask); });
    img.addEventListener('mousemove', (e) => { if (mask) { const c = coords(e); sendPtr(c.x, c.y, mask); } });
    window.addEventListener('mouseup', (e) => { if (mask) { mask = 0; const c = coords(e); sendPtr(c.x, c.y, 0); } });
    img.addEventListener('touchstart', (e) => { e.preventDefault(); const c = coords(e); sendPtr(c.x, c.y, 1); setTimeout(() => sendPtr(c.x, c.y, 0), 120); });
  </script>
</body>
</html>`);
  }
}
