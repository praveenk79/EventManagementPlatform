'use client';

import Link from 'next/link';
import { Plus, Copy, Calendar, Users, CheckSquare, Settings, Archive } from 'lucide-react';

export default function EventsManagementPage() {
  const events = [
    {
      id: 1,
      name: 'Tech Summit 2026',
      type: 'annual',
      date: '2026-08-15',
      status: 'active',
      committees: 12,
      tasks: 152,
      progress: 66,
      isTemplate: false,
    },
    {
      id: 2,
      name: 'Q1 Chapter Meeting',
      type: 'quarterly',
      date: '2026-03-20',
      status: 'completed',
      committees: 8,
      tasks: 45,
      progress: 100,
      isTemplate: false,
    },
    {
      id: 3,
      name: 'Q2 Chapter Meeting',
      type: 'quarterly',
      date: '2026-06-15',
      status: 'active',
      committees: 8,
      tasks: 42,
      progress: 75,
      isTemplate: false,
    },
    {
      id: 4,
      name: 'Annual Tech Conference Template',
      type: 'template',
      date: null,
      status: 'template',
      committees: 12,
      tasks: 150,
      progress: 0,
      isTemplate: true,
    },
    {
      id: 5,
      name: 'Quarterly Meeting Template',
      type: 'template',
      date: null,
      status: 'template',
      committees: 8,
      tasks: 40,
      progress: 0,
      isTemplate: true,
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="container mx-auto px-4 max-w-7xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-bold text-gray-900 mb-2">Event Management</h1>
            <p className="text-gray-600">Manage annual conferences and quarterly meetings</p>
          </div>
          <button
            disabled
            className="px-6 py-3 bg-gray-400 text-white rounded-lg font-medium flex items-center gap-2 cursor-not-allowed opacity-60"
          >
            <Plus className="h-5 w-5" />
            Create New Event (Coming Soon)
          </button>
        </div>

        {/* Event Types */}
        <div className="grid md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900">Annual Events</h3>
              <Calendar className="h-5 w-5 text-blue-600" />
            </div>
            <div className="text-3xl font-bold text-blue-600 mb-2">1</div>
            <p className="text-sm text-gray-600">Major conferences per year</p>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900">Quarterly Events</h3>
              <Calendar className="h-5 w-5 text-green-600" />
            </div>
            <div className="text-3xl font-bold text-green-600 mb-2">4</div>
            <p className="text-sm text-gray-600">Chapter meetings per year</p>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900">Templates</h3>
              <Copy className="h-5 w-5 text-purple-600" />
            </div>
            <div className="text-3xl font-bold text-purple-600 mb-2">2</div>
            <p className="text-sm text-gray-600">Reusable event templates</p>
          </div>
        </div>

        {/* Active Events */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Active Events</h2>
          <div className="bg-white rounded-lg shadow overflow-hidden">
            {events.filter(e => e.status === 'active').map(event => (
              <div key={event.id} className="p-6 border-b last:border-b-0 hover:bg-gray-50">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-xl font-semibold text-gray-900">{event.name}</h3>
                      <span className={`text-xs px-2 py-1 rounded font-medium ${
                        event.type === 'annual' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'
                      }`}>
                        {event.type === 'annual' ? 'Annual Conference' : 'Quarterly Meeting'}
                      </span>
                    </div>
                    <div className="flex items-center gap-6 text-sm text-gray-600">
                      <div className="flex items-center gap-1">
                        <Calendar className="h-4 w-4" />
                        {event.date}
                      </div>
                      <div className="flex items-center gap-1">
                        <Users className="h-4 w-4" />
                        {event.committees} committees
                      </div>
                      <div className="flex items-center gap-1">
                        <CheckSquare className="h-4 w-4" />
                        {event.tasks} tasks
                      </div>
                    </div>
                    <div className="mt-3">
                      <div className="flex items-center gap-3">
                        <div className="flex-1 bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-blue-600 h-2 rounded-full"
                            style={{ width: `${event.progress}%` }}
                          ></div>
                        </div>
                        <span className="text-sm font-medium text-gray-900">{event.progress}%</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2 ml-6">
                    <Link
                      href={`/admin?event=${event.id}`}
                      className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                    >
                      View Dashboard
                    </Link>
                    <button className="px-4 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200">
                      <Settings className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Templates */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Event Templates</h2>
          <div className="grid md:grid-cols-2 gap-6">
            {events.filter(e => e.isTemplate).map(template => (
              <div key={template.id} className="bg-white rounded-lg shadow p-6">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">{template.name}</h3>
                    <div className="flex items-center gap-4 text-sm text-gray-600">
                      <div className="flex items-center gap-1">
                        <Users className="h-4 w-4" />
                        {template.committees} committees
                      </div>
                      <div className="flex items-center gap-1">
                        <CheckSquare className="h-4 w-4" />
                        {template.tasks} tasks
                      </div>
                    </div>
                  </div>
                  <Copy className="h-5 w-5 text-purple-600" />
                </div>
                <div className="space-y-2">
                  <button className="w-full px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 font-medium">
                    Create Event from Template
                  </button>
                  <button className="w-full px-4 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200">
                    Edit Template
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Completed Events */}
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center gap-2">
            <Archive className="h-6 w-6" />
            Past Events
          </h2>
          <div className="bg-white rounded-lg shadow overflow-hidden">
            {events.filter(e => e.status === 'completed').map(event => (
              <div key={event.id} className="p-6 border-b last:border-b-0">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-1">{event.name}</h3>
                    <div className="flex items-center gap-4 text-sm text-gray-600">
                      <div className="flex items-center gap-1">
                        <Calendar className="h-4 w-4" />
                        {event.date}
                      </div>
                      <span className="text-green-600 font-medium">✓ Completed</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 flex items-center gap-2">
                      <Copy className="h-4 w-4" />
                      Clone for 2027
                    </button>
                    <button className="px-4 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200">
                      View Archive
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
