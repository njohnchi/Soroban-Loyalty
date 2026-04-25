"use client";

import { useWallet } from "@/context/WalletContext";

export function WalletConnector() {
  const { publicKey, connecting, mounted, connect, disconnect } = useWallet();

  // Render a stable placeholder until client has mounted to avoid hydration mismatch
  if (!mounted) {
    return <button className="btn btn-primary" disabled>Connect Freighter</button>;
  }

  if (publicKey) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontFamily: "monospace", fontSize: 13 }}>
          {publicKey.slice(0, 6)}…{publicKey.slice(-4)}
        </span>
        <button onClick={disconnect} className="btn btn-outline">
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <button onClick={connect} disabled={connecting} className="btn btn-primary">
      {connecting ? "Connecting…" : "Connect Freighter"}
    </button>
  );
}
