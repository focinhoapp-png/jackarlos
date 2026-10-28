import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://nmocuhzyplzgbvbqehim.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5tb2N1aHp5cGx6Z2J2YnFlaGltIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ5MDcxNzksImV4cCI6MjEwMDQ4MzE3OX0.9FCC-MB5oJ4KqZyBfrXh9qY88vCz5pslgzLwCeH5xbs';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testComparisons() {
  await supabase.auth.signInWithPassword({
    email: 'ramon@jackarlo.com',
    password: 'ramon123'
  });

  const { data: drivers } = await supabase.from('drivers').select('id, name, base_location');
  const guapiDrivers = drivers.filter(d => (d.base_location || '').toLowerCase() === 'guapimirim');
  const guapiDriverIds = guapiDrivers.map(d => d.id);

  console.log('=== TESTE COMPARATIVO DE CONSULTAS ===\n');

  // Método 1: Atual ScannerPanel (.ilike('base_location', 'Guapimirim'))
  console.log('--- Método 1: .ilike("base_location", "Guapimirim") ---');
  for (let i = 0; i < 4; i++) {
    const t0 = performance.now();
    const { data } = await supabase
      .from('packages')
      .select('barcode, driver_id, company_id, base_location, scanned_by')
      .eq('status', 'EM_ROTA')
      .ilike('base_location', 'Guapimirim')
      .range(i * 1000, i * 1000 + 999);
    console.log(`  Page ${i + 1} (${i * 1000}-${i * 1000 + 999}): ${data?.length} rows in ${(performance.now() - t0).toFixed(0)}ms`);
  }

  // Método 2: .eq('base_location', 'Guapimirim') (exato)
  console.log('\n--- Método 2: .eq("base_location", "Guapimirim") ---');
  for (let i = 0; i < 4; i++) {
    const t0 = performance.now();
    const { data } = await supabase
      .from('packages')
      .select('barcode, driver_id, company_id, base_location, scanned_by')
      .eq('status', 'EM_ROTA')
      .eq('base_location', 'Guapimirim')
      .range(i * 1000, i * 1000 + 999);
    console.log(`  Page ${i + 1} (${i * 1000}-${i * 1000 + 999}): ${data?.length} rows in ${(performance.now() - t0).toFixed(0)}ms`);
  }

  // Método 3: .in('driver_id', guapiDriverIds)
  console.log('\n--- Método 3: .in("driver_id", guapiDriverIds) ---');
  for (let i = 0; i < 4; i++) {
    const t0 = performance.now();
    const { data } = await supabase
      .from('packages')
      .select('barcode, driver_id, company_id, base_location, scanned_by')
      .eq('status', 'EM_ROTA')
      .in('driver_id', guapiDriverIds)
      .range(i * 1000, i * 1000 + 999);
    console.log(`  Page ${i + 1} (${i * 1000}-${i * 1000 + 999}): ${data?.length} rows in ${(performance.now() - t0).toFixed(0)}ms`);
  }

  // Método 4: Apenas .eq('status', 'EM_ROTA') e filtrar base em memória
  console.log('\n--- Método 4: Apenas .eq("status", "EM_ROTA") sem filtro de base no banco ---');
  for (let i = 0; i < 6; i++) {
    const t0 = performance.now();
    const { data } = await supabase
      .from('packages')
      .select('barcode, driver_id, company_id, base_location, scanned_by')
      .eq('status', 'EM_ROTA')
      .range(i * 1000, i * 1000 + 999);
    console.log(`  Page ${i + 1} (${i * 1000}-${i * 1000 + 999}): ${data?.length} rows in ${(performance.now() - t0).toFixed(0)}ms`);
    if (!data || data.length < 1000) break;
  }
}

testComparisons().catch(console.error);
