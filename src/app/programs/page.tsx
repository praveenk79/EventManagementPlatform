import Link from 'next/link';
import { Clock, MapPin, Mic, Coffee, Users, Trophy } from 'lucide-react';

const schedule = [
  {
    day: 'Day 1',
    date: 'August 15, 2026',
    sessions: [
      { time: '8:00 AM', duration: '60 min', title: 'Registration & Breakfast', type: 'break', location: 'Grand Ballroom Foyer' },
      { time: '9:00 AM', duration: '90 min', title: 'Opening Ceremony & Keynote Address', type: 'keynote', location: 'Grand Ballroom A' },
      { time: '10:30 AM', duration: '30 min', title: 'Networking Break', type: 'break' },
      { time: '11:00 AM', duration: '90 min', title: 'Youth Leadership Panel', type: 'panel', location: 'Hall B' },
      { time: '12:30 PM', duration: '90 min', title: 'Lunch & Networking', type: 'break', location: 'Dining Hall' },
      { time: '2:00 PM', duration: '120 min', title: 'Committee Breakout Sessions', type: 'workshop', location: 'Multiple Rooms' },
      { time: '4:00 PM', duration: '60 min', title: 'Award Nominations Workshop', type: 'workshop', location: 'Hall C' },
      { time: '7:00 PM', duration: '180 min', title: 'Welcome Dinner & Reception', type: 'social', location: 'Rooftop Garden' },
    ],
  },
  {
    day: 'Day 2',
    date: 'August 16, 2026',
    sessions: [
      { time: '8:30 AM', duration: '60 min', title: 'Breakfast', type: 'break', location: 'Grand Ballroom Foyer' },
      { time: '9:30 AM', duration: '90 min', title: 'Technology & Innovation Track', type: 'session', location: 'Hall A' },
      { time: '11:00 AM', duration: '60 min', title: 'Speaker Series: Industry Leaders', type: 'keynote', location: 'Grand Ballroom A' },
      { time: '12:30 PM', duration: '90 min', title: 'Lunch', type: 'break', location: 'Dining Hall' },
      { time: '2:00 PM', duration: '120 min', title: 'Awards Ceremony', type: 'ceremony', location: 'Grand Ballroom' },
      { time: '4:30 PM', duration: '30 min', title: 'Closing Remarks', type: 'keynote', location: 'Grand Ballroom' },
      { time: '6:00 PM', duration: '180 min', title: 'Executive Dinner', type: 'social', location: 'Private Dining Room' },
    ],
  },
];

const typeConfig: Record<string, { color: string; icon: React.ReactNode }> = {
  keynote: { color: 'bg-blue-50 border-blue-200 text-blue-700', icon: <Mic className="h-3.5 w-3.5" /> },
  panel:   { color: 'bg-purple-50 border-purple-200 text-purple-700', icon: <Users className="h-3.5 w-3.5" /> },
  workshop:{ color: 'bg-amber-50 border-amber-200 text-amber-700', icon: <Users className="h-3.5 w-3.5" /> },
  session: { color: 'bg-indigo-50 border-indigo-200 text-indigo-700', icon: <Mic className="h-3.5 w-3.5" /> },
  ceremony:{ color: 'bg-yellow-50 border-yellow-200 text-yellow-700', icon: <Trophy className="h-3.5 w-3.5" /> },
  social:  { color: 'bg-green-50 border-green-200 text-green-700', icon: <Users className="h-3.5 w-3.5" /> },
  break:   { color: 'bg-gray-50 border-gray-200 text-gray-500', icon: <Coffee className="h-3.5 w-3.5" /> },
};

export default function ProgramsPage() {
  return (
    <div className="min-h-screen bg-gray-50 py-10">
      <div className="container mx-auto px-4 max-w-4xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Event Program</h1>
          <p className="text-gray-500 mt-1">Tech Summit 2026 · August 15–16, 2026</p>
        </div>

        <div className="space-y-10">
          {schedule.map((day) => (
            <div key={day.day}>
              <div className="flex items-center gap-3 mb-4">
                <div className="bg-blue-600 text-white text-sm font-semibold px-3 py-1 rounded-full">{day.day}</div>
                <span className="text-gray-500 text-sm">{day.date}</span>
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                {day.sessions.map((session, i) => {
                  const config = typeConfig[session.type] ?? typeConfig.break;
                  return (
                    <div key={i} className={`flex gap-4 px-6 py-4 ${i < day.sessions.length - 1 ? 'border-b border-gray-100' : ''}`}>
                      <div className="w-20 shrink-0 text-right">
                        <div className="text-sm font-medium text-gray-900">{session.time}</div>
                        <div className="text-xs text-gray-400 mt-0.5 flex items-center justify-end gap-0.5">
                          <Clock className="h-3 w-3" />{session.duration}
                        </div>
                      </div>
                      <div className="w-px bg-gray-100 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-sm font-medium text-gray-900">{session.title}</p>
                          <span className={`shrink-0 flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border ${config.color}`}>
                            {config.icon}
                            {session.type.charAt(0).toUpperCase() + session.type.slice(1)}
                          </span>
                        </div>
                        {session.location && (
                          <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                            <MapPin className="h-3 w-3" />{session.location}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-8 text-center">
          <Link href="/" className="text-sm text-blue-600 hover:text-blue-700 font-medium">← Back to Home</Link>
        </div>
      </div>
    </div>
  );
}

