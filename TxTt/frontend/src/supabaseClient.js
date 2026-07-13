import { createClient } from '@supabase/supabase-js';

// Replace these with your actual Supabase project URL and Anon API key
const supabaseUrl = 'https://lbkhxcfcqtaimccpyuho.supabase.co';
const supabaseAnonKey = 'sb_publishable_CQHWkZrx3aEZQT88qQBwig_fsJpbc9f';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);