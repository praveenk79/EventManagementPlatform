import Link from 'next/link';

// Coming Soon - Will integrate with Supabase for real event schedule
export default function ProgramsPage() {
  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="container mx-auto px-4 max-w-5xl">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">Event Program</h1>
          <div className="bg-blue-50 border-l-4 border-blue-500 p-6 rounded-lg">
            <p className="text-gray-700 mb-4">The event program will be available after Supabase integration.</p>
            <p className="text-sm text-gray-600 mb-4">Coming features:</p>
            <ul className="list-disc list-inside text-gray-600 text-sm mb-6">
              <li>Complete event schedule</li>
              <li>Speaker information</li>
              <li>Real-time updates</li>
              <li>Session registration</li>
            </ul>
            <Link href="/" className="inline-block px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
              Back to Home
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
