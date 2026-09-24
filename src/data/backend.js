import { createSupabaseBackend } from './supabaseBackend.js';
import { createDemoBackend } from './demoBackend.js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Zonder Supabase-configuratie draait de app in demo-modus (data in de browser).
export const backend = url && key ? createSupabaseBackend(url, key) : createDemoBackend();
