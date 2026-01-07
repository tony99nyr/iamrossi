import Link from 'next/link';
import { css } from '@styled-system/css';

export const metadata = {
  title: 'Privacy Policy - iamrossi.com',
  description: 'Privacy Policy for iamrossi.com',
};

export default function PrivacyPolicyPage() {
  return (
    <div className={containerStyle}>
      <main className={contentStyle}>
        <div className={headerStyle}>
          <h1 className={titleStyle}>Privacy Policy</h1>
          <p className={subtitleStyle}>Last Updated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
        </div>

        <div className={sectionStyle}>
          <h2 className={sectionTitleStyle}>1. Overview</h2>
          <p className={textStyle}>
            This Privacy Policy describes how personal data is collected, used, and protected in
            this application. This application is intended for personal use only by the authorized
            owner. No other users have access to this application.
          </p>
        </div>

        <div className={sectionStyle}>
          <h2 className={sectionTitleStyle}>2. Data Collection</h2>
          <p className={textStyle}>
            This application collects and stores personal data belonging to the authorized owner,
            including but not limited to:
          </p>
          <ul className={listStyle}>
            <li>Health and fitness data (heart rate, activity metrics)</li>
            <li>Calendar and schedule information</li>
            <li>Personal preferences and settings</li>
            <li>Application usage data</li>
          </ul>
        </div>

        <div className={sectionStyle}>
          <h2 className={sectionTitleStyle}>3. Data Storage</h2>
          <p className={textStyle}>
            All personal data is stored securely using industry-standard encryption and security
            measures. Data is stored in cloud-based services (Vercel KV/Redis) and is accessible
            only to the authorized owner.
          </p>
        </div>

        <div className={sectionStyle}>
          <h2 className={sectionTitleStyle}>4. Third-Party Services</h2>
          <p className={textStyle}>
            This application integrates with third-party services to provide functionality:
          </p>
          <ul className={listStyle}>
            <li>
              <strong>Google Fit API:</strong> For accessing health and fitness data. Data access
              is limited to the authorized owner&apos;s Google account.
            </li>
            <li>
              <strong>Oura Ring API:</strong> For accessing sleep and activity data. Data access
              is limited to the authorized owner&apos;s Oura account.
            </li>
            <li>
              <strong>Google Calendar:</strong> For accessing calendar and schedule information.
            </li>
          </ul>
          <p className={textStyle}>
            These third-party services have their own privacy policies. The authorized owner is
            responsible for reviewing and accepting those policies.
          </p>
        </div>

        <div className={sectionStyle}>
          <h2 className={sectionTitleStyle}>5. Data Usage</h2>
          <p className={textStyle}>
            Personal data is used solely for the purpose of providing application functionality
            to the authorized owner. Data is not shared with third parties except as necessary
            to provide the requested services (e.g., API calls to Google Fit, Oura Ring).
          </p>
        </div>

        <div className={sectionStyle}>
          <h2 className={sectionTitleStyle}>6. Data Security</h2>
          <p className={textStyle}>
            The application implements security measures to protect personal data, including:
          </p>
          <ul className={listStyle}>
            <li>Encrypted data transmission (HTTPS)</li>
            <li>Secure credential storage</li>
            <li>Access controls and authentication</li>
            <li>Regular security updates</li>
          </ul>
        </div>

        <div className={sectionStyle}>
          <h2 className={sectionTitleStyle}>7. Data Retention</h2>
          <p className={textStyle}>
            Personal data is retained for as long as the authorized owner uses the application.
            The owner may request deletion of their data at any time by contacting the application
            owner directly.
          </p>
        </div>

        <div className={sectionStyle}>
          <h2 className={sectionTitleStyle}>8. User Rights</h2>
          <p className={textStyle}>
            As the sole authorized user of this application, you have the right to:
          </p>
          <ul className={listStyle}>
            <li>Access your personal data</li>
            <li>Request correction of inaccurate data</li>
            <li>Request deletion of your data</li>
            <li>Withdraw consent for data processing</li>
          </ul>
        </div>

        <div className={sectionStyle}>
          <h2 className={sectionTitleStyle}>9. Cookies and Tracking</h2>
          <p className={textStyle}>
            This application may use cookies and similar technologies for functionality and
            analytics. These are used solely for application operation and are not shared with
            third parties for advertising purposes.
          </p>
        </div>

        <div className={sectionStyle}>
          <h2 className={sectionTitleStyle}>10. Changes to Privacy Policy</h2>
          <p className={textStyle}>
            This Privacy Policy may be updated from time to time. The &quot;Last Updated&quot; date at the
            top of this page indicates when changes were last made. Continued use of the
            application after changes constitutes acceptance of the updated policy.
          </p>
        </div>

        <div className={sectionStyle}>
          <h2 className={sectionTitleStyle}>11. Contact</h2>
          <p className={textStyle}>
            For questions or concerns about this Privacy Policy, or to exercise your rights
            regarding your personal data, please contact the application owner directly.
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

const listStyle = css({
  marginLeft: '1.5rem',
  marginTop: '0.5rem',
  marginBottom: '0.5rem',
  color: '#c9d1d9',
  lineHeight: '1.8',

  '& li': {
    marginBottom: '0.5rem',
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

