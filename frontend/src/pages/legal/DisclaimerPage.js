import React from 'react';
import LegalPageLayout from '../../components/legal/LegalPageLayout';

const DisclaimerPage = () => {
  return (
    <LegalPageLayout title="Investment Disclaimer" lastUpdated="2026-01-13">
      <div className="legal-document">
        <div className="legal-alert legal-alert-danger">
          <h2>⚠️ PLEASE READ THIS DISCLAIMER CAREFULLY</h2>
          <p><strong>This platform provides information for educational purposes only and does not constitute financial advice.</strong></p>
        </div>

        <h2>Not Financial Advice</h2>
        <p>Investment Research Platform provides financial data, analysis tools, and educational content for <strong>informational purposes only</strong>. Nothing on this platform constitutes:</p>
        <ul>
          <li>Investment advice</li>
          <li>Financial advice</li>
          <li>Tax advice</li>
          <li>Legal advice</li>
          <li>A recommendation to buy, sell, or hold any security</li>
          <li>An offer to sell or solicitation to buy securities</li>
        </ul>

        <h2>No Professional Relationship</h2>
        <p>Using Investment Research Platform does not create any professional relationship between you and us. We are not:</p>
        <ul>
          <li>Registered investment advisors (RIA)</li>
          <li>Broker-dealers</li>
          <li>Financial planners</li>
          <li>Fiduciaries</li>
        </ul>
        <p>We are a technology platform that aggregates and analyzes publicly available financial information.</p>

        <h2>Investment Risks</h2>
        <p>All investments involve risk, including but not limited to:</p>
        <ul>
          <li><strong>Market Risk</strong>: Investments can lose value due to market conditions</li>
          <li><strong>Volatility</strong>: Prices can fluctuate significantly and rapidly</li>
          <li><strong>Liquidity Risk</strong>: You may not be able to sell when you want</li>
          <li><strong>Currency Risk</strong>: International investments have exchange rate risk</li>
          <li><strong>Total Loss</strong>: You can lose your entire investment</li>
        </ul>
        <p><strong>Past performance is not indicative of future results.</strong></p>

        <h2>Data Accuracy and Timeliness</h2>
        <p>While we strive for accuracy, we cannot guarantee that:</p>
        <ul>
          <li>Financial data is accurate, complete, or current</li>
          <li>Real-time data is truly real-time (delays may occur)</li>
          <li>AI-generated insights are correct or profitable</li>
          <li>Calculations are error-free</li>
          <li>Third-party data sources are reliable</li>
        </ul>

        <h3>Data Sources</h3>
        <p>We aggregate data from multiple third-party sources including:</p>
        <ul>
          <li>Alpha Vantage</li>
          <li>Financial Modeling Prep</li>
          <li>Yahoo Finance</li>
          <li>SEC EDGAR</li>
          <li>ESMA (European Securities and Markets Authority)</li>
        </ul>
        <p>We are not responsible for errors or omissions in third-party data.</p>

        <h2>AI-Generated Content</h2>

        <h3>Nature of AI Analysis</h3>
        <p>Our platform uses artificial intelligence to generate insights and analysis. AI systems:</p>
        <ul>
          <li><strong>Can Make Errors</strong>: AI models can produce incorrect outputs</li>
          <li><strong>Lack Context</strong>: May not account for recent events</li>
          <li><strong>No Guarantees</strong>: Past accuracy does not guarantee future accuracy</li>
          <li><strong>Not Comprehensive</strong>: May miss important factors</li>
          <li><strong>Can Hallucinate</strong>: May generate plausible-sounding but false information</li>
        </ul>
        <p><strong>NEVER rely solely on AI-generated insights for investment decisions.</strong></p>

        <h2>Backtesting and Hypothetical Performance</h2>
        <p>Any simulated, backtested, or hypothetical performance shown:</p>
        <ul>
          <li>Does not represent actual trading</li>
          <li>Has inherent limitations</li>
          <li>May not reflect actual market conditions</li>
          <li>Should not be relied upon for investment decisions</li>
        </ul>
        <p>Backtested results do not represent an actual track record of trading.</p>

        <h2>Your Responsibility</h2>
        <p>You are solely responsible for:</p>
        <ol>
          <li><strong>Your Own Investment Decisions</strong>: No one else is responsible for your choices</li>
          <li><strong>Conducting Due Diligence</strong>: Research investments thoroughly</li>
          <li><strong>Consulting Qualified Professionals</strong>: Seek advice from registered investment advisors, tax professionals, and legal counsel</li>
          <li><strong>Understanding Risks</strong>: Know what you're investing in</li>
          <li><strong>Financial Capability</strong>: Only invest what you can afford to lose</li>
          <li><strong>Verifying Information</strong>: Double-check data from multiple sources</li>
        </ol>

        <h2>No Guarantee of Profits</h2>
        <div className="legal-alert legal-alert-danger">
          <p><strong>THERE IS NO GUARANTEE THAT YOU WILL MAKE MONEY. INVESTING INVOLVES RISK OF LOSS.</strong></p>
        </div>

        <h2>Acknowledgment</h2>
        <p>By using Investment Research Platform, you acknowledge and agree that:</p>
        <ol>
          <li>You have read and understood this disclaimer in full</li>
          <li>You accept full responsibility for your investment decisions</li>
          <li>You will not hold Investment Research Platform liable for any losses</li>
          <li>You understand the risks of investing</li>
          <li>You will seek professional advice before making investment decisions</li>
        </ol>

        <hr />

        <div className="legal-alert legal-alert-warning">
          <p><strong>IF YOU DO NOT AGREE WITH THIS DISCLAIMER, PLEASE DO NOT USE THE SERVICE.</strong></p>
        </div>

        <p className="legal-related">
          For questions: <a href="mailto:legal@investmentresearchplatform.com">legal@investmentresearchplatform.com</a>
        </p>
      </div>
    </LegalPageLayout>
  );
};

export default DisclaimerPage;
