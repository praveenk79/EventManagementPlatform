import Link from 'next/link';

export default function SpeakerPage() {
  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="container mx-auto px-4 max-w-5xl">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">Speaker Portal</h1>
        <div className="bg-blue-50 border-l-4 border-blue-500 p-6 rounded-lg">
          <p className="text-gray-700 mb-4">Speaker information and coordination coming soon. Contact admin for speaker details.</p>
          <Link href="/" className="inline-block px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
            Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}
