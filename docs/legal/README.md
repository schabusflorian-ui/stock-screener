# Legal Infrastructure - Investment Research Platform

Complete legal documentation and GDPR/CCPA compliance infrastructure for your investment research platform.

## 🎯 What's Included

This package provides everything you need for legal compliance:

### 📄 Legal Documents
- **Terms of Service** - User agreement and acceptable use policy
- **Privacy Policy** - GDPR/CCPA compliant data handling disclosure
- **Financial Disclaimer** - Investment risk disclosure and liability limitations
- **Cookie Policy** - Transparent cookie usage and consent management

### 🛡️ Compliance Components
- **Cookie Consent Banner** - GDPR/CCPA compliant consent interface
- **Privacy Settings** - User-facing privacy controls
- **GDPR API Endpoints** - Data export, deletion, and rectification
- **Footer** - Disclaimer and legal links

### ⚖️ Legal Protection
- Limits liability for investment losses
- Clarifies non-advisory nature of platform
- Protects AI-generated content disclaimers
- Addresses data accuracy limitations
- Covers third-party data sources

---

## 🚀 Quick Start

### 1. Review Documents
Read through all legal documents in this directory:
- `TERMS_OF_SERVICE.md`
- `PRIVACY_POLICY.md`
- `FINANCIAL_DISCLAIMER.md`
- `COOKIE_POLICY.md`

### 2. Customize for Your Platform
Replace these placeholders throughout all files:
- `Investment Research Platform` → Your app name
- `investmentresearchplatform.com` → Your domain
- Email addresses → Your actual contact emails
- Dates → Current dates

### 3. Get Legal Review
**IMPORTANT**: Have a qualified attorney review these documents before using them. While these templates provide a solid starting point, every platform is unique.

Cost: Typically $500-$2,000 for legal review.

### 4. Implement Components
Follow the [Implementation Guide](./IMPLEMENTATION_GUIDE.md) to integrate all components into your platform.

---

## 📋 Features

### GDPR Compliance ✅
- ✅ Right to Access (data export)
- ✅ Right to Erasure (account deletion)
- ✅ Right to Rectification (data correction)
- ✅ Right to Data Portability (JSON export)
- ✅ Right to Withdraw Consent (cookie settings)
- ✅ Right to Object (privacy settings)
- ✅ Data Breach Notification (built-in logging)
- ✅ Privacy by Design (default privacy settings)

