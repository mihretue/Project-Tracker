import React, { ReactNode } from 'react';

interface StatCardProps {
  label: string;
  value: string | number;
  /** Small supporting line under the value (e.g. "1 Admin · 1 Member"). */
  caption?: ReactNode;
  /** Optional small icon shown inline before the value. */
  icon?: ReactNode;
  iconColor?: string;
}

export const StatCard: React.FC<StatCardProps> = ({ label, value, caption, icon, iconColor }) => {
  return (
    <div className="stat-box">
      <div className="stat-info">
        <span className="stat-label">{label}</span>
        <span className="stat-value">
          {icon && (
            <span className="stat-icon-inline" style={iconColor ? { color: iconColor } : undefined}>
              {icon}
            </span>
          )}
          {value}
        </span>
        {caption && <span className="stat-caption">{caption}</span>}
      </div>
    </div>
  );
};
