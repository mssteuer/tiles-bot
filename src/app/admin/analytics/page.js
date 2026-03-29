'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';

const CATEGORY_COLORS = {
  coding:         '#6366f1',
  trading:        '#a855f7',
  research:       '#3b82f6',
  social:         '#ec4899',
  infrastructure: '#22c55e',
  uncategorized:  '#555',
};

function fmt(n, decimals = 2) {
  if (n === null || n === undefined) return '—';
  return Number(n).toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function fmtUSD(n) {
  if (n === null || n === undefined) return '—';
  return '$' + fmt(n, 4);
}

function shortDate(dateStr) {
  if (!dateStr) return '';
  const [, m, d] = dateStr.split('-');
  return `${parseInt(m)}/${parseInt(d)}`;
}

// Minimal SVG bar chart
function BarChart({ data, valueKey, color, label, formatFn }) {
  if (!data || data.length === 0) return null;
  const maxVal = Math.max(...data.map(d => d[valueKey] || 0), 0.0001);
  const barWidth = Math.max(2, Math.floor(560 / data.length) - 2);
  const chartWidth = data.length * (barWidth + 2);

  return (
    <div>
      <p style={{ fontSize: 12, color: '#9ca3af', marginBottom: 8 }}>{label}</p>
      <div style={{ overflowX: 'auto' }}>
        <svg width={Math.max(chartWidth, 400)} height={120} style={{ display: 'block' }}>
          {data.map((d, i) => {
            const val = d[valueKey] || 0;
            const barH = maxVal > 0 ? Math.max(1, (val / maxVal) * 90) : 1;
            const x = i * (barWidth + 2);
            const y = 100 - barH;
            return (
              <g key={d.date}>
                <rect
                  x={x} y={y} width={barWidth} height={barH}
                  fill={color} rx={2}
                  opacity={0.85}
                />
                {barWidth > 14 && (
                  <text x={x + barWidth / 2} y={115} textAnchor="middle" fontSize={9} fill="#555">
                    {shortDate(d.date)}
                  </text>
                )}
                <title>{d.date}: {formatFn ? formatFn(val) : val}</title>
              </g>
            );
          })}
        </svg>
      </div>
      {/* X-axis labels — show first, middle, last if bars too narrow */}
      {barWidth <= 14 && data.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#9ca3af', marginTop: 4 }}>
          <span>{shortDate(data[0]?.date)}</span>
          <span>{shortDate(data[Math.floor(data.length / 2)]?.date)}</span>
          <span>{shortDate(data[data.length - 1]?.date)}</span>
        </div>
      )}
    </div>
  );
}

// Minimal SVG line chart for cumulative revenue
function LineChart({ data, valueKey, color, label, formatFn }) {
  if (!data || data.length < 2) return null;
  const values = data.map(d => d[valueKey] || 0);
  const maxVal = Math.max(...values, 0.0001);
  const W = 560;
  const H = 100;
  const pts = data.map((d, i) => {
    const x = (i / (data.length - 1)) * W;
    const y = H - ((d[valueKey] || 0) / maxVal) * (H - 10);
    return `${x},${y}`;
  });
  const polyline = pts.join(' ');
  // Area fill
  const areaPoints = `0,${H} ${polyline} ${W},${H}`;

  return (
    <div>
      <p style={{ fontSize: 12, color: '#9ca3af', marginBottom: 8 }}>{label}</p>
      <svg width="100%" viewBox={`0 0 ${W} ${H + 20}`} style={{ display: 'block', overflow: 'visible' }}>
        <defs>
          <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.35" />
            <stop offset="100%" stopColor={color} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <polygon points={areaPoints} fill="url(#areaGrad)" />
        <polyline points={polyline} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {/* First / last labels */}
        <text x={0} y={H + 16} fontSize={10} fill="#555">{shortDate(data[0]?.date)}</text>
        <text x={W / 2} y={H + 16} textAnchor="middle" fontSize={10} fill="#555">{shortDate(data[Math.floor(data.length / 2)]?.date)}</text>
        <text x={W} y={H + 16} textAnchor="end" fontSize={10} fill="#555">{shortDate(data[data.length - 1]?.date)}</text>
      </svg>
    </div>
  );
}

