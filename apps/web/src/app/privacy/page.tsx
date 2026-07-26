export default function PrivacyPolicy() {
  return (
    <div className="max-w-4xl mx-auto py-12 px-6">
      <h1 className="text-3xl font-bold mb-6">Privacy Policy</h1>
      <div className="prose dark:prose-invert max-w-none">
        <p className="mb-4">Last Updated: {new Date().toLocaleDateString()}</p>
        
        <h2 className="text-xl font-semibold mt-8 mb-4">1. Information We Collect</h2>
        <p className="mb-4">
          We collect information you provide directly to us, including but not limited to: your name, email address, phone number, and any data you import into our CRM (e.g., your contacts' information and message history).
        </p>

        <h2 className="text-xl font-semibold mt-8 mb-4">2. How We Use Your Information</h2>
        <p className="mb-4">
          We use the information we collect to operate our platform, facilitate messaging via WhatsApp, provide customer support, and improve our services.
        </p>

        <h2 className="text-xl font-semibold mt-8 mb-4">3. Third-Party Service Providers</h2>
        <p className="mb-4">
          We may share your data with trusted third-party service providers (subprocessors) to facilitate our services. These include:
        </p>
        <ul className="list-disc pl-6 mb-4 space-y-2">
          <li><strong>Supabase:</strong> For database hosting and authentication.</li>
          <li><strong>Stripe:</strong> For payment processing.</li>
          <li><strong>OpenAI / Anthropic:</strong> For generating AI auto-replies (if enabled by you). Your data is NOT used to train their models.</li>
          <li><strong>Meta:</strong> When utilizing the official Cloud API for messaging.</li>
        </ul>

        <h2 className="text-xl font-semibold mt-8 mb-4">4. Data Retention and Deletion (GDPR)</h2>
        <p className="mb-4">
          You have the right to request access to or deletion of your personal data at any time. When you delete your account, we will permanently remove your PII and all associated CRM contacts from our active databases within 30 days.
        </p>

        <h2 className="text-xl font-semibold mt-8 mb-4">5. Contact Us</h2>
        <p className="mb-4">
          If you have any questions or concerns about this Privacy Policy or our data practices, please contact us at support@example.com.
        </p>
      </div>
    </div>
  );
}
