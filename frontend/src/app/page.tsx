'use client';
import { useState } from 'react';

export default function Login() {
  const [username, setUsername] = useState('');

  const handleStart = async () => {
    const res = await fetch('/api/auth/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username }),
    });

    if (res.ok) {
      console.log("Logged in! The secure cookie is now set.");
      // Redirect to the stage selection or game lobby
      // window.location.href = '/dashboard';
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen">
      <input 
        className="border p-2 text-black"
        placeholder="Enter Player Name" 
        value={username} 
        onChange={(e) => setUsername(e.target.value)} 
      />
      <button className="bg-blue-600 text-white p-2 mt-4" onClick={handleStart}>
        Start Hack
      </button>
    </div>
  );
}