import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ugoywxoomzamwmvnjwbl.supabase.co';
const supabaseKey = 'sb_publishable_Ra1TU5ZBSCTRObftoqLaRA_CYTz6wIs';
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data, error } = await supabase.from('products').select('*').limit(1);
  if (error) {
    console.log('Error querying products:', error.message);
  } else {
    console.log('Products table exists! Data:', data);
  }
}

run();
