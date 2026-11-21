import * as net from 'net';
import { Protocol } from '../../../common/enums';
import { ControllerError } from '../industrial-controller.interface';
import { IntegrationSettings, TagDefinition, TagKey } from '../integration-settings';
import { TagBasedController, TagIO } from './tag-based.controller';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const Modbus = require('jsmodbus');

/**
 * Modbus TCP adapter.
 * Tag address syntax:
 *   - `C:0`     -> Coil 0 (BOOL)
 *   - `DI:0`    -> Discrete Input 0 (BOOL, read-only)
 *   - `IR:10`   -> Input Register 10 (INT/WORD, read-only)
 *   - `HR:100`  -> Holding Register 100 (INT/WORD/DINT/DWORD)
 *   - `HR:100.3`-> Bit 3 of Holding Register 100 (BOOL)
 */
function parseModbusAddress(addr: string): { area: 'C' | 'DI' | 'IR' | 'HR'; offset: number; bit?: number } {
  const m = /^(C|DI|IR|HR):(\d+)(?:\.(\d+))?$/i.exec(addr.trim());
  if (!m) throw new ControllerError(`Invalid Modbus address "${addr}" (expected HR:100, C:0, IR:10, DI:0)`, 'NOT_CONFIGURED');
  return {
    area: m[1].toUpperCase() as 'C' | 'DI' | 'IR' | 'HR',
    offset: Number(m[2]),
    bit: m[3] !== undefined ? Number(m[3]) : undefined,
  };
}

export class ModbusTcpAdapter extends TagBasedController {
  readonly protocol = Protocol.MODBUS_TCP;

  constructor(settings: IntegrationSettings, writeEnabled: boolean) {
    super(settings, writeEnabled);
  }

  protected createIO(): TagIO {
    const host = this.settings.host;
    const port = this.settings.port ?? 502;
    const unitId = this.settings.modbusUnitId ?? 1;
    if (!host) throw new ControllerError('Modbus TCP host/IP is not configured', 'NOT_CONFIGURED');

    let socket: net.Socket | null = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let client: any = null;

    return {
      open: () =>
        new Promise<void>((resolve, reject) => {
          socket = new net.Socket();
          client = new Modbus.client.TCP(socket, unitId, 3000);
          const onErr = (err: Error) => {
            socket?.destroy();
            reject(new ControllerError(`Modbus TCP connection failed (${host}:${port}): ${err.message}`, 'NOT_CONNECTED'));
          };
          socket.once('error', onErr);
          socket.connect({ host, port }, () => {
            socket?.removeListener('error', onErr);
            resolve();
          });
        }),
      close: async () => {
        socket?.destroy();
        socket = null;
      },
      read: async (tags) => {
        const out: Partial<Record<TagKey, unknown>> = {};
        for (const [k, def] of Object.entries(tags) as Array<[TagKey, TagDefinition]>) {
          if (!def?.address) continue;
          const p = parseModbusAddress(def.address);
          if (p.area === 'C') {
            const r = await client.readCoils(p.offset, 1);
            out[k] = Boolean(r.response.body.valuesAsArray[0]);
          } else if (p.area === 'DI') {
            const r = await client.readDiscreteInputs(p.offset, 1);
            out[k] = Boolean(r.response.body.valuesAsArray[0]);
          } else if (p.area === 'IR') {
            const count = def.dataType === 'DINT' || def.dataType === 'DWORD' ? 2 : 1;
            const r = await client.readInputRegisters(p.offset, count);
            const regs: number[] = r.response.body.valuesAsArray;
            out[k] = count === 2 ? ((regs[0] << 16) | regs[1]) >>> 0 : regs[0];
          } else {
            const count = def.dataType === 'DINT' || def.dataType === 'DWORD' ? 2 : 1;
            const r = await client.readHoldingRegisters(p.offset, count);
            const regs: number[] = r.response.body.valuesAsArray;
            if (p.bit !== undefined) out[k] = Boolean(regs[0] & (1 << p.bit));
            else out[k] = count === 2 ? ((regs[0] << 16) | regs[1]) >>> 0 : regs[0];
          }
        }
        return out;
      },
      write: async (items) => {
        for (const it of items) {
          const p = parseModbusAddress(it.tag.address);
          if (p.area === 'C') {
            await client.writeSingleCoil(p.offset, Boolean(it.value));
          } else if (p.area === 'HR') {
            if (p.bit !== undefined) {
              const cur = await client.readHoldingRegisters(p.offset, 1);
              let word: number = cur.response.body.valuesAsArray[0];
              word = it.value ? word | (1 << p.bit) : word & ~(1 << p.bit);
              await client.writeSingleRegister(p.offset, word & 0xffff);
            } else if (it.tag.dataType === 'DINT' || it.tag.dataType === 'DWORD') {
              const n = Number(it.value) >>> 0;
              await client.writeMultipleRegisters(p.offset, [(n >>> 16) & 0xffff, n & 0xffff]);
            } else {
              await client.writeSingleRegister(p.offset, Number(it.value) & 0xffff);
            }
          } else {
            throw new ControllerError(`Modbus area ${p.area} is read-only`, 'WRITE_FAILED');
          }
        }
      },
    };
  }
}
