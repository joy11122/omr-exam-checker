# Phase 7 — Result publishing and student portal

## Email provider setup

Student result release uses the Resend email API. Configure these server-only variables in the web app's deployment environment:

- `RESEND_API_KEY`: Resend API key with permission to send email.
- `RESULTS_FROM_EMAIL`: sender address on a domain verified in Resend, e.g. `OMR Exam Checker <results@yourdomain.com>`.
- `APP_URL`: canonical public HTTPS URL of the deployed app (required to generate correct student links).

Never expose the API key with a `NEXT_PUBLIC_` prefix. Restart/redeploy after adding variables.

## Publishing workflow

1. Complete grading and review the latest calculated results.
2. Ensure every candidate in the exam has a valid email address in the institution's student directory.
3. Configure and verify the Resend sender domain and deployment URL.
4. Use **Publish & notify** from the Results workspace.
5. The system performs a preflight check before changing publication state. Missing email addresses or missing provider configuration stop publication before any candidate result is released.
6. Latest result snapshots are published in batches of 20. Students receive one-time email access links.
7. Failed deliveries are shown in the result notification status. Run publication again to retry notifications.

## Student access and privacy

- The email link is valid for 30 minutes and is single-use.
- Opening the link only shows a confirmation page. A deliberate POST exchanges it, so ordinary email link-preview scanners do not consume the token.
- The link is stored as a SHA-256 hash in MongoDB.
- Successful exchange creates a random opaque session stored hashed in MongoDB and an HttpOnly, SameSite=Lax cookie.
- Student portal sessions expire after 30 days. Sign-out revokes the stored session.
- Student result queries require the exact institution ID, student ID, result ID, and published state. Students cannot enumerate or view another student's result.
- Student portal pages are excluded from search indexing.

## Operational acceptance checks

- Set Resend environment variables and verify the sender domain before deployment.
- Add a test student with an email address you control.
- Grade a test exam, publish it, and verify the email, one-time link, session cookie, result list, and detailed result page.
- Verify a used or expired link cannot create another session.
- Verify a student cannot open another student's result by changing the URL.
- Verify an institution user without examiner access receives 403 from the publication endpoint.
- Verify missing email preflight blocks publication without publishing any result.
- Verify failed email delivery is recorded and can be retried by publishing again.

## Scope notes

Email is the implemented notification channel in this phase. SMS and WhatsApp providers are not configured or represented as completed. Real delivery depends on Resend account/domain verification and production environment variables.