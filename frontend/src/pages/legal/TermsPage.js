import React from 'react';
import LegalPageLayout from '../../components/legal/LegalPageLayout';

const TermsPage = () => {
  return (
    <LegalPageLayout title="Terms of Service" lastUpdated="2026-01-13">
      <div className="legal-document">
        <p>
          Welcome to this investment research platform. By using this platform, you agree to these Terms of Service.
        </p>

        <h2>1. Personal Use Only</h2>
        <p><strong>This platform is provided for personal, non-commercial use only.</strong></p>
        <ul>
          <li>This is a personal project shared with friends and colleagues</li>
          <li>There is no commercial intent or business relationship</li>
          <li>No fees are charged for access or use</li>
          <li>The platform is provided on an "as-is" basis</li>
        </ul>

        <h2>2. NOT FINANCIAL ADVICE</h2>
        <p><strong>IMPORTANT: THIS PLATFORM DOES NOT PROVIDE FINANCIAL, INVESTMENT, TAX, OR LEGAL ADVICE.</strong></p>
        <ul>
          <li>All information is for informational and educational purposes only</li>
          <li>This is a personal project, not a professional financial service</li>
          <li>The operator is not a registered investment advisor or financial planner</li>
          <li>You are solely responsible for your investment decisions</li>
          <li>Past performance does not guarantee future results</li>
          <li>Consult qualified professionals before making investment decisions</li>
        </ul>

        <h2>3. No Warranties or Guarantees</h2>
        <p>This is a personal project provided WITHOUT WARRANTIES:</p>
        <ul>
          <li>Data may be inaccurate, incomplete, or delayed</li>
          <li>Service may be unavailable at times</li>
          <li>Features may not work as expected</li>
          <li>Bugs may not be fixed immediately</li>
          <li>AI-generated content may contain errors</li>
        </ul>
        <p><strong>You use this platform entirely at your own risk.</strong></p>

        <h2>4. AI-Generated Content</h2>
        <p>This platform uses AI to generate insights. AI content:</p>
        <ul>
          <li><strong>May contain errors or inaccuracies</strong></li>
          <li>Should not be your sole basis for decisions</li>
          <li>Can generate plausible but incorrect information</li>
          <li>Has inherent limitations and biases</li>
        </ul>

        <h2>5. Data Sources</h2>
        <p>Market data is provided by third-party sources including Alpha Vantage, Financial Modeling Prep, Yahoo Finance, SEC EDGAR, and ESMA.</p>
        <p><strong>We do not guarantee the accuracy or timeliness of this data.</strong></p>

        <h2>6. Acceptable Use</h2>
        <p>You agree NOT to:</p>
        <ul>
          <li>Use the platform for illegal purposes</li>
          <li>Attempt unauthorized access to systems</li>
          <li>Abuse or overload the platform</li>
          <li>Share your account credentials</li>
          <li>Redistribute data without permission</li>
        </ul>

        <h2>7. Your Responsibility</h2>
        <p>You are solely responsible for:</p>
        <ul>
          <li>Your own investment decisions</li>
          <li>Conducting your own research</li>
          <li>Consulting qualified professionals</li>
          <li>Understanding investment risks</li>
          <li>Verifying information from official sources</li>
        </ul>

        <h2>8. Limitation of Liability</h2>
        <p>The platform operator shall not be liable for:</p>
        <ul>
          <li>Investment losses or financial damages</li>
          <li>Loss of data or access</li>
          <li>Errors in data or AI content</li>
          <li>Service downtime</li>
        </ul>

        <h2>9. Contact</h2>
        <p>For questions or concerns, use the in-app feedback system.</p>

        <hr />

        <p><strong>By using this platform, you understand this is a personal, non-commercial project provided without warranties. This is not financial advice.</strong></p>
      </div>
    </LegalPageLayout>
  );
};

export default TermsPage;
