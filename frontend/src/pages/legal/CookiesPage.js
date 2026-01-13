import React from 'react';
import { Link } from 'react-router-dom';
import LegalPageLayout from '../../components/legal/LegalPageLayout';

const CookiesPage = () => {
  return (
    <LegalPageLayout title="Cookie Policy" lastUpdated="2026-01-13">
      <div className="legal-document">
        <p>
          This Cookie Policy explains how Investment Research Platform ("we," "our," or "us") uses cookies and similar technologies when you use our investment research platform.
        </p>

        <h2>What Are Cookies?</h2>
        <p>
          Cookies are small text files stored on your device when you visit a website. They help us remember your preferences, keep you logged in, and understand how you use the Service.
        </p>

        <h2>Types of Cookies We Use</h2>

        <h3>1. Essential Cookies (Required)</h3>
        <p>These cookies are necessary for the Service to function. You cannot opt out of these cookies.</p>
        <table>
          <thead>
            <tr>
              <th>Cookie Name</th>
              <th>Purpose</th>
              <th>Duration</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>session_id</td>
              <td>Authentication and session management</td>
              <td>Session</td>
            </tr>
            <tr>
              <td>csrf_token</td>
              <td>Security - prevent cross-site request forgery</td>
              <td>Session</td>
            </tr>
            <tr>
              <td>auth_token</td>
              <td>Keep you logged in</td>
              <td>30 days</td>
            </tr>
            <tr>
              <td>cookie_consent</td>
              <td>Remember your cookie preferences</td>
              <td>1 year</td>
            </tr>
          </tbody>
        </table>

        <h3>2. Functional Cookies (Optional)</h3>
        <p>These cookies enable enhanced features and personalization.</p>
        <table>
          <thead>
            <tr>
              <th>Cookie Name</th>
              <th>Purpose</th>
              <th>Duration</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>theme</td>
              <td>Remember dark/light mode preference</td>
              <td>1 year</td>
            </tr>
            <tr>
              <td>language</td>
              <td>Remember language preference</td>
              <td>1 year</td>
            </tr>
            <tr>
              <td>layout_preferences</td>
              <td>Remember dashboard layout settings</td>
              <td>1 year</td>
            </tr>
            <tr>
              <td>last_viewed_stocks</td>
              <td>Quick access to recently viewed securities</td>
              <td>30 days</td>
            </tr>
            <tr>
              <td>chart_preferences</td>
              <td>Remember chart settings and indicators</td>
              <td>1 year</td>
            </tr>
          </tbody>
        </table>

        <h3>3. Analytics Cookies (Optional)</h3>
        <p>These cookies help us understand how users interact with the Service.</p>
        <table>
          <thead>
            <tr>
              <th>Cookie Name</th>
              <th>Purpose</th>
              <th>Duration</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>_ga</td>
              <td>Google Analytics - distinguish users</td>
              <td>2 years</td>
            </tr>
            <tr>
              <td>_ga_*</td>
              <td>Google Analytics - maintain session state</td>
              <td>2 years</td>
            </tr>
            <tr>
              <td>_gid</td>
              <td>Google Analytics - distinguish users</td>
              <td>24 hours</td>
            </tr>
          </tbody>
        </table>

        <h2>Managing Cookies</h2>

        <h3>In-App Cookie Settings</h3>
        <p>You can manage your cookie preferences in:</p>
        <p><strong>Settings → Privacy → Cookie Preferences</strong></p>
        <p>Options:</p>
        <ul>
          <li><strong>Essential Only</strong>: Required cookies only (minimum)</li>
          <li><strong>Essential + Functional</strong>: Required + convenience features</li>
          <li><strong>All Cookies</strong>: Full functionality and analytics</li>
        </ul>

        <h3>Browser Settings</h3>
        <p>You can control cookies through your browser:</p>
        <ul>
          <li><a href="https://support.google.com/chrome/answer/95647" target="_blank" rel="noopener noreferrer">Chrome</a></li>
          <li><a href="https://support.mozilla.org/en-US/kb/cookies" target="_blank" rel="noopener noreferrer">Firefox</a></li>
          <li><a href="https://support.apple.com/guide/safari/manage-cookies-sfri11471/mac" target="_blank" rel="noopener noreferrer">Safari</a></li>
          <li><a href="https://support.microsoft.com/en-us/microsoft-edge/delete-cookies-in-microsoft-edge-63947406-40ac-c3b8-57b9-2a946a29ae09" target="_blank" rel="noopener noreferrer">Edge</a></li>
        </ul>

        <h3>Opt-Out Links</h3>
        <ul>
          <li><a href="https://tools.google.com/dlpage/gaoptout" target="_blank" rel="noopener noreferrer">Google Analytics Opt-out</a></li>
        </ul>

        <h2>Impact of Disabling Cookies</h2>

        <h3>If You Disable All Cookies:</h3>
        <ul>
          <li>❌ You cannot log in or use the Service</li>
          <li>❌ Settings will not be saved</li>
          <li>❌ The platform may not function correctly</li>
        </ul>

        <h3>If You Disable Optional Cookies:</h3>
        <ul>
          <li>✅ You can still use all core features</li>
          <li>❌ Preferences won't be remembered across sessions</li>
          <li>❌ We can't improve the platform based on your usage</li>
        </ul>

        <h2>Third-Party Cookies</h2>
        <p>We use services that may set their own cookies:</p>
        <ul>
          <li><strong>Google</strong> (authentication, analytics)</li>
          <li><strong>Error tracking services</strong> (error monitoring)</li>
        </ul>
        <p>These third parties have their own privacy policies.</p>

        <h2>Do Not Track</h2>
        <p>
          We currently do not respond to "Do Not Track" (DNT) browser signals because there is no industry-wide standard for DNT compliance. Instead, we provide granular cookie controls in your Settings.
        </p>

        <h2>Changes to This Policy</h2>
        <p>We may update this Cookie Policy to reflect new technologies or legal requirements. Check the "Last Updated" date for changes.</p>

        <h2>Contact Us</h2>
        <p>Questions about cookies?</p>
        <ul>
          <li><strong>Email</strong>: <a href="mailto:privacy@investmentresearchplatform.com">privacy@investmentresearchplatform.com</a></li>
          <li><strong>In-App</strong>: Settings → Privacy → Contact Us</li>
        </ul>

        <hr />

        <p><strong>By continuing to use Investment Research Platform, you consent to our use of cookies in accordance with this Cookie Policy and your preferences.</strong></p>

        <h2 style={{ marginTop: '2rem' }}>Related Documents</h2>
        <ul>
          <li><Link to="/legal/terms">Terms of Service</Link></li>
          <li><Link to="/legal/privacy">Privacy Policy</Link></li>
          <li><Link to="/legal/disclaimer">Financial Disclaimer</Link></li>
        </ul>
      </div>
    </LegalPageLayout>
  );
};

export default CookiesPage;
