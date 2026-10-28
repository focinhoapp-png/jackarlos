import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://nmocuhzyplzgbvbqehim.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5tb2N1aHp5cGx6Z2J2YnFlaGltIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ5MDcxNzksImV4cCI6MjEwMDQ4MzE3OX0.9FCC-MB5oJ4KqZyBfrXh9qY88vCz5pslgzLwCeH5xbs';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function run() {
  await supabase.auth.signInWithPassword({
    email: 'ramon@jackarlo.com',
    password: 'ramon123'
  });

  console.log('=== INVESTIGANDO DATAS E STATUS DOS PACOTES EM_ROTA ===');
  
  // Amostra de pacotes EM_ROTA: menor e maior data
  const { data: oldest } = await supabase
    .from('packages')
    .select('id, barcode, scanned_at, created_at, status, driver_id, base_location')
    .eq('status', 'EM_ROTA')
    .order('scanned_at', { ascending: true })
    .limit(5);
  console.log('Pacotes EM_ROTA mais antigos:');
  console.log(oldest);

  const { data: newest } = await supabase
    .from('packages')
    .select('id, barcode, scanned_at, created_at, status, driver_id, base_location')
    .eq('status', 'EM_ROTA')
    .order('scanned_at', { ascending: false })
    .limit(5);
  console.log('Pacotes EM_ROTA mais recentes:');
  console.log(newest);

  // Verificando distribuição por data (ex: últimos 3 dias vs antes)
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
  const { count: recentCount } = await supabase
    .from('packages')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'EM_ROTA')
    .gte('scanned_at', threeDaysAgo);
  console.log(`Pacotes EM_ROTA nos últimos 3 dias: ${recentCount}`);

  const { count: oldBefore3Days } = await supabase
    .from('packages')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'EM_ROTA')
    .lt('scanned_at', threeDaysAgo);
  console.log(`Pacotes EM_ROTA com mais de 3 dias: ${oldBefore3Days}`);

  // Verificando compatibilidade entre driver_id e base_location
  const { data: drivers } = await supabase.from('drivers').select('id, name, base_location');
  const guapiDrivers = drivers.filter(d => (d.base_location || '').toLowerCase() === 'guapimirim');
  const guapiDriverIds = guapiDrivers.map(d => d.id);

  const { count: countByBaseLocation } = await supabase
    .from('packages')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'EM_ROTA')
    .ilike('base_location', 'Guapimirim');

  const { count: countByDriverIds } = await supabase
    .from('packages')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'EM_ROTA')
    .in('driver_id', guapiDriverIds);

  console.log(`Guapimirim por base_location: ${countByBaseLocation}`);
  console.log(`Guapimirim por driver_id dos motoristas de Guapimirim: ${countByDriverIds}`);
}

run().catch(console.error);
