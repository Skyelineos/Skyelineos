import React from "react";
import { createRoot } from "react-dom/client";
import "./index.css";

const container = document.getElementById("root")!;
const root = createRoot(container);

// Catch module-load failures (happen before React renders — invisible without this)
async function boot() {
  try {
    const [{ default: App }, { AuthProvider }] = await Promise.all([
      import("./App"),
      import("@/auth/AuthContext"),
    ]);
    root.render(
      <AuthProvider>
        <App />
      </AuthProvider>
    );
  } catch (err: any) {
    root.render(
      <div style={{ padding: 32, fontFamily: 'monospace', background: '#fff1f0', border: '2px solid #c00', margin: 20, borderRadius: 8 }}>
        <h2 style={{ color: '#c00', marginBottom: 12 }}>Module load error — send this to Claude:</h2>
        <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, color: '#333' }}>
          {err?.message ?? String(err)}
          {'\n\n'}
          {err?.stack ?? ''}
        </pre>
      </div>
    );
  }
}

boot();
