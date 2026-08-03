import { supabase } from './src/lib/supabase';

async function check() {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: 'ramon@jackarlo.com',
    password: '123456'
  });
  console.log("Auth result:", data, error);
}

check();
