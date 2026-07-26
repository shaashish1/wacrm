export default function TermsOfService() {
  return (
    <div className="max-w-4xl mx-auto py-12 px-6">
      <h1 className="text-3xl font-bold mb-6">Terms of Service</h1>
      <div className="prose dark:prose-invert max-w-none">
        <p className="mb-4">Last Updated: {new Date().toLocaleDateString()}</p>
        
        <h2 className="text-xl font-semibold mt-8 mb-4">1. Acceptance of Terms</h2>
        <p className="mb-4">
          By accessing or using our platform, you agree to be bound by these Terms of Service. If you do not agree with any part of these terms, you may not use our services.
        </p>

        <h2 className="text-xl font-semibold mt-8 mb-4">2. Unofficial API Risks (WWebJS)</h2>
        <p className="mb-4 font-semibold text-red-600 dark:text-red-400">
          IMPORTANT DISCLAIMER REGARDING WHATSAPP WEB JS (WWebJS):
        </p>
        <p className="mb-4">
          Our platform offers integration via WhatsApp Web JS (WWebJS). This relies on unofficial APIs. Meta actively monitors for automated behavior on personal or standard business accounts. <strong>Your number can be permanently banned</strong> if you send spam, unsolicited messages, or rapid bulk broadcasts. 
        </p>
        <p className="mb-4">
          By using the WWebJS provider, you acknowledge and accept all risks associated with unofficial integrations. We are not liable for any account bans, suspensions, or data loss resulting from your use of this integration. You agree to indemnify and hold us harmless from any claims arising from Meta's enforcement actions against your WhatsApp account.
        </p>

        <h2 className="text-xl font-semibold mt-8 mb-4">3. Acceptable Use Policy</h2>
        <p className="mb-4">
          You agree not to use the platform to send spam, unsolicited marketing messages (without opt-in), illegal content, or any material that violates the terms of service of underlying platforms (including WhatsApp). You are solely responsible for ensuring you have obtained explicit consent (opt-in) from recipients before sending automated messages.
        </p>

        <h2 className="text-xl font-semibold mt-8 mb-4">4. Limitation of Liability</h2>
        <p className="mb-4">
          To the maximum extent permitted by law, we shall not be liable for any indirect, incidental, special, consequential, or punitive damages, or any loss of profits or revenues, whether incurred directly or indirectly, or any loss of data, use, goodwill, or other intangible losses resulting from your use of the service.
        </p>

        <h2 className="text-xl font-semibold mt-8 mb-4">5. Governing Law</h2>
        <p className="mb-4">
          These Terms shall be governed by and construed in accordance with the laws of the jurisdiction in which our company is registered, without regard to its conflict of law provisions.
        </p>
      </div>
    </div>
  );
}
