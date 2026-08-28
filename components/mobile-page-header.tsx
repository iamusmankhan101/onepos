"use client";

import React from "react";

interface MobilePageHeaderProps {
  title: string;
  subtitle?: string;
  action?: {
    label: string;
    icon?: React.ReactNode;
    onClick?: () => void;
    href?: string;
  };
  left?: React.ReactNode;
}

export default function MobilePageHeader({ title, subtitle, action, left }: MobilePageHeaderProps) {
  return (
    <div className="mobile-app-bar">
      {left && <div style={{ marginRight: 4 }}>{left}</div>}
      <div style={{ flex: 1 }}>
        <div className="mobile-app-bar-title">{title}</div>
        {subtitle && <div className="mobile-app-bar-subtitle">{subtitle}</div>}
      </div>
      {action && (
        action.href ? (
          <a href={action.href} className="mobile-app-bar-action">
            {action.icon}{action.label}
          </a>
        ) : (
          <button type="button" onClick={action.onClick} className="mobile-app-bar-action">
            {action.icon}{action.label}
          </button>
        )
      )}
    </div>
  );
}
