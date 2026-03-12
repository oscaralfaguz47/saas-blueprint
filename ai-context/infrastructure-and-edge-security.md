# Infrastructure and Edge Security

## Purpose

Defines infrastructure-level protections against large-scale attacks and abuse.

## Scope

Applies to:

- CDN
- hosting infrastructure
- edge network
- deployment platform

---

# Core Security Rules

## 1. DDoS Protection

The platform must use upstream DDoS protection.

Examples:

- CDN-level mitigation
- provider-level DDoS filtering

---

## 2. Web Application Firewall (WAF)

A WAF should inspect incoming traffic and block malicious requests.

Common protections include:

- SQL injection detection
- request flooding
- bot traffic

---

## 3. Bot Protection

Detect automated abuse patterns.

Mitigation strategies:

- rate limiting
- IP reputation scoring
- bot detection

---

## 4. Security Headers

Applications must enforce secure HTTP headers.

Examples:
Content-Security-Policy
X-Frame-Options
X-Content-Type-Options
Strict-Transport-Security
Referrer-Policy
Permissions-Policy

---

## 5. HTTPS Enforcement

All traffic must be encrypted.

Rules:

- HTTPS only
- secure cookies
- HSTS enabled

---

## Related Documents

- ../GEMINI.md
