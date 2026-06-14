import { useEffect } from 'react';

// Public SMS Privacy Policy — no auth. Linked from the Twilio A2P 10DLC
// campaign registration (carriers open this URL and verify it contains the
// required disclosures: non-sharing of mobile numbers, message frequency, and
// "message and data rates may apply"). Keep this page reachable without login.
export default function SmsPrivacy() {
  useEffect(() => {
    document.title = 'SMS Privacy Policy — Skyeline Homes';
  }, []);

  return (
    <div style={{ minHeight: '100vh', background: '#fff', color: '#141414' }}>
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '48px 24px', fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif', lineHeight: 1.6 }}>
        <div style={{ borderBottom: '3px solid #C9A96E', paddingBottom: 16, marginBottom: 28 }}>
          <h1 style={{ fontSize: 26, margin: 0 }}>SMS Privacy Policy</h1>
          <p style={{ color: '#666', margin: '8px 0 0' }}>Skyeline Homes · Last updated June 13, 2026</p>
        </div>

        <p>
          This SMS Privacy Policy explains how Skyeline Homes ("Skyeline," "we,"
          "us") handles mobile phone numbers and text-message (SMS) communications
          for its construction-management notifications. It supplements any general
          privacy policy on <a href="https://skyelinehomes.com">skyelinehomes.com</a>.
        </p>

        <h2 style={{ fontSize: 18, marginTop: 28 }}>No sharing or selling of mobile numbers</h2>
        <p>
          <strong>We do not sell, rent, or share mobile phone numbers or SMS opt-in
          consent with third parties or affiliates for their marketing or
          promotional purposes.</strong> Mobile numbers are used solely by Skyeline
          Homes to deliver the notifications described below. We share numbers only
          with our SMS delivery provider (Twilio) strictly to transmit these
          messages, and only as required to operate the service.
        </p>

        <h2 style={{ fontSize: 18, marginTop: 28 }}>What we send and how often</h2>
        <p>
          With your consent, we send transactional, account-related text alerts tied
          to your relationship with Skyeline Homes — for example new-lead alerts to
          staff, bid invitations and bid-award confirmations to subcontractors,
          project and schedule updates, and due-date reminders.{' '}
          <strong>Message frequency varies</strong> based on project activity.
        </p>

        <h2 style={{ fontSize: 18, marginTop: 28 }}>Rates</h2>
        <p>
          <strong>Message and data rates may apply</strong> depending on your mobile
          carrier and plan. Skyeline Homes is not responsible for charges from your
          carrier.
        </p>

        <h2 style={{ fontSize: 18, marginTop: 28 }}>How consent is obtained</h2>
        <p>
          Subcontractors and clients provide their mobile number and agree to receive
          text alerts when Skyeline Homes staff add them to our management system
          during onboarding. Consent is recorded per contact. Consent to receive SMS
          is not a condition of any purchase or service.
        </p>

        <h2 style={{ fontSize: 18, marginTop: 28 }}>Opting out and help</h2>
        <p>
          You can opt out of text messages at any time by replying{' '}
          <strong>STOP</strong> to any message. You will receive one confirmation and
          then no further texts unless you re-subscribe by replying{' '}
          <strong>START</strong>. For help, reply <strong>HELP</strong> or contact
          your Skyeline Homes representative.
        </p>

        <h2 style={{ fontSize: 18, marginTop: 28 }}>Data security &amp; retention</h2>
        <p>
          Mobile numbers and consent records are stored securely and retained only as
          long as needed to operate the notification service and meet legal or
          recordkeeping obligations.
        </p>

        <h2 style={{ fontSize: 18, marginTop: 28 }}>Contact</h2>
        <p>
          Questions about this policy? Visit{' '}
          <a href="https://skyelinehomes.com">skyelinehomes.com</a> or contact your
          Skyeline Homes representative.
        </p>

        <p style={{ fontSize: 12, color: '#999', marginTop: 40, textAlign: 'center' }}>
          Skyeline Homes · Mapleton, Utah
        </p>
      </div>
    </div>
  );
}
