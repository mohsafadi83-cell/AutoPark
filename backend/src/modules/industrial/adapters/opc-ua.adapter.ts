import * as net from 'net';
import { Protocol } from '../../../common/enums';
import { ControllerError } from '../industrial-controller.interface';
import { IntegrationSettings, TagDefinition, TagKey } from '../integration-settings';
import { TagBasedController, TagIO } from './tag-based.controller';

/**
 * OPC UA adapter (e.g. Siemens S7-1500 / S7-1200 built-in OPC UA server `opc.tcp://ip:4840`).
 *
 * Uses `node-opcua-client` if installed (`npm i node-opcua-client`), and also supports TCP endpoint
 * reachability probing when testing configuration before the full OPC UA certificate bundle is provisioned.
 */
export class OpcUaAdapter extends TagBasedController {
  readonly protocol = Protocol.OPC_UA;

  constructor(settings: IntegrationSettings, writeEnabled: boolean) {
    super(settings, writeEnabled);
  }

  protected createIO(): TagIO {
    const endpoint = this.settings.opcuaEndpoint;
    if (!endpoint || !endpoint.startsWith('opc.tcp://')) {
      throw new ControllerError('OPC UA endpoint must be configured (e.g. opc.tcp://192.168.0.1:4840)', 'NOT_CONFIGURED');
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let opcua: any = null;
    try {
      // Optional heavy dependency; loaded dynamically if present
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      opcua = require('node-opcua-client');
    } catch {
      opcua = null;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let client: any = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let session: any = null;

    return {
      open: async () => {
        if (!opcua) {
          // Verify TCP reachability first and explain clearly if driver package is not installed
          const u = new URL(endpoint.replace(/^opc\.tcp:/, 'http:'));
          await new Promise<void>((resolve, reject) => {
            const s = net.connect({ host: u.hostname, port: Number(u.port || 4840), timeout: 3000 }, () => {
              s.end();
              resolve();
            });
            s.on('error', (e) => reject(new ControllerError(`OPC UA endpoint unreachable: ${e.message}`, 'NOT_CONNECTED')));
            s.on('timeout', () => {
              s.destroy();
              reject(new ControllerError('OPC UA endpoint connection timeout', 'NOT_CONNECTED'));
            });
          });
          throw new ControllerError(
            'TCP endpoint reachable, but optional package "node-opcua-client" is not installed yet (run `npm i node-opcua-client` when OPC UA server is confirmed)',
            'DRIVER_MISSING',
          );
        }
        client = opcua.OPCUAClient.create({ endpointMustExist: false });
        await client.connect(endpoint);
        session = await client.createSession(
          this.settings.opcuaUsername
            ? { userName: this.settings.opcuaUsername, password: this.settings.opcuaPassword ?? '' }
            : undefined,
        );
      },
      close: async () => {
        try {
          if (session) await session.close();
          if (client) await client.disconnect();
        } catch {
          /* ignore */
        }
      },
      read: async (tags: Partial<Record<TagKey, TagDefinition>>) => {
        const entries = Object.entries(tags).filter(([, d]) => d?.address) as Array<[TagKey, TagDefinition]>;
        const nodes = entries.map(([, d]) => ({ nodeId: d.address, attributeId: opcua.AttributeIds.Value }));
        const dataValues = await session.read(nodes);
        const out: Partial<Record<TagKey, unknown>> = {};
        entries.forEach(([k], idx) => {
          out[k] = dataValues[idx]?.value?.value;
        });
        return out;
      },
      write: async (items) => {
        for (const it of items) {
          await session.write({
            nodeId: it.tag.address,
            attributeId: opcua.AttributeIds.Value,
            value: { value: { value: it.value } },
          });
        }
      },
    };
  }
}
