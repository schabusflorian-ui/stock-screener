import React from 'react';
import LegalPageLayout from '../../components/legal/LegalPageLayout';

const PrivacyPage = () => {
  return (
    <LegalPageLayout title="Privacy Policy" lastUpdated="2026-01-13">
      <div className="legal-document">
        <p>
          Investment Research Platform ("we," "our," or "us") respects your privacy. This Privacy Policy explains how we collect, use, disclose, and protect your information when you use our investment research platform.
        </p>

        <h2>1. Information We Collect</h2>

        <h3>1.1 Information You Provide</h3>
        <ul>
          <li><strong>Account Information</strong>: Name, email address (from Google OAuth)</li>
          <li><strong>Profile Information</strong>: Investment preferences, risk tolerance</li>
          <li><strong>User Content</strong>: Watchlists, portfolios, notes, alerts, saved queries</li>
          <li><strong>Communications</strong>: Support requests, feedback</li>
          <li><strong>Natural Language Queries</strong>: Questions submitted to the AI system</li>
        </ul>

        <h3>1.2 Information Collected Automatically</h3>
        <ul>
          <li><strong>Usage Data</strong>: Features used, pages visited, time spent</li>
          <li><strong>Device Information</strong>: Browser type, operating system, device identifiers</li>
          <li><strong>Log Data</strong>: IP address, access times, referring URLs</li>
          <li><strong>Cookies</strong>: Session data, preferences (see Cookie Policy)</li>
        </ul>

        <h2>2. How We Use Your Information</h2>
        <p>We use your information to:</p>
        <ul>
          <li><strong>Provide the Service</strong>: Display data, save preferences, sync across devices</li>
          <li><strong>Personalize Experience</strong>: Customize recommendations and insights</li>
          <li><strong>Improve the Service</strong>: Analyze usage patterns, fix bugs, develop features</li>
          <li><strong>Communicate</strong>: Send important updates, respond to inquiries</li>
          <li><strong>Ensure Security</strong>: Detect fraud, protect against abuse</li>
          <li><strong>Legal Compliance</strong>: Meet regulatory requirements</li>
        </ul>

        <p>We do NOT:</p>
        <ul>
          <li>Sell your personal information</li>
          <li>Share your portfolio or watchlist data with other users</li>
          <li>Use your data for advertising without consent</li>
        </ul>

        <h2>3. Your Rights</h2>

        <h3>3.1 All Users</h3>
        <p>You have the right to:</p>
        <ul>
          <li><strong>Access</strong>: View your personal data through Settings</li>
          <li><strong>Correct</strong>: Update inaccurate information</li>
          <li><strong>Delete</strong>: Request account and data deletion</li>
          <li><strong>Export</strong>: Download your data in JSON format</li>
          <li><strong>Withdraw Consent</strong>: Opt out of optional data collection</li>
        </ul>

        <h3>3.2 European Users (GDPR)</h3>
        <p>If you're in the EU/EEA, you also have the right to:</p>
        <ul>
          <li><strong>Restrict Processing</strong>: Limit how we use your data</li>
          <li><strong>Object</strong>: Object to certain processing activities</li>
          <li><strong>Data Portability</strong>: Receive data in a machine-readable format</li>
          <li><strong>Lodge Complaint</strong>: File a complaint with your supervisory authority</li>
        </ul>

        <h3>3.3 California Users (CCPA/CPRA)</h3>
        <p>If you're a California resident, you have the right to:</p>
        <ul>
          <li>Know what personal information we collect</li>
          <li>Request deletion of your information</li>
          <li>Opt out of the sale of personal information (we don't sell data)</li>
          <li>Non-discrimination for exercising your rights</li>
        </ul>

        <h2>4. Data Security</h2>
        <p>We implement industry-standard security measures:</p>
        <ul>
          <li>Encryption in transit (TLS 1.3)</li>
          <li>Encryption at rest</li>
          <li>Access controls and authentication</li>
          <li>Regular security assessments</li>
          <li>Secure cloud infrastructure</li>
        </ul>
        <p>However, no system is 100% secure. We cannot guarantee absolute security.</p>

        <h2>5. Data Retention</h2>
        <p>We retain your information for as long as:</p>
        <ul>
          <li>Your account is active</li>
          <li>Needed to provide the Service</li>
          <li>Required by law</li>
        </ul>
        <p>After account deletion:</p>
        <ul>
          <li>Personal data is deleted within 30 days</li>
          <li>Anonymized analytics data may be retained</li>
          <li>Backups are purged within 90 days</li>
        </ul>

        <h2>6. Children's Privacy</h2>
        <p>The Service is not intended for users under 18. We do not knowingly collect information from children.</p>

        <h2>7. Changes to This Policy</h2>
        <p>We may update this Privacy Policy periodically. We will notify you of material changes via email or in-app notification.</p>

        <h2>8. Contact Us</h2>
        <p>For privacy-related questions:</p>
        <ul>
          <li><strong>Email</strong>: <a href="mailto:privacy@investmentresearchplatform.com">privacy@investmentresearchplatform.com</a></li>
          <li><strong>Data Protection Officer</strong>: <a href="mailto:dpo@investmentresearchplatform.com">dpo@investmentresearchplatform.com</a></li>
        </ul>

        <hr />

        <p><strong>By using Investment Research Platform, you acknowledge that you have read and understood this Privacy Policy.</strong></p>
      </div>
    </LegalPageLayout>
  );
};

export default PrivacyPage;
