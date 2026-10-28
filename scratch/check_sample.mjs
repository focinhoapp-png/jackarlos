import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://nmocuhzyplzgbvbqehim.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5tb2N1aHp5cGx6Z2J2YnFlaGltIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ5MDcxNzksImV4cCI6MjEwMDQ4MzE3OX0.9FCC-MB5oJ4KqZyBfrXh9qY88vCz5pslgzLwCeH5xbs';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkSample() {
  await supabase.auth.signInWithPassword({
    email: 'ramon@jackarlo.com',
    password: 'ramon123'
  });

  // Pegar 20 pacotes EM_ROTA sem order
  const { data, error } = await supabase
    .from('packages')
    .select('id, barcode, scanned_at, status, driver_id, base_location')
    .eq('status', 'EM_ROTA')
    .limit(20);

  if (error) {
    console.error('Erro:', error);
    return;
  }

  console.log('Amostra de 20 pacotes EM_ROTA:');
  data.forEach(p => console.log(`ID: ${p.id} | Barcode: ${p.barcode} | ScannedAt: ${p.scanned_at} | CreatedAt: ${p.created_at} | Driver: ${p.driver_id} | Base: ${p.base_location}`));
}

checkSample().catch(console.error);
