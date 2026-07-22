import Link from 'next/link';

export default function OrganizerPage() {
  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="container mx-auto px-4 max-w-5xl">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">Organizer Dashboard</h1>
        <div className="bg-blue-50 border-l-4 border-blue-500 p-6 rounded-lg">
          <p className="text-gray-700 mb-4">Use the Admin Dashboard to manage committees and coordinate events.</p>
          <Link href="/admin" className="inline-block px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
            Go to Admin Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
