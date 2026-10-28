import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://nmocuhzyplzgbvbqehim.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5tb2N1aHp5cGx6Z2J2YnFlaGltIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ5MDcxNzksImV4cCI6MjEwMDQ4MzE3OX0.9FCC-MB5oJ4KqZyBfrXh9qY88vCz5pslgzLwCeH5xbs';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testDriverQuery() {
  await supabase.auth.signInWithPassword({
    email: 'ramon@jackarlo.com',
    password: 'ramon123'
  });

  const { data: drivers } = await supabase.from('drivers').select('id, name, base_location');
  const guapiDrivers = drivers.filter(d => (d.base_location || '').toLowerCase() === 'guapimirim');
  const guapiIds = guapiDrivers.map(d => d.id);
  const tereDrivers = drivers.filter(d => (d.base_location || '').toLowerCase() === 'teresópolis');
  const tereIds = tereDrivers.map(d => d.id);

  console.log(`Drivers Guapi: ${guapiIds.length}, Drivers Tere: ${tereIds.length}`);

  // Teste 1: Buscar pacotes EM_ROTA de Guapimirim usando in(driver_id)
  console.log('\n--- TESTE 1: Guapimirim com in(driver_id) ---');
  const t0 = performance.now();
  let allPkgs = [];
  let from = 0;
  const pageSize = 1000;
  let hasMore = true;
  let page = 0;

  while (hasMore) {
    page++;
    const tPage0 = performance.now();
    const { data, error } = await supabase
      .from('packages')
      .select('barcode, driver_id, company_id, base_location, scanned_by')
      .eq('status', 'EM_ROTA')
      .in('driver_id', guapiIds)
      .range(from, from + pageSize - 1);

    const ms = (performance.now() - tPage0).toFixed(0);
    console.log(`  Página ${page}: ${data?.length || 0} registros em ${ms}ms`);
    if (error) {
      console.error(error);
      break;
    }
    if (data && data.length > 0) {
      allPkgs = allPkgs.concat(data);
      if (data.length < pageSize) hasMore = false;
      else from += pageSize;
    } else {
      hasMore = false;
    }
  }
  console.log(`=> TOTAL Guapimirim com in(driver_id): ${allPkgs.length} pacotes em ${(performance.now() - t0).toFixed(0)}ms!`);

  // Teste 2: Buscar pacotes EM_ROTA de Teresópolis usando in(driver_id)
  console.log('\n--- TESTE 2: Teresópolis com in(driver_id) ---');
  const tTere0 = performance.now();
  let terePkgs = [];
  from = 0;
  hasMore = true;
  page = 0;

  while (hasMore) {
    page++;
    const tPage0 = performance.now();
    const { data, error } = await supabase
      .from('packages')
      .select('barcode, driver_id, company_id, base_location, scanned_by')
      .eq('status', 'EM_ROTA')
      .in('driver_id', tereIds)
      .range(from, from + pageSize - 1);

    const ms = (performance.now() - tPage0).toFixed(0);
    console.log(`  Página ${page}: ${data?.length || 0} registros em ${ms}ms`);
    if (error) {
      console.error(error);
      break;
    }
    if (data && data.length > 0) {
      terePkgs = terePkgs.concat(data);
      if (data.length < pageSize) hasMore = false;
      else from += pageSize;
    } else {
      hasMore = false;
    }
  }
  console.log(`=> TOTAL Teresópolis com in(driver_id): ${terePkgs.length} pacotes em ${(performance.now() - tTere0).toFixed(0)}ms!`);

  // Teste 3: E se buscarmos em paralelo todas as páginas conhecidas? Ou com contagem inicial?
  // Se contarmos primeiro (count: exact, head: true):
  console.log('\n--- TESTE 3: Busca Paralela (Promise.all) ---');
  const tPar0 = performance.now();
  const { count: totalGuapi } = await supabase
    .from('packages')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'EM_ROTA')
    .in('driver_id', guapiIds);

  const numPages = Math.ceil(totalGuapi / pageSize);
  console.log(`Total a buscar: ${totalGuapi} em ${numPages} páginas em paralelo...`);
  
  const pagePromises = [];
  for (let p = 0; p < numPages; p++) {
    const pFrom = p * pageSize;
    pagePromises.push(
      supabase
        .from('packages')
        .select('barcode, driver_id, company_id, base_location, scanned_by')
        .eq('status', 'EM_ROTA')
        .in('driver_id', guapiIds)
        .range(pFrom, pFrom + pageSize - 1)
    );
  }
  const pagesResults = await Promise.all(pagePromises);
  const parallelPkgs = pagesResults.flatMap(r => r.data || []);
  console.log(`=> TOTAL com Busca Paralela: ${parallelPkgs.length} pacotes em ${(performance.now() - tPar0).toFixed(0)}ms!`);
}

testDriverQuery().catch(console.error);
