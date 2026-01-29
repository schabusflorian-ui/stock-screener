// frontend/src/pages/dev/IconGallery.jsx
// Development page to view all Prism icons
import React, { useState } from 'react';
import * as Icons from '../../components/icons';
import { IconButton, IconButtonGroup, iconColors } from '../../components/icons';

// List of non-icon exports to exclude
const NON_ICON_EXPORTS = [
  'Icon', 'IconButton', 'IconButtonGroup',
  'iconColors', 'iconCategoryMap', 'getIconColors', 'gradientPresets'
];

const IconGallery = () => {
  const [search, setSearch] = useState('');
  const [size, setSize] = useState(24);

  // Get all icon names (exclude non-icon exports)
  const iconNames = Object.keys(Icons).filter(name => {
    if (NON_ICON_EXPORTS.includes(name)) return false;
    const component = Icons[name];
    // Check if it's a valid React component (function or forwardRef)
    return component && (
      typeof component === 'function' ||
      (typeof component === 'object' && component.$$typeof)
    );
  });

  // Filter icons based on search
  const filteredIcons = iconNames.filter(name =>
    name.toLowerCase().includes(search.toLowerCase())
  );

  // Demo icons for IconButton showcase
  const demoIcons = [
    { name: 'LineChart', colorScheme: 'analytics', label: 'Analytics' },
    { name: 'Shield', colorScheme: 'risk', label: 'Risk' },
    { name: 'Brain', colorScheme: 'ai', label: 'AI Lens' },
    { name: 'TrendingUp', colorScheme: 'growth', label: 'Growth' },
    { name: 'Eye', colorScheme: 'watchlist', label: 'Watchlist' },
  ];

  return (
    <div style={{
      padding: '24px',
      maxWidth: '1400px',
      margin: '0 auto',
      background: 'linear-gradient(180deg, #F8F5EF 0%, #FAF8F4 100%)',
      minHeight: '100vh'
    }}>
      {/* Header */}
      <div style={{ marginBottom: '32px' }}>
        <p style={{ color: '#A67C3D', fontSize: '11px', fontWeight: 600, letterSpacing: '0.1em', marginBottom: '8px' }}>
          PRISM DESIGN SYSTEM
        </p>
        <h1 style={{ fontSize: '32px', fontWeight: 300, color: '#0F172A', marginBottom: '8px' }}>
          Icon Library
        </h1>
        <p style={{ color: '#64748B', fontSize: '16px' }}>
          {iconNames.length} custom duotone icons • 1.5px stroke • 0.3 fill opacity
        </p>
      </div>

      {/* IconButton Demo Section */}
      <section style={{ marginBottom: '48px' }}>
        <p style={{ color: '#A67C3D', fontSize: '11px', fontWeight: 600, letterSpacing: '0.1em', marginBottom: '16px' }}>
          ICON BUTTONS — HOVER STATE DEMO
        </p>
        <div style={{
          background: '#FFFFFF',
          borderRadius: '20px',
          padding: '32px',
          boxShadow: '0 4px 24px rgba(166, 124, 61, 0.08)',
          border: '1px solid rgba(166, 124, 61, 0.1)'
        }}>
          <p style={{ fontSize: '13px', color: '#64748B', marginBottom: '24px', textAlign: 'center' }}>
            Hover over icons to see the pastel transition effect
          </p>
          <IconButtonGroup gap={32}>
            {demoIcons.map(({ name, colorScheme, label }) => {
              const IconComponent = Icons[name];
              if (!IconComponent) return null;
              return (
                <IconButton
                  key={name}
                  icon={IconComponent}
                  label={label}
                  colorScheme={colorScheme}
                  size="large"
                  showLabel
                />
              );
            })}
          </IconButtonGroup>
        </div>
      </section>

      {/* Size Variants Demo */}
      <section style={{ marginBottom: '48px' }}>
        <p style={{ color: '#A67C3D', fontSize: '11px', fontWeight: 600, letterSpacing: '0.1em', marginBottom: '16px' }}>
          SIZE VARIANTS
        </p>
        <div style={{
          background: '#FFFFFF',
          borderRadius: '20px',
          padding: '32px',
          boxShadow: '0 4px 24px rgba(166, 124, 61, 0.08)',
          border: '1px solid rgba(166, 124, 61, 0.1)'
        }}>
          <div style={{ display: 'flex', gap: '48px', justifyContent: 'center', alignItems: 'flex-end' }}>
            {['small', 'medium', 'large'].map(sizeVariant => (
              <div key={sizeVariant} style={{ textAlign: 'center' }}>
                <IconButton
                  icon={Icons.Brain}
                  colorScheme="ai"
                  size={sizeVariant}
                />
                <p style={{ fontSize: '12px', color: '#64748B', marginTop: '12px', fontWeight: 500 }}>
                  {sizeVariant}
                </p>
                <p style={{ fontSize: '11px', color: '#94A3B8' }}>
                  {sizeVariant === 'small' ? '48px' : sizeVariant === 'medium' ? '64px' : '72px'}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Circle Variant Demo */}
      <section style={{ marginBottom: '48px' }}>
        <p style={{ color: '#A67C3D', fontSize: '11px', fontWeight: 600, letterSpacing: '0.1em', marginBottom: '16px' }}>
          CIRCLE VARIANT
        </p>
        <div style={{
          background: '#FFFFFF',
          borderRadius: '20px',
          padding: '32px',
          boxShadow: '0 4px 24px rgba(166, 124, 61, 0.08)',
          border: '1px solid rgba(166, 124, 61, 0.1)'
        }}>
          <IconButtonGroup gap={40}>
            {demoIcons.map(({ name, colorScheme, label }) => {
              const IconComponent = Icons[name];
              if (!IconComponent) return null;
              return (
                <IconButton
                  key={name}
                  icon={IconComponent}
                  label={label}
                  colorScheme={colorScheme}
                  size="medium"
                  variant="circle"
                  showLabel
                />
              );
            })}
          </IconButtonGroup>
        </div>
      </section>

      {/* Brand Navy Variant */}
      <section style={{ marginBottom: '48px' }}>
        <p style={{ color: '#A67C3D', fontSize: '11px', fontWeight: 600, letterSpacing: '0.1em', marginBottom: '16px' }}>
          BRAND NAVY — PRISM PALETTE
        </p>
        <div style={{
          background: '#FFFFFF',
          borderRadius: '20px',
          padding: '32px',
          boxShadow: '0 4px 24px rgba(166, 124, 61, 0.08)',
          border: '1px solid rgba(166, 124, 61, 0.1)'
        }}>
          <IconButtonGroup gap={32}>
            {demoIcons.map(({ name, label }) => {
              const IconComponent = Icons[name];
              if (!IconComponent) return null;
              return (
                <IconButton
                  key={name}
                  icon={IconComponent}
                  label={label}
                  colorScheme="brand"
                  size="large"
                  showLabel
                />
              );
            })}
          </IconButtonGroup>
        </div>
      </section>

      {/* All Icons Grid */}
      <section>
        <p style={{ color: '#A67C3D', fontSize: '11px', fontWeight: 600, letterSpacing: '0.1em', marginBottom: '16px' }}>
          ALL ICONS ({filteredIcons.length})
        </p>

        <div style={{
          background: '#FFFFFF',
          borderRadius: '20px',
          padding: '24px',
          boxShadow: '0 4px 24px rgba(166, 124, 61, 0.08)',
          border: '1px solid rgba(166, 124, 61, 0.1)'
        }}>
          {/* Controls */}
          <div style={{ display: 'flex', gap: '16px', marginBottom: '24px', flexWrap: 'wrap' }}>
            <input
              type="text"
              placeholder="Search icons..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                padding: '10px 14px',
                border: '1px solid #E2E8F0',
                borderRadius: '8px',
                width: '250px',
                fontSize: '14px',
                outline: 'none'
              }}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '14px', color: '#64748B' }}>Size:</span>
              {[16, 20, 24, 32, 48].map(s => (
                <button
                  key={s}
                  onClick={() => setSize(s)}
                  style={{
                    padding: '6px 12px',
                    border: '1px solid #E2E8F0',
                    borderRadius: '6px',
                    background: size === s ? '#0F172A' : '#FFFFFF',
                    color: size === s ? '#FFFFFF' : '#374151',
                    cursor: 'pointer',
                    fontSize: '13px',
                    fontWeight: 500,
                    transition: 'all 0.15s ease'
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Icon Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))',
              gap: '8px'
            }}
          >
            {filteredIcons.map(name => {
              const IconComponent = Icons[name];
              return (
                <div
                  key={name}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    padding: '12px 6px',
                    border: '1px solid #F1F5F9',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    background: '#FAFAFA'
                  }}
                  onClick={() => {
                    navigator.clipboard.writeText(`<${name} />`);
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = '#7C3AED';
                    e.currentTarget.style.background = '#F5F3FF';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = '#F1F5F9';
                    e.currentTarget.style.background = '#FAFAFA';
                  }}
                  title={`Click to copy <${name} />`}
                >
                  <div style={{ color: '#7C3AED', marginBottom: '6px' }}>
                    <IconComponent size={size} />
                  </div>
                  <span
                    style={{
                      fontSize: '10px',
                      color: '#64748B',
                      textAlign: 'center',
                      wordBreak: 'break-word',
                      lineHeight: 1.2
                    }}
                  >
                    {name}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Usage Guide */}
      <section style={{ marginTop: '48px' }}>
        <p style={{ color: '#A67C3D', fontSize: '11px', fontWeight: 600, letterSpacing: '0.1em', marginBottom: '16px' }}>
          USAGE
        </p>
        <div style={{
          background: '#FFFFFF',
          borderRadius: '20px',
          padding: '24px',
          boxShadow: '0 4px 24px rgba(166, 124, 61, 0.08)',
          border: '1px solid rgba(166, 124, 61, 0.1)'
        }}>
          <pre style={{
            background: '#0F172A',
            color: '#E2E8F0',
            padding: '20px',
            borderRadius: '12px',
            overflow: 'auto',
            fontSize: '13px',
            lineHeight: 1.6
          }}>
{`// Import raw icons
import { AlertCircle, Bell, Brain } from '../components/icons';

// Import IconButton component
import { IconButton, iconColors } from '../components/icons';

// Basic icon usage
<AlertCircle />
<Bell size={20} />
<Brain className="text-violet-500" />

// IconButton with color scheme
<IconButton
  icon={Brain}
  colorScheme="ai"
  size="large"
  showLabel
  label="AI Lens"
/>

// IconButton with custom colors
<IconButton
  icon={Bell}
  color="#DC2626"
  pastel="#FEE2E2"
  darkColor="#B91C1C"
/>

// Circle variant
<IconButton
  icon={Star}
  colorScheme="watchlist"
  variant="circle"
/>`}
          </pre>
        </div>
      </section>
    </div>
  );
};

export default IconGallery;