### CCPA Compliance ✅
- ✅ Notice at Collection (privacy policy)
- ✅ Right to Know (data summary)
- ✅ Right to Delete (account deletion)
- ✅ Right to Opt-Out (we don't sell data)
- ✅ Non-Discrimination (full access regardless of choices)

### Cookie Compliance ✅
- ✅ Cookie consent banner
- ✅ Granular consent options
- ✅ Cookie preference management
- ✅ Opt-out mechanisms
- ✅ Essential vs. optional cookies
- ✅ Third-party cookie disclosure

---

## 🏗️ Architecture

### Frontend Components

```
components/
├── legal/
│   ├── CookieConsent.js          # Cookie consent banner with preferences
│   └── LegalPageLayout.js        # Consistent layout for legal pages
├── layout/
│   └── Footer.js                 # Footer with disclaimer and links
└── settings/
    └── PrivacySettings.js        # Privacy preferences and GDPR tools
```

### Backend API

```
api/routes/
└── gdpr.js                       # GDPR compliance endpoints
    ├── GET  /api/gdpr/export            # Export all user data
    ├── POST /api/gdpr/delete-account    # Delete account and data
    ├── GET  /api/gdpr/data-summary      # Get data summary
    └── POST /api/gdpr/rectify           # Request data correction
```

### Utilities

```
lib/
└── cookies.js                    # Cookie management utilities
    ├── setCookie()
    ├── getCookie()
    ├── hasConsent()
    ├── saveConsent()
    └── clearNonEssentialCookies()
```

---

## 📊 Cookie Categories

### Essential Cookies (Always Active)
| Cookie | Purpose | Duration |
|--------|---------|----------|
| `session_id` | Authentication | Session |
| `csrf_token` | Security (CSRF protection) | Session |
| `auth_token` | Keep user logged in | 30 days |
| `cookie_consent` | Remember preferences | 1 year |

### Functional Cookies (Optional)
| Cookie | Purpose | Duration |
|--------|---------|----------|
| `theme` | Dark/light mode | 1 year |
| `language` | Language preference | 1 year |
| `layout_preferences` | Dashboard layout | 1 year |
| `last_viewed_stocks` | Recently viewed | 30 days |

### Analytics Cookies (Optional)
| Cookie | Purpose | Duration |
|--------|---------|----------|
| `_ga` | Google Analytics | 2 years |
| `_gid` | Google Analytics | 24 hours |

---

## 🔐 Security Considerations

### Data Protection
- All sensitive data encrypted in transit (TLS 1.3)
- Database encryption at rest
- Password hashing (bcrypt)
- Session security (httpOnly, secure, sameSite)
- CSRF protection

### Privacy by Default
- Essential cookies only by default
- No analytics without consent
- No data sharing without permission
- Opt-in for all optional features

### Audit Trail
- Log all GDPR requests
- Track data exports
- Record deletion requests
- Monitor rectification requests

---

## 📝 User Rights Implementation

### Right to Access
**Endpoint**: `GET /api/gdpr/export`

Users can download all their data in JSON format including:
- Profile information
- Watchlists
- Portfolios
- Alerts
- Query history
- Activity logs

### Right to Erasure
**Endpoint**: `POST /api/gdpr/delete-account`

Complete data deletion:
1. User confirms with "DELETE MY ACCOUNT"
2. All user data deleted from database
3. Session destroyed
4. Account removed
5. Deletion logged for compliance

### Right to Rectification
**Endpoint**: `POST /api/gdpr/rectify`

Users can request correction of inaccurate data. Requests are logged and reviewed within 30 days.

---

## 🎨 UI Components

### Cookie Consent Banner
- Appears on first visit
- Clear explanation of cookies
- Three options: Accept All, Essential Only, Customize
- Preference panel with granular controls
- Remembers choice for 1 year

### Legal Pages
- Clean, readable layout
- Easy navigation between documents
- Mobile-responsive
- Print-friendly
- Dark mode support

### Privacy Settings
- Cookie preference toggles
- Data export button
- Data summary view
- Account deletion with confirmation

### Footer
- Prominent disclaimer
- Links to all legal documents
- Data source attribution
- Regulatory notices

---

## ⚠️ Important Disclaimers

### Not Financial Advice
All documents clearly state:
- Platform is for informational purposes only
- Not registered as investment advisor
- No fiduciary relationship
- Users responsible for own decisions

### AI Content Warnings
Specific disclaimers about:
- AI-generated insights may contain errors
- Not comprehensive analysis
- Should not be sole decision factor
- Can "hallucinate" false information

### Data Accuracy
Clear disclosure that:
- Data may be delayed
- Third-party sources not guaranteed
- Calculations may contain errors
- Users should verify important information

---

## 🌍 International Compliance

### European Union (GDPR)
- ✅ Legal basis for processing
- ✅ Data controller identification
- ✅ Data protection officer contact
- ✅ International data transfer safeguards
- ✅ Right to lodge complaint

### United Kingdom (UK GDPR)
- ✅ Same protections as EU GDPR
- ✅ ICO contact information
- ✅ UK-specific data transfer mechanisms

### California (CCPA/CPRA)
- ✅ Categories of personal information
- ✅ Business purposes for collection
- ✅ No sale of personal information
- ✅ Non-discrimination policy
- ✅ Authorized agent support

### Other Jurisdictions
Documents include general provisions that may apply to other jurisdictions. Consult local counsel for specific requirements.

---

## 📅 Maintenance Schedule

### Monthly
- [ ] Review user privacy requests
- [ ] Check for new privacy regulations
- [ ] Monitor data breach reports

### Quarterly
- [ ] Audit cookie list for accuracy
- [ ] Review third-party service agreements
- [ ] Update data processing records

### Annually
- [ ] Legal document review
- [ ] Privacy impact assessment
- [ ] Security audit
- [ ] Data retention policy review

---

## 🆘 Handling User Requests

### Data Export Requests
1. User clicks "Download My Data"
2. System generates JSON export
3. User downloads file
4. Log request for compliance

**Response Time**: Immediate (automated)

### Deletion Requests
1. User initiates deletion
2. User confirms with typed phrase
3. All data deleted from database
4. Deletion logged
5. User notified

**Response Time**: Immediate (automated)

### Rectification Requests
1. User submits correction request
2. Request logged in system
3. Admin reviews request
4. Correction made or explanation provided
5. User notified of outcome

**Response Time**: Within 30 days

---

## 🔧 Troubleshooting

### Cookie Consent Not Showing
- Check if `hasConsentDecision()` returns false
- Clear browser cookies and refresh
- Verify `CookieConsent` is rendered in App

### Data Export Fails
- Check user authentication
- Verify GDPR endpoint is registered
- Check database connection
- Review server logs for errors

### Account Deletion Fails
- Verify confirmation text matches exactly
- Check for database foreign key constraints
- Ensure session is valid
- Review server logs

---

## 📚 Additional Resources

### Legal
- [GDPR Official Text](https://gdpr.eu/)
- [CCPA Official Text](https://oag.ca.gov/privacy/ccpa)
- [SEC Investor Education](https://www.investor.gov/)

### Technical
- [Cookie Consent Best Practices](https://www.cookiebot.com/en/cookie-consent/)
- [OWASP Security Guidelines](https://owasp.org/)

### Templates
- [Termly Policy Generator](https://termly.io/)
- [Iubenda Privacy Tools](https://www.iubenda.com/)

---

## ⚖️ Legal Disclaimer

**IMPORTANT**: These documents and components are provided as templates only. They are **NOT** a substitute for professional legal advice.

You should:
1. ✅ Have a qualified attorney review all documents
2. ✅ Customize for your specific situation
3. ✅ Consider your jurisdiction's specific requirements
4. ✅ Update regularly as laws change

We are not responsible for your use of these templates or any legal issues arising from their use.

---

## 🤝 Contributing

Found an issue or have a suggestion? Contributions are welcome!

Please ensure any changes:
- Maintain legal accuracy
- Follow GDPR/CCPA guidelines
- Include clear documentation
- Are reviewed by legal counsel

---

## 📜 License

These templates are provided for use in your Investment Research Platform. Customize them as needed for your specific requirements.

---

## 📞 Support

For questions about this legal infrastructure:

- 📧 Implementation questions: Review the [Implementation Guide](./IMPLEMENTATION_GUIDE.md)
- ⚖️ Legal questions: Consult with a qualified attorney
- 🐛 Bug reports: Open an issue in your repository

---

**Remember**: Legal compliance is not a one-time task. Keep your documents updated as your platform evolves and regulations change.

Good luck with your platform! 🚀