export default function AnalyticsPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/admin/analytics?days=${days}`)
      .then(r => r.ok ? r.json() : Promise.reject('API error'))
      .then(d => { setData(d); setLoading(false); })
      .catch(e => { setError(String(e)); setLoading(false); });
  }, [days]);

  const bg = '#0a0a0f';
  const card = '#0f0f1a';
  const border = '#1a1a2e';
  const muted = '#94a3b8';
  const dim = '#555';

  return (
    <div style={{ minHeight: '100vh', background: bg, color: '#fff', fontFamily: 'system-ui, sans-serif' }}>
      {/* Header */}
      <header style={{
        padding: '16px 24px', borderBottom: `1px solid ${border}`,
        display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
        background: 'linear-gradient(180deg, #0f0f1a 0%, #0a0a0f 100%)',
      }}>
        <Link href="/" style={{ color: muted, textDecoration: 'none', fontSize: 14 }}>← Grid</Link>
        <span style={{ color: dim }}>|</span>
        <Link href="/leaderboard" style={{ color: muted, textDecoration: 'none', fontSize: 14 }}>Leaderboard</Link>
        <span style={{ color: dim }}>|</span>
        <span style={{ fontSize: 18, fontWeight: 700 }}>📊 Analytics</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          {[7, 14, 30, 60, 90].map(d => (
            <button
              key={d}
              onClick={() => setDays(d)}
              style={{
                background: days === d ? '#3b82f6' : '#1a1a2e',
                border: `1px solid ${days === d ? '#3b82f6' : border}`,
                color: days === d ? '#fff' : muted,
                borderRadius: 6, padding: '4px 10px', fontSize: 12,
                cursor: 'pointer', fontWeight: days === d ? 700 : 400,
              }}
            >
              {d}d
            </button>
          ))}
        </div>
      </header>

      <main style={{ maxWidth: 900, margin: '0 auto', padding: '40px 24px' }}>
        <h1 style={{ fontSize: 30, fontWeight: 800, marginBottom: 6, letterSpacing: '-0.02em' }}>
          tiles.bot Revenue Analytics
        </h1>
        <p style={{ color: muted, marginBottom: 36, fontSize: 14 }}>
          Daily revenue, unique claimers, and price trend. Last {days} days.
        </p>

        {loading && (
          <div style={{ textAlign: 'center', color: dim, padding: 64, fontSize: 22 }}>Loading…</div>
        )}
        {error && (
          <div style={{ textAlign: 'center', color: '#ef4444', padding: 64 }}>Error: {error}</div>
        )}

        {data && !loading && (
          <>
            {/* Summary KPIs */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12, marginBottom: 40 }}>
              <KpiCard label="Total Revenue" value={`$${fmt(data.summary.totalRevenue, 4)}`} sub="USDC collected" color="#22c55e" />
              <KpiCard label="Tiles Claimed" value={data.summary.claimed.toLocaleString()} sub={`of ${data.summary.totalTiles.toLocaleString()} (${fmt(data.summary.claimedPct, 2)}%)`} color="#3b82f6" />
              <KpiCard label="Unique Claimers" value={data.summary.uniqueClaimers.toLocaleString()} sub="distinct wallets" color="#a855f7" />
              <KpiCard label="Current Price" value={`$${fmt(data.summary.currentPrice, 6)}`} sub="USDC per tile" color="#f59e0b" />
              <KpiCard label="Avg Price Paid" value={`$${fmt(data.summary.avgPricePaid, 6)}`} sub="per tile" color="#ec4899" />
              <KpiCard label="Sold-Out Est." value={`$${Math.round(data.summary.estimatedSoldOutRevenue).toLocaleString()}`} sub={`${fmt(data.summary.revenueProgressPct, 3)}% captured`} color="#6366f1" />
            </div>

            {/* Charts */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>

              {/* Cumulative Revenue */}
              <ChartCard title="Cumulative Revenue" subtitle="Running total USDC collected">
                <LineChart
                  data={data.timeline}
                  valueKey="cumulativeRevenue"
                  color="#22c55e"
                  label="USDC cumulative"
                  formatFn={v => `$${fmt(v, 4)}`}
                />
              </ChartCard>

              {/* Daily Revenue */}
              <ChartCard title="Daily Revenue" subtitle="USDC collected per day">
                <BarChart
                  data={data.timeline}
                  valueKey="revenue"
                  color="#3b82f6"
                  label="USDC / day"
                  formatFn={v => `$${fmt(v, 4)}`}
                />
              </ChartCard>

              {/* Daily Claims */}
              <ChartCard title="Daily Claims" subtitle="New tiles claimed per day">
                <BarChart
                  data={data.timeline}
                  valueKey="claims"
                  color="#a855f7"
                  label="tiles / day"
                  formatFn={v => `${v} tiles`}
                />
              </ChartCard>

              {/* Daily Unique Claimers */}
              <ChartCard title="Daily Unique Claimers" subtitle="Distinct wallets per day">
                <BarChart
                  data={data.timeline}
                  valueKey="uniqueClaimers"
                  color="#ec4899"
                  label="unique wallets / day"
                  formatFn={v => `${v} wallets`}
                />
              </ChartCard>

              {/* Revenue by Category */}
              {data.revenueByCategory && data.revenueByCategory.length > 0 && (
                <ChartCard title="Revenue by Category" subtitle="USDC by agent type">
                  <CategoryTable data={data.revenueByCategory} totalRevenue={data.summary.totalRevenue} />
                </ChartCard>
              )}

              {/* Raw Timeline Table */}
              <ChartCard title="Daily Breakdown" subtitle={`Last ${days} days — newest first`}>
                <TimelineTable timeline={[...data.timeline].reverse()} />
              </ChartCard>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function KpiCard({ label, value, sub, color }) {
  return (
    <div style={{
      background: '#0f0f1a', border: '1px solid #1a1a2e',
      borderRadius: 12, padding: '16px 18px',
    }}>
      <div style={{ fontSize: 11, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color, marginBottom: 4 }}>{value}</div>
      <div style={{ fontSize: 11, color: '#9ca3af' }}>{sub}</div>
    </div>
  );
}

function ChartCard({ title, subtitle, children }) {
  return (
    <div style={{
      background: '#0f0f1a', border: '1px solid #1a1a2e',
      borderRadius: 14, padding: '24px 24px 20px',
    }}>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>{title}</div>
        <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>{subtitle}</div>
      </div>
      {children}
    </div>
  );
}

function CategoryTable({ data, totalRevenue }) {
  const max = Math.max(...data.map(d => d.revenue), 0.0001);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {data.map(cat => {
        const color = CATEGORY_COLORS[cat.category] || '#94a3b8';
        const pct = totalRevenue > 0 ? ((cat.revenue / totalRevenue) * 100).toFixed(1) : 0;
        const barPct = (cat.revenue / max) * 100;
        return (
          <div key={cat.category} style={{
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <div style={{
              width: 10, height: 10, borderRadius: 3, background: color, flexShrink: 0,
            }} />
            <div style={{ width: 100, fontSize: 13, fontWeight: 600, textTransform: 'capitalize', flexShrink: 0 }}>
              {cat.category}
            </div>
            <div style={{ flex: 1, height: 8, background: '#1a1a2e', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{
                width: `${barPct}%`, height: '100%',
                background: color, borderRadius: 4,
                transition: 'width 0.4s ease',
              }} />
            </div>
            <div style={{ width: 80, textAlign: 'right', fontSize: 13, color: '#22c55e', flexShrink: 0 }}>
              ${fmt(cat.revenue, 4)}
            </div>
            <div style={{ width: 45, textAlign: 'right', fontSize: 11, color: '#9ca3af', flexShrink: 0 }}>
              {pct}%
            </div>
            <div style={{ width: 50, textAlign: 'right', fontSize: 11, color: '#9ca3af', flexShrink: 0 }}>
              {cat.tiles} tiles
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TimelineTable({ timeline }) {
  if (!timeline || timeline.length === 0) {
    return <p style={{ color: '#9ca3af', fontSize: 13 }}>No data for this period.</p>;
  }
  const thStyle = {
    padding: '8px 12px', textAlign: 'right',
    fontSize: 11, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.8,
    borderBottom: '1px solid #1a1a2e', fontWeight: 600,
  };
  const tdStyle = {
    padding: '8px 12px', textAlign: 'right',
    fontSize: 13, borderBottom: '1px solid #111',
  };
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr>
            <th style={{ ...thStyle, textAlign: 'left' }}>Date</th>
            <th style={thStyle}>Claims</th>
            <th style={thStyle}>Revenue</th>
            <th style={thStyle}>Unique Wallets</th>
            <th style={thStyle}>Cumulative Rev.</th>
          </tr>
        </thead>
        <tbody>
          {timeline.map(row => (
            <tr key={row.date} style={{ transition: 'background 0.1s' }}
              onMouseEnter={e => e.currentTarget.style.background = '#111120'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              <td style={{ ...tdStyle, textAlign: 'left', color: '#94a3b8' }}>{row.date}</td>
              <td style={tdStyle}>{row.claims}</td>
              <td style={{ ...tdStyle, color: '#22c55e' }}>${fmt(row.revenue, 4)}</td>
              <td style={tdStyle}>{row.uniqueClaimers}</td>
              <td style={{ ...tdStyle, color: '#3b82f6' }}>
                {row.cumulativeRevenue !== null ? `$${fmt(row.cumulativeRevenue, 4)}` : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
