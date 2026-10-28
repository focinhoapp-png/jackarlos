import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://nmocuhzyplzgbvbqehim.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5tb2N1aHp5cGx6Z2J2YnFlaGltIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ5MDcxNzksImV4cCI6MjEwMDQ4MzE3OX0.9FCC-MB5oJ4KqZyBfrXh9qY88vCz5pslgzLwCeH5xbs';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testEquivalence() {
  await supabase.auth.signInWithPassword({
    email: 'ramon@jackarlo.com',
    password: 'ramon123'
  });

  const { data: drivers } = await supabase.from('drivers').select('id, name, base_location');
  const guapiDrivers = drivers.filter(d => (d.base_location || '').toLowerCase() === 'guapimirim');
  const tereDrivers = drivers.filter(d => (d.base_location || '').toLowerCase() === 'teresópolis');

  console.log('=== TESTE DE EQUIVALÊNCIA E PERFORMANCE ===\n');

  // Testando Guapimirim
  console.log('1. Guapimirim: buscando pacotes com a nova estratégia...');
  const tGuapi0 = performance.now();
  const guapiResults = await Promise.all(
    guapiDrivers.map(async (d) => {
      let driverPkgs = [];
      let from = 0;
      let hasMore = true;
      while (hasMore) {
        const { data, error } = await supabase
          .from('packages')
          .select('barcode, driver_id, company_id, base_location, scanned_by')
          .eq('status', 'EM_ROTA')
          .eq('driver_id', d.id)
          .range(from, from + 999);
        if (data && data.length > 0) {
          driverPkgs.push(...data);
          if (data.length < 1000) hasMore = false;
          else from += 1000;
        } else {
          hasMore = false;
        }
      }
      return driverPkgs;
    })
  );
  const guapiPkgs = guapiResults.flat();
  const guapiMs = (performance.now() - tGuapi0).toFixed(0);
  console.log(`=> Guapimirim: ${guapiPkgs.length} pacotes carregados em ${guapiMs}ms (esperado: 3641)`);

  // Testando Teresópolis
  console.log('\n2. Teresópolis: buscando pacotes com a nova estratégia...');
  const tTere0 = performance.now();
  const tereResults = await Promise.all(
    tereDrivers.map(async (d) => {
      let driverPkgs = [];
      let from = 0;
      let hasMore = true;
      while (hasMore) {
        const { data, error } = await supabase
          .from('packages')
          .select('barcode, driver_id, company_id, base_location, scanned_by')
          .eq('status', 'EM_ROTA')
          .eq('driver_id', d.id)
          .range(from, from + 999);
        if (data && data.length > 0) {
          driverPkgs.push(...data);
          if (data.length < 1000) hasMore = false;
          else from += 1000;
        } else {
          hasMore = false;
        }
      }
      return driverPkgs;
    })
  );
  const terePkgs = tereResults.flat();
  const tereMs = (performance.now() - tTere0).toFixed(0);
  console.log(`=> Teresópolis: ${terePkgs.length} pacotes carregados em ${tereMs}ms (esperado: 1439)`);

  // Verificando integridade dos barcodes (unicidade)
  const guapiBarcodes = new Set(guapiPkgs.map(p => p.barcode));
  console.log(`\nUnicidade barcodes Guapimirim: ${guapiBarcodes.size} de ${guapiPkgs.length}`);
  const tereBarcodes = new Set(terePkgs.map(p => p.barcode));
  console.log(`Unicidade barcodes Teresópolis: ${tereBarcodes.size} de ${terePkgs.length}`);
}

testEquivalence().catch(console.error);
