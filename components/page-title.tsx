"use client";

import type React from "react";

export default function PageTitle({
  icon,
  title,
  subtitle,
  right,
  size = "default",
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: React.ReactNode;
  right?: React.ReactNode;
  size?: "default" | "compact";
}) {
  const badgeSize = size === "compact" ? 42 : 52;
  const iconSize = size === "compact" ? 20 : 24;

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16, minWidth: 0 }}>
        <div style={{
          width: badgeSize,
          height: badgeSize,
          borderRadius: size === "compact" ? 13 : 16,
          background: "var(--accent-gradient)",
          display: "grid",
          placeItems: "center",
          boxShadow: "0 8px 22px var(--accent-glow)",
          flexShrink: 0,
        }}>
          <span style={{ display: "grid", placeItems: "center", color: "#fff", width: iconSize, height: iconSize }}>
            {icon}
          </span>
        </div>
        <div style={{ minWidth: 0 }}>
          <h1 style={{
            margin: 0,
            color: "#1a1a2e",
            fontSize: size === "compact" ? 24 : 30,
            fontWeight: 900,
            lineHeight: 1.05,
            letterSpacing: "-0.04em",
          }}>
            {title}
          </h1>
          {subtitle && (
            <div style={{ fontSize: 12, color: "#9898b0", marginTop: 5, fontWeight: 600 }}>
              {subtitle}
            </div>
          )}
        </div>
      </div>
      {right}
    </div>
  );
}
