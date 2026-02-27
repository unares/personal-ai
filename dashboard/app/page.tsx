'use client';
import { useState } from 'react';
export default function MissionControl() {
  const [points] = useState(100);
  const [sandboxName] = useState("personal-ai (MVP Sandbox)");
  return (
    <div className="min-h-screen bg-zinc-950 text-white p-8">
      <div className="max-w-5xl mx-auto">
        <div className="mb-12">
          <h1 className="text-7xl font-bold tracking-tighter">Mission Control</h1>
          <p className="text-5xl text-emerald-400 font-medium">{sandboxName}</p>
          <div className="mt-4 text-xl text-zinc-400">Points: <span className="text-emerald-400 font-bold">{points}</span></div>
        </div>
        <div className="bg-zinc-900 border border-zinc-700 rounded-3xl p-8 mb-8">
          <h2 className="text-2xl mb-4">Process Brain Dump</h2>
          <textarea className="w-full h-48 bg-zinc-800 border border-zinc-600 rounded-2xl p-6 text-lg" placeholder="Paste brain dump..." />
          <button className="mt-6 bg-white text-black px-12 py-6 rounded-2xl text-xl font-medium">Process → Get One Thing + Obsidian Map</button>
        </div>
        <button className="bg-emerald-500 text-black px-10 py-5 rounded-2xl text-xl font-medium mb-8">+ New mvp-sandbox (manual for now)</button>
        <div className="bg-zinc-900 border border-zinc-700 rounded-3xl p-8">
          <h2 className="text-2xl mb-6">MVP Sandbox Info</h2>
          <div className="text-sm space-y-4">
            <div><strong>Purpose:</strong> Focused MVP building – human or autonomous AIOO/NanoClaw</div>
            <div><strong>Stack:</strong> CLAUDE.md (root) + NEXT_THING.md + CHRONICLE.md + MVP_SANDBOX_GUIDE.md</div>
            <div><strong>Commands:</strong> /nextthing add: ... | /parking add: ...</div>
          </div>
        </div>
      </div>
    </div>
  );
}
