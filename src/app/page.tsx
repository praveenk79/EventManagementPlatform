import Link from 'next/link';
import { Calendar, Users, Megaphone, ArrowRight } from 'lucide-react';

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      {/* Hero Section */}
      <div className="container mx-auto px-4 py-16">
        <div className="text-center max-w-4xl mx-auto">
          <h1 className="text-5xl md:text-6xl font-bold text-gray-900 mb-6">
            Tech Event Platform
          </h1>
          <p className="text-xl text-gray-600 mb-8">
            Single pane of glass for 500+ attendees and 12 organizing committees.
            Replace WhatsApp chaos with organized workflows.
          </p>
          
          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-16">
            <Link
              href="/programs"
              className="inline-flex items-center justify-center px-8 py-3 border border-transparent text-base font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 md:py-4 md:text-lg md:px-10"
            >
              View Program
              <ArrowRight className="ml-2 h-5 w-5" />
            </Link>
            <Link
              href="/admin"
              className="inline-flex items-center justify-center px-8 py-3 border border-transparent text-base font-medium rounded-md text-white bg-orange-600 hover:bg-orange-700 md:py-4 md:text-lg md:px-10"
            >
              Admin Dashboard
              <ArrowRight className="ml-2 h-5 w-5" />
            </Link>
            <Link
              href="/auth/login"
              className="inline-flex items-center justify-center px-8 py-3 border border-gray-300 text-base font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 md:py-4 md:text-lg md:px-10"
            >
              Sign In
            </Link>
          </div>
        </div>

        {/* Features Grid */}
        <div className="grid md:grid-cols-3 gap-8 mt-20">
          {/* Attendee Feature */}
          <div className="bg-white rounded-lg shadow-lg p-8 hover:shadow-xl transition-shadow">
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mb-4">
              <Calendar className="h-6 w-6 text-blue-600" />
            </div>
            <h3 className="text-xl font-semibold mb-3">For Attendees</h3>
            <p className="text-gray-600 mb-4">
              View complete event program, get real-time updates, session schedules,
              and venue information. Never miss important announcements.
            </p>
            <Link
              href="/programs"
              className="text-blue-600 hover:text-blue-700 font-medium inline-flex items-center"
            >
              View Program
              <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </div>

          {/* Admin Feature */}
          <div className="bg-white rounded-lg shadow-lg p-8 hover:shadow-xl transition-shadow">
            <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center mb-4">
              <Users className="h-6 w-6 text-orange-600" />
            </div>
            <h3 className="text-xl font-semibold mb-3">For Admin</h3>
            <p className="text-gray-600 mb-4">
              Single pane of glass to oversee all 12 committees. Track progress,
              manage cross-committee tasks, and coordinate the entire event.
            </p>
            <Link
              href="/admin"
              className="text-orange-600 hover:text-orange-700 font-medium inline-flex items-center"
            >
              Admin Dashboard
              <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </div>

          {/* Committee Feature */}
          <div className="bg-white rounded-lg shadow-lg p-8 hover:shadow-xl transition-shadow">
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mb-4">
              <Megaphone className="h-6 w-6 text-green-600" />
            </div>
            <h3 className="text-xl font-semibold mb-3">For Committee Members</h3>
            <p className="text-gray-600 mb-4">
              Committee leads and members can manage tasks, upload files,
              coordinate with other committees, and track their progress.
            </p>
            <Link
              href="/organizer"
              className="text-green-600 hover:text-green-700 font-medium inline-flex items-center"
            >
              Committee Portal
              <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </div>
        </div>

        {/* Stats Section */}
        <div className="mt-20 bg-blue-600 rounded-2xl p-12 text-white">
          <div className="grid md:grid-cols-4 gap-8 text-center">
            <div>
              <div className="text-4xl font-bold mb-2">500+</div>
              <div className="text-blue-100">Attendees</div>
            </div>
            <div>
              <div className="text-4xl font-bold mb-2">12</div>
              <div className="text-blue-100">Committees</div>
            </div>
            <div>
              <div className="text-4xl font-bold mb-2">40+</div>
              <div className="text-blue-100">Team Members</div>
            </div>
            <div>
              <div className="text-4xl font-bold mb-2">150+</div>
              <div className="text-blue-100">Tasks</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
