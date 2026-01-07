import Link from 'next/link';
import { css } from '@styled-system/css';

export const metadata = {
  title: 'Terms of Service - iamrossi.com',
  description: 'Terms of Service for iamrossi.com',
};

export default function TermsOfServicePage() {
  return (
    <div className={containerStyle}>
      <main className={contentStyle}>
        <div className={headerStyle}>
          <h1 className={titleStyle}>Terms of Service</h1>
          <p className={subtitleStyle}>Last Updated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
        </div>

        <div className={sectionStyle}>
          <h2 className={sectionTitleStyle}>1. Acceptance of Terms</h2>
          <p className={textStyle}>
            By accessing and using this application, you agree to be bound by these Terms of Service.
            This application is intended for personal use only by the authorized owner.
          </p>
        </div>

        <div className={sectionStyle}>
          <h2 className={sectionTitleStyle}>2. Personal Use Only</h2>
          <p className={textStyle}>
            This application is designed for individual, personal use only. Access is restricted to
            the authorized owner. No other users are permitted to access or use this application.
          </p>
        </div>

        <div className={sectionStyle}>
          <h2 className={sectionTitleStyle}>3. Authorized Access</h2>
          <p className={textStyle}>
            Only the authorized owner may access this application. Unauthorized access is strictly
            prohibited. The owner is solely responsible for maintaining the security of their
            credentials and access tokens.
          </p>
        </div>

        <div className={sectionStyle}>
          <h2 className={sectionTitleStyle}>4. Data and Privacy</h2>
          <p className={textStyle}>
            All data stored and processed by this application belongs to the authorized owner.
            The application processes personal data in accordance with the Privacy Policy.
            See the <Link href="/privacy-policy" className={inlineLinkStyle}>Privacy Policy</Link> for
            more information.
          </p>
        </div>

        <div className={sectionStyle}>
          <h2 className={sectionTitleStyle}>5. Service Availability</h2>
          <p className={textStyle}>
            This application is provided &quot;as is&quot; without warranties of any kind. The owner makes
            no guarantees regarding uptime, availability, or functionality of the service.
          </p>
        </div>

        <div className={sectionStyle}>
          <h2 className={sectionTitleStyle}>6. Limitation of Liability</h2>
          <p className={textStyle}>
            The owner of this application shall not be liable for any damages arising from the use
            or inability to use this application, including but not limited to data loss, service
            interruptions, or security breaches.
          </p>
        </div>

        <div className={sectionStyle}>
          <h2 className={sectionTitleStyle}>7. Modifications to Terms</h2>
          <p className={textStyle}>
            These Terms of Service may be updated at any time. Continued use of the application
            after changes constitutes acceptance of the modified terms.
          </p>
        </div>

        <div className={sectionStyle}>
          <h2 className={sectionTitleStyle}>8. Contact</h2>
          <p className={textStyle}>
            For questions regarding these Terms of Service, please contact the application owner
            directly.
          </p>
        </div>

        <div className={backLinkStyle}>
          <Link href="/branding" className={backLinkTextStyle}>
            ← Back to Home
          </Link>
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
  fontSize: '1rem',
  color: '#7d8590',
});

const sectionStyle = css({
  marginBottom: '2rem',
  padding: '1.5rem',
  borderRadius: '8px',
  background: '#161b22',
  border: '1px solid #21262d',
});

const sectionTitleStyle = css({
  fontSize: '1.25rem',
  fontWeight: '600',
  color: '#58a6ff',
  marginBottom: '1rem',
});

const textStyle = css({
  fontSize: '1rem',
  lineHeight: '1.6',
  color: '#c9d1d9',
  marginBottom: '0.5rem',
});

const inlineLinkStyle = css({
  color: '#58a6ff',
  textDecoration: 'none',
  borderBottom: '1px solid transparent',
  transition: 'border-color 0.2s ease',

  '&:hover': {
    borderBottomColor: '#58a6ff',
  },
});

const backLinkStyle = css({
  marginTop: '3rem',
  paddingTop: '2rem',
  borderTop: '1px solid #21262d',
});

const backLinkTextStyle = css({
  color: '#58a6ff',
  textDecoration: 'none',
  fontSize: '1rem',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.5rem',
  transition: 'color 0.2s ease',

  '&:hover': {
    color: '#79c0ff',
  },
});

