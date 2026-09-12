# Threat model — identity and authentication

The gateway strips forged identity headers and forwards signed context; the
auth service owns sessions, JWTs, OTP provider adapters, and abuse limits.
Risks include credential stuffing, session theft, OTP abuse, forged service
headers, and PII in logs. Controls are secure cookies/tokens, rate limiting,
signed internal context, secret rotation, redaction, step-up auth, and
negative authorization tests. Owner: Auth/Security.
