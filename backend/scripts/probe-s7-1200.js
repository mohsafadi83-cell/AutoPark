const nodes7 = require('nodes7');

function connectS7(host) {
  return new Promise((resolve, reject) => {
    const conn = new nodes7({ silent: true });
    conn.initiateConnection({ host, port: 102, rack: 0, slot: 1, timeout: 3000 }, (err) => {
      if (err) return reject(err);
      resolve(conn);
    });
  });
}

function readTag(conn, tag) {
  return new Promise((resolve) => {
    conn.addItems([tag]);
    conn.readAllItems((err, values) => {
      conn.removeItems([tag]);
      if (err) return resolve(null);
      resolve(values[tag]);
    });
  });
}

(async () => {
  const host = '192.168.0.27';
  const conn = await connectS7(host);
  console.log('=== Connected to SIMATIC S7-1200 at 192.168.0.27 (Rack 0, Slot 1) ===');

  const ib = await readTag(conn, 'IB0.16');
  const qb = await readTag(conn, 'QB0.16');
  const mb0 = await readTag(conn, 'MB0.100');
  const mb100 = await readTag(conn, 'MB100.100');
  console.log('Inputs  IB0..15 :', ib);
  console.log('Outputs QB0..15 :', qb);
  console.log('Non-zero Merker bytes MB0..199:');
  if (Array.isArray(mb0)) {
    mb0.forEach((v, i) => { if (v !== 0) console.log(`  MB${i} = ${v} (0x${v.toString(16).padStart(2,'0')})`); });
  }
  if (Array.isArray(mb100)) {
    mb100.forEach((v, i) => { if (v !== 0) console.log(`  MB${100+i} = ${v} (0x${v.toString(16).padStart(2,'0')})`); });
  }

  console.log('\nScanning Data Blocks DB1..DB60 (non-optimized):');
  for (let db = 1; db <= 60; db++) {
    const val = await readTag(conn, `DB${db},B0.4`);
    if (val !== null && val !== undefined) {
      const full = await readTag(conn, `DB${db},B0.32`);
      console.log(`  ✅ DB${db} accessible:`, full || val);
    }
  }
  conn.dropConnection(() => process.exit(0));
})();
