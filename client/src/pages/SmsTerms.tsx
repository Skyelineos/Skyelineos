import { useEffect } from 'react';

// Public SMS Terms of Service — no auth. Linked from the Twilio A2P 10DLC
// campaign registration alongside the SMS Privacy Policy. Carriers verify this
// URL is reachable and describes the messaging program, frequency, rates, and
// STOP/HELP behavior.
export default function SmsTerms() {
  useEffect(() => {
    document.title = 'SMS Terms of Service — Skyeline Homes';
  }, []);

  return (
    <div style={{ minHeight: '100vh', background: '#fff', color: '#141414' }}>
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '48px 24px', fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif', lineHeight: 1.6 }}>
        <div style={{ borderBottom: '3px solid #C9A96E', paddingBottom: 16, marginBottom: 28 }}>
          <h1 style={{ fontSize: 26, margin: 0 }}>SMS Terms of Service</h1>
          <p style={{ color: '#666', margin: '8px 0 0' }}>Skyeline Homes · Last updated June 13, 2026</p>
        </div>

        <p>
          By providing your mobile number and agreeing to receive text messages from
          Skyeline Homes ("Skyeline," "we," "us"), you agree to these SMS Terms of
          Service.
        </p>

        <h2 style={{ fontSize: 18, marginTop: 28 }}>Program description</h2>
        <p>
          Skyeline Homes sends transactional, account-related SMS notifications to
          subcontractors, clients, and staff who have opted in. Messages may include
          new-lead alerts, bid invitations, bid-award confirmations, project and
          schedule updates, and due-date reminders. Messages may contain links and
          phone numbers relevant to your project.
        </p>

        <h2 style={{ fontSize: 18, marginTop: 28 }}>Consent</h2>
        <p>
          You consent to receive texts when you provide your mobile number to Skyeline
          Homes staff during onboarding and agree to receive alerts. Consent is not a
          condition of any purchase or service.
        </p>

        <h2 style={{ fontSize: 18, marginTop: 28 }}>Message frequency</h2>
        <p><strong>Message frequency varies</strong> based on project activity.</p>

        <h2 style={{ fontSize: 18, marginTop: 28 }}>Costs</h2>
        <p>
          <strong>Message and data rates may apply.</strong> Such charges are billed
          by and payable to your mobile carrier. Skyeline Homes is not responsible for
          carrier charges.
        </p>

        <h2 style={{ fontSize: 18, marginTop: 28 }}>Opt-out and help</h2>
        <p>
          Reply <strong>STOP</strong> at any time to cancel. After replying STOP you
          will receive one confirmation message and no further texts unless you reply{' '}
          <strong>START</strong> to re-subscribe. Reply <strong>HELP</strong> for
          assistance, or contact your Skyeline Homes representative.
        </p>

        <h2 style={{ fontSize: 18, marginTop: 28 }}>Supported carriers &amp; delivery</h2>
        <p>
          Carriers are not liable for delayed or undelivered messages. Message
          delivery is subject to your carrier's network and is not guaranteed.
        </p>

        <h2 style={{ fontSize: 18, marginTop: 28 }}>Privacy</h2>
        <p>
          Your mobile number is handled per our{' '}
          <a href="https://skyelineos.web.app/sms-privacy">SMS Privacy Policy</a>. We
          do not sell or share mobile numbers or opt-in consent with third parties for
          marketing.
        </p>

        <h2 style={{ fontSize: 18, marginTop: 28 }}>Changes</h2>
        <p>
          We may update these terms from time to time. Continued participation after
          changes constitutes acceptance of the updated terms.
        </p>

        <p style={{ fontSize: 12, color: '#999', marginTop: 40, textAlign: 'center' }}>
          Skyeline Homes · Mapleton, Utah
        </p>
      </div>
    </div>
  );
}
