import React from 'react'

const paths = {
  calendar: <><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M7 2v4M17 2v4M3 9h18"/></>,
  chart: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/><path d="m3 8 6-4 6 5 6-6"/></>,
  upload: <><path d="M12 16V3M7 8l5-5 5 5M4 14v6h16v-6"/></>,
  pdf: <><path d="M6 2h9l4 4v16H6zM14 2v5h5"/><path d="M9 16h2a2 2 0 0 0 0-4H9v6M14 18v-6h1.5a3 3 0 0 1 0 6H14"/></>,
  printer: <><path d="M7 8V3h10v5M7 17H5a3 3 0 0 1-3-3v-3a3 3 0 0 1 3-3h14a3 3 0 0 1 3 3v3a3 3 0 0 1-3 3h-2"/><path d="M7 14h10v7H7zM18 11h.01"/></>,
  search: <><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></>,
  left: <path d="m15 18-6-6 6-6"/>, right: <path d="m9 18 6-6-6-6"/>, down: <path d="m6 9 6 6 6-6"/>,
  menu: <path d="M4 6h16M4 12h16M4 18h16"/>, close: <path d="m6 6 12 12M18 6 6 18"/>,
  lock: <><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></>,
  user: <><circle cx="12" cy="8" r="3.5"/><path d="M5 21a7 7 0 0 1 14 0"/></>,
  info: <><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></>,
  check: <path d="m5 12 4 4L19 6"/>, refresh: <><path d="M20 11a8 8 0 0 0-14-4L4 9M4 5v4h4M4 13a8 8 0 0 0 14 4l2-2M20 19v-4h-4"/></>,
  settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/></>,
  logout: <><path d="M10 5H5v14h5M14 8l4 4-4 4M18 12H9"/></>, eyeOff: <><path d="m3 3 18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.1A10.3 10.3 0 0 1 12 5c5.5 0 9 7 9 7a16 16 0 0 1-2.1 3M6.2 6.2C3.9 7.8 3 12 3 12s3.5 7 9 7a9 9 0 0 0 3-.5"/></>,
  minus: <path d="M5 12h14"/>, reset: <path d="M4 12a8 8 0 1 0 2.3-5.7L4 9M4 4v5h5"/>,
  code: <><path d="m8 9-3 3 3 3M16 9l3 3-3 3M14 5l-4 14"/></>,
  report: <><path d="M6 2h9l4 4v16H6z"/><path d="M14 2v5h5M9 13h6M9 17h6M9 9h2"/></>,
}

export function Icon({ name, size = 18 }) {
  return <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}

export function Button({ children, icon, variant = 'secondary', className = '', ...props }) {
  return <button className={`button button-${variant} ${className}`} {...props}>{icon && <Icon name={icon} size={17}/>}<span>{children}</span></button>
}
