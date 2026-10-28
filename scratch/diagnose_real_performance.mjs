import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://nmocuhzyplzgbvbqehim.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5tb2N1aHp5cGx6Z2J2YnFlaGltIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ5MDcxNzksImV4cCI6MjEwMDQ4MzE3OX0.9FCC-MB5oJ4KqZyBfrXh9qY88vCz5pslgzLwCeH5xbs';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function run() {
  console.log('=== AUTENTICANDO COMO RAMON (ADMIN) ===');
  const tAuth0 = performance.now();
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: 'ramon@jackarlo.com',
    password: 'ramon123'
  });
  if (authError) {
    console.error('Falha de autenticação:', authError);
    return;
  }
  console.log(`Autenticado em ${(performance.now() - tAuth0).toFixed(0)}ms como ${authData.user.email} (Role: ${authData.user.role})\n`);

  // 1. Metadados estruturais
  console.log('--- 1. MEDINDO CARGA DOS METADADOS (drivers, companies, bases) ---');
  const tMeta0 = performance.now();
  const [driversRes, companiesRes, basesRes] = await Promise.all([
    supabase.from('drivers').select('id, name, vehicle_type, vehicle_plate, base_location, bonus_per_delivery, status').order('name'),
    supabase.from('companies').select('id, name, value_per_delivery, logo_url').eq('status', true),
    supabase.from('bases').select('name').eq('status', true).order('name')
  ]);
  const metaMs = (performance.now() - tMeta0).toFixed(0);
  console.log(`Metadados carregados em ${metaMs}ms:`);
  console.log(`- Drivers: ${driversRes.data?.length} registros`);
  console.log(`- Companies: ${companiesRes.data?.length} registros`);
  console.log(`- Bases: ${basesRes.data?.length} registros`);
  
  const driversList = driversRes.data || [];
  const guapiDrivers = driversList.filter(d => (d.base_location || '').toLowerCase() === 'guapimirim');
  const tereDrivers = driversList.filter(d => (d.base_location || '').toLowerCase() === 'teresópolis');
  console.log(`  * Motoristas Guapimirim: ${guapiDrivers.length}`);
  console.log(`  * Motoristas Teresópolis: ${tereDrivers.length}\n`);

  // 2. Contagens gerais na tabela packages
  console.log('--- 2. CONTAGENS REAIS NO BANCO DE DADOS (tabela packages) ---');
  const tCountAll0 = performance.now();
  const { count: totalPackages, error: errAll } = await supabase
    .from('packages')
    .select('*', { count: 'exact', head: true });
  console.log(`Total geral de pacotes na tabela packages: ${totalPackages} (medido em ${(performance.now() - tCountAll0).toFixed(0)}ms)`);

  const tCountEmRota0 = performance.now();
  const { count: totalEmRota, error: errEmRota } = await supabase
    .from('packages')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'EM_ROTA');
  console.log(`Total de pacotes EM_ROTA em TODAS as bases: ${totalEmRota} (medido em ${(performance.now() - tCountEmRota0).toFixed(0)}ms)`);

  const tCountGuapi0 = performance.now();
  const { count: guapiEmRota } = await supabase
    .from('packages')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'EM_ROTA')
    .ilike('base_location', 'Guapimirim');
  console.log(`Total pacotes EM_ROTA em Guapimirim (ilike): ${guapiEmRota} (medido em ${(performance.now() - tCountGuapi0).toFixed(0)}ms)`);

  const tCountTere0 = performance.now();
  const { count: tereEmRota } = await supabase
    .from('packages')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'EM_ROTA')
    .ilike('base_location', 'Teresópolis');
  console.log(`Total pacotes EM_ROTA em Teresópolis (ilike): ${tereEmRota} (medido em ${(performance.now() - tCountTere0).toFixed(0)}ms)\n`);

  // 3. Medindo a consulta atual de fetchActivePackagesFromDb para Guapimirim
  console.log('--- 3. SIMULANDO A CONSULTA ATUAL DO SCANNERPANEL (Guapimirim) ---');
  const tGuapiFetch0 = performance.now();
  let allPkgsGuapi = [];
  let from = 0;
  const pageSize = 1000;
  let hasMore = true;
  let pageCount = 0;

  while (hasMore) {
    pageCount++;
    const tPage0 = performance.now();
    const { data, error } = await supabase
      .from('packages')
      .select('barcode, driver_id, company_id, base_location, scanned_by')
      .eq('status', 'EM_ROTA')
      .ilike('base_location', 'Guapimirim')
      .range(from, from + pageSize - 1);

    const pageMs = (performance.now() - tPage0).toFixed(0);
    console.log(`  Página ${pageCount} (range ${from}-${from + pageSize - 1}): ${data?.length || 0} registros em ${pageMs}ms`);
    if (error) {
      console.error('Erro:', error);
      break;
    }
    if (data && data.length > 0) {
      allPkgsGuapi = allPkgsGuapi.concat(data);
      if (data.length < pageSize) hasMore = false;
      else from += pageSize;
    } else {
      hasMore = false;
    }
  }
  const totalGuapiFetchMs = (performance.now() - tGuapiFetch0).toFixed(0);
  console.log(`=> Tempo total da busca sequencial Guapimirim: ${totalGuapiFetchMs}ms (${allPkgsGuapi.length} pacotes em ${pageCount} páginas)\n`);

  // 4. Analisando a distribuição por entregador dos pacotes retornados
  console.log('--- 4. DISTRIBUIÇÃO DOS PACOTES EM ROTA POR ENTREGADOR (Guapimirim) ---');
  const countByDriver = {};
  allPkgsGuapi.forEach(p => {
    countByDriver[p.driver_id] = (countByDriver[p.driver_id] || 0) + 1;
  });
  console.log(`Quantidade de entregadores com pacotes em rota: ${Object.keys(countByDriver).length}`);
  for (const [drvId, count] of Object.entries(countByDriver)) {
    const drv = driversList.find(d => String(d.id) === String(drvId));
    console.log(`  - Entregador: ${drv?.name || drvId} | Pacotes: ${count}`);
  }
  console.log('');

  // 5. Testando alternativas de performance
  console.log('--- 5. TESTANDO ALTERNATIVAS DE ALTA PERFORMANCE ---');
  
  // Teste A: Usando .eq('base_location', 'Guapimirim') em vez de .ilike
  console.log('Teste A: Usando .eq em vez de .ilike:');
  const tEq0 = performance.now();
  const { data: dataEq, error: errEq } = await supabase
    .from('packages')
    .select('barcode, driver_id, company_id, base_location, scanned_by')
    .eq('status', 'EM_ROTA')
    .eq('base_location', 'Guapimirim')
    .range(0, 999);
  console.log(`  .eq retornou ${dataEq?.length} registros em ${(performance.now() - tEq0).toFixed(0)}ms`);

  // Teste B: Buscando direto com IN (driver_ids de Guapimirim)
  console.log('Teste B: Buscando com .in("driver_id", guapiDriverIds):');
  const guapiIds = guapiDrivers.map(d => d.id);
  const tIn0 = performance.now();
  const { data: dataIn, error: errIn } = await supabase
    .from('packages')
    .select('barcode, driver_id, company_id, base_location, scanned_by')
    .eq('status', 'EM_ROTA')
    .in('driver_id', guapiIds)
    .range(0, 999);
  console.log(`  .in("driver_id") retornou ${dataIn?.length} registros em ${(performance.now() - tIn0).toFixed(0)}ms`);

  // Teste C: Verificar se há RPC existente ou se podemos buscar contagens agrupadas
  console.log('Teste C: Verificando pacotes em rota em Teresópolis:');
  const tTereFetch0 = performance.now();
  const { data: tereData } = await supabase
    .from('packages')
    .select('barcode, driver_id, company_id, base_location, scanned_by')
    .eq('status', 'EM_ROTA')
    .ilike('base_location', 'Teresópolis')
    .range(0, 999);
  console.log(`  Teresópolis retornou ${tereData?.length} registros em ${(performance.now() - tTereFetch0).toFixed(0)}ms`);
}

run().catch(console.error);
