'use client';
import { useEffect } from 'react';

export default function TestEnv() {
  useEffect(() => {
    console.log('URL:', process.env.NEXT_PUBLIC_SUPABASE_URL);
    console.log('Anon Key:', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  }, []);

  return <div>Check console</div>;
}