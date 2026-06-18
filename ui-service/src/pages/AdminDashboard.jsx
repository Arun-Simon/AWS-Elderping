import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Calendar, AlertTriangle, FileText, HeartPulse, LogOut, Search } from 'lucide-react';

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('users');
  const [userProfile, setUserProfile] = useState(null);
  const [users, setUsers] = useState([
    { id: '1', username: 'grandma', role: 'ELDER', email: 'grandma@elderpinq.com', invite_code: 'DEMO-123' },
    { id: '2', username: 'daughter', role: 'FAMILY', email: 'daughter@elderpinq.com', invite_code: null },
    { id: '3', username: 'dr_smith', role: 'ADMIN', email: 'smith@elderpinq.com', invite_code: null }
  ]);
  const [appointments, setAppointments] = useState([
    { id: '1', elder_id: '1', doctor_name: 'Dr. Jones', clinic_name: 'Heart Clinic', scheduled_at: '2026-06-20T10:00:00Z', status: 'scheduled' },
    { id: '2', elder_id: '1', doctor_name: 'Dr. Smith', clinic_name: 'General Hospital', scheduled_at: '2026-06-25T14:30:00Z', status: 'scheduled' }
  ]);
  const [alerts, setAlerts] = useState([
    { id: '1', user_id: '1', alert_type: 'CRITICAL_VITALS', severity: 'CRITICAL', message: 'Blood pressure spike detected: 165/105 mmHg', is_resolved: false, created_at: '2026-06-17T09:00:00Z' }
  ]);

  useEffect(() => {
    const raw = localStorage.getItem('user');
    if (!raw) {
      navigate('/login');
      return;
    }
    const user = JSON.parse(raw);
    if (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') {
      navigate('/login');
    }
    setUserProfile(user);
  }, [navigate]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  const resolveAlert = (id) => {
    setAlerts(prev => prev.map(a => a.id === id ? { ...a, is_resolved: true } : a));
  };

  return (
    <div className="min-h-screen bg-gray-50 flex font-sans">
      {/* Sidebar */}
      <aside className="w-80 bg-slate-900 text-white flex flex-col justify-between p-6 shadow-xl">
        <div>
          <div className="flex items-center gap-3 mb-10">
            <HeartPulse className="w-10 h-10 text-cyan-400" />
            <h1 className="text-2xl font-bold tracking-tight">ElderPinq Ops</h1>
          </div>

          <nav className="space-y-4">
            <button
              onClick={() => setActiveTab('users')}
              className={`w-full flex items-center gap-4 px-4 py-3 rounded-xl text-lg font-medium transition-colors ${activeTab === 'users' ? 'bg-cyan-500 text-white' : 'text-slate-400 hover:bg-slate-800'}`}
            >
              <Users className="w-6 h-6" /> User Directory
            </button>
            <button
              onClick={() => setActiveTab('appointments')}
              className={`w-full flex items-center gap-4 px-4 py-3 rounded-xl text-lg font-medium transition-colors ${activeTab === 'appointments' ? 'bg-cyan-500 text-white' : 'text-slate-400 hover:bg-slate-800'}`}
            >
              <Calendar className="w-6 h-6" /> Operations Schedule
            </button>
            <button
              onClick={() => setActiveTab('alerts')}
              className={`w-full flex items-center gap-4 px-4 py-3 rounded-xl text-lg font-medium transition-colors ${activeTab === 'alerts' ? 'bg-cyan-500 text-white' : 'text-slate-400 hover:bg-slate-800'}`}
            >
              <AlertTriangle className="w-6 h-6" /> Health Alerts
            </button>
          </nav>
        </div>

        <div>
          <div className="border-t border-slate-800 pt-6 mb-6">
            <div className="text-sm text-slate-400">Signed In As</div>
            <div className="font-semibold">{userProfile?.username || 'Admin'}</div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full bg-red-600/20 hover:bg-red-600 text-red-400 hover:text-white flex items-center justify-center gap-3 py-3 rounded-xl transition-all"
          >
            <LogOut className="w-5 h-5" /> Logout
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 p-10 overflow-y-auto">
        <header className="mb-10 flex justify-between items-center">
          <div>
            <h2 className="text-4xl font-extrabold text-slate-800 tracking-tight">Operations Dashboard</h2>
            <p className="text-slate-500 mt-2 text-lg">Manage patient schedules, active warning indicators, and clinician portals.</p>
          </div>
        </header>

        {activeTab === 'users' && (
          <section className="bg-white rounded-3xl p-8 shadow-sm border border-slate-100">
            <h3 className="text-2xl font-bold mb-6 text-slate-800">System Users</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 text-slate-400 uppercase text-sm font-semibold">
                    <th className="py-4">Username</th>
                    <th className="py-4">Role</th>
                    <th className="py-4">Email</th>
                    <th className="py-4">Invite Code</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 text-slate-700 text-lg">
                  {users.map(u => (
                    <tr key={u.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="py-4 font-medium">{u.username}</td>
                      <td className="py-4">
                        <span className={`px-3 py-1 rounded-full text-sm font-bold ${u.role === 'ELDER' ? 'bg-indigo-50 text-indigo-600' : u.role === 'ADMIN' ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'}`}>
                          {u.role}
                        </span>
                      </td>
                      <td className="py-4 text-slate-500">{u.email}</td>
                      <td className="py-4 font-mono text-cyan-600">{u.invite_code || 'N/A'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {activeTab === 'appointments' && (
          <section className="bg-white rounded-3xl p-8 shadow-sm border border-slate-100">
            <h3 className="text-2xl font-bold mb-6 text-slate-800">Active Care Operations</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 text-slate-400 uppercase text-sm font-semibold">
                    <th className="py-4">Practitioner</th>
                    <th className="py-4">Clinic Location</th>
                    <th className="py-4">Scheduled Date</th>
                    <th className="py-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 text-slate-700 text-lg">
                  {appointments.map(a => (
                    <tr key={a.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="py-4 font-medium">{a.doctor_name}</td>
                      <td className="py-4 text-slate-500">{a.clinic_name}</td>
                      <td className="py-4">{new Date(a.scheduled_at).toLocaleString()}</td>
                      <td className="py-4">
                        <span className="bg-emerald-50 text-emerald-600 px-3 py-1 rounded-full text-sm font-bold uppercase">
                          {a.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {activeTab === 'alerts' && (
          <section className="bg-white rounded-3xl p-8 shadow-sm border border-slate-100">
            <h3 className="text-2xl font-bold mb-6 text-slate-800">Critical Patient Alerts</h3>
            <div className="space-y-6">
              {alerts.map(a => (
                <div key={a.id} className={`p-6 rounded-2xl border flex items-center justify-between transition-all ${a.is_resolved ? 'bg-slate-50 border-slate-200' : 'bg-red-50/60 border-red-200'}`}>
                  <div>
                    <div className="flex items-center gap-3 mb-2">
                      <span className={`px-3 py-1 rounded-full text-xs font-black uppercase ${a.is_resolved ? 'bg-slate-200 text-slate-600' : 'bg-red-600 text-white'}`}>
                        {a.severity}
                      </span>
                      <span className="text-sm text-slate-500">{new Date(a.created_at).toLocaleString()}</span>
                    </div>
                    <p className={`text-xl font-semibold ${a.is_resolved ? 'text-slate-500 line-through' : 'text-slate-800'}`}>{a.message}</p>
                  </div>
                  {!a.is_resolved && (
                    <button
                      onClick={() => resolveAlert(a.id)}
                      className="bg-red-600 hover:bg-red-700 text-white font-bold px-6 py-3 rounded-xl transition-all shadow-md hover:shadow-lg"
                    >
                      Resolve Warning
                    </button>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
