import Link from 'next/link';
import { css } from '@styled-system/css';

export const metadata = {
  title: 'iamrossi.com - Personal Tools',
  description: 'Personal website and tools for individual use',
};

export default function BrandingPage() {
  return (
    <div className={containerStyle}>
      <main className={contentStyle}>
        <div className={headerStyle}>
          <h1 className={titleStyle}>iamrossi.com</h1>
          <p className={subtitleStyle}>Personal Tools & Services</p>
        </div>

        <div className={sectionStyle}>
          <h2 className={sectionTitleStyle}>About</h2>
          <p className={textStyle}>
            This is a personal application for individual use only. It provides tools and services
            for personal productivity, health tracking, and data management.
          </p>
        </div>

        <div className={sectionStyle}>
          <h2 className={sectionTitleStyle}>Legal</h2>
          <div className={linksStyle}>
            <Link href="/privacy-policy" className={linkStyle}>
              Privacy Policy
            </Link>
            <Link href="/tos" className={linkStyle}>
              Terms of Service
            </Link>
          </div>
        </div>

        <div className={sectionStyle}>
          <h2 className={sectionTitleStyle}>Contact</h2>
          <p className={textStyle}>
            For questions or concerns, please contact the application owner directly.
          </p>
        </div>
      </main>
    </div>
  );
}

const containerStyle = css({
  minHeight: '100vh',
  background: '#0d1117',
  color: '#c9d1d9',
  padding: { base: '2rem 1.5rem', md: '3rem 2rem' },
});

const contentStyle = css({
  maxWidth: '800px',
  margin: '0 auto',
});

const headerStyle = css({
  marginBottom: '3rem',
  textAlign: 'center',
});

const titleStyle = css({
  fontSize: { base: '2.5rem', md: '3.5rem' },
  fontWeight: '700',
  color: '#e6edf3',
  marginBottom: '0.5rem',
});

const subtitleStyle = css({
  fontSize: { base: '1.125rem', md: '1.25rem' },
  color: '#7d8590',
});

const sectionStyle = css({
  marginBottom: '2.5rem',
  padding: '1.5rem',
  borderRadius: '8px',
  background: '#161b22',
  border: '1px solid #21262d',
});

const sectionTitleStyle = css({
  fontSize: '1.5rem',
  fontWeight: '600',
  color: '#58a6ff',
  marginBottom: '1rem',
});

const textStyle = css({
  fontSize: '1rem',
  lineHeight: '1.6',
  color: '#c9d1d9',
});

const linksStyle = css({
  display: 'flex',
  flexDirection: 'column',
  gap: '1rem',
  marginTop: '1rem',
});

const linkStyle = css({
  display: 'inline-block',
  padding: '0.75rem 1.5rem',
  borderRadius: '6px',
  background: '#1f6feb',
  color: '#ffffff',
  textDecoration: 'none',
  fontWeight: '500',
  transition: 'background 0.2s ease',
  textAlign: 'center',

  '&:hover': {
    background: '#388bfd',
  },
});

