import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, Pill, HeartPulse, LogOut, Clock, User, Smile, Users, Activity } from 'lucide-react';
import { getCachedUser, logout, getLinkedFamily } from '../api/authApi';
import { checkIn, logVitals } from '../api/healthApi';
import { 
  getElderDashboard, 
  getTimeline, 
  uploadDocument, 
  downloadDocument, 
  deleteDocument 
} from '../api/healthApi';
import { markTaken } from '../api/reminderApi';
import {
  RiskScoreWidget,
  HealthSummaryWidget,
  MedicationWidget,
  AppointmentWidget,
  TimelineWidget,
  DocumentWidget
} from '../components/DashboardWidgets';

export default function ElderDashboard() {
  const navigate = useNavigate();
  const user = getCachedUser();

  const [reminders, setReminders]         = useState([]);
  const [linkedFamily, setLinkedFamily]   = useState([]);
  const [checkedIn, setCheckedIn]         = useState(false);
  const [checkInLoading, setCheckInLoading] = useState(false);
  const [vitalsLoading, setVitalsLoading]   = useState(false);
  const [medLoading, setMedLoading]       = useState(null);
  const [statusMessage, setStatusMessage] = useState('');
  const [statusType, setStatusType]       = useState('success');
  const [time, setTime]                   = useState(new Date());
  
  // BFF Consolidated Dashboard State
  const [dashboardData, setDashboardData] = useState(null);
  const [timeline, setTimeline]           = useState([]);
  const [loading, setLoading]             = useState(true);
  const [dashboardError, setDashboardError] = useState('');
  const [uploadLoading, setUploadLoading] = useState(false);

  // Vitals form
  const [vitalsForm, setVitalsForm] = useState({ heartRate: '', bloodPressure: '' });

  // Redirect if not logged in or wrong role
  useEffect(() => {
    if (!user || user.role !== 'elder') {
      navigate('/login', { replace: true });
    }
  }, []);

  // Live clock
  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Load consolidated BFF data
  const fetchDashboardData = async (showPulse = false) => {
    if (!user?.id) return;
    if (showPulse) setLoading(true);
    setDashboardError('');
    try {
      const [data, timelineEvents] = await Promise.all([
        getElderDashboard(user.id),
        getTimeline(user.id)
      ]);
      setDashboardData(data);
      setTimeline(timelineEvents);
      if (data?.medicationStatus?.reminders) {
        setReminders(data.medicationStatus.reminders);
      }
    } catch (err) {
      setDashboardError(err.message || 'Failed to load dashboard data.');
    } finally {
      setLoading(false);
    }
  };

  // On mount or when id changes
  useEffect(() => {
    if (!user?.id) return;
    fetchDashboardData(true);
    getLinkedFamily()
      .then(setLinkedFamily)
      .catch(console.error);
  }, [user?.id]);

  const showStatus = (msg, type = 'success') => {
    setStatusMessage(msg);
    setStatusType(type);
    setTimeout(() => setStatusMessage(''), 4500);
  };

  const handleCheckIn = async () => {
    setCheckInLoading(true);
    try {
      await checkIn(user.id, 'feeling_well');
      setCheckedIn(true);
      showStatus('✅ Check-in recorded! Your family has been notified.', 'success');
      await fetchDashboardData(); // Automatic refresh
    } catch (err) {
      showStatus(`⚠️ ${err.message}`, 'error');
    } finally {
      setCheckInLoading(false);
    }
  };

  const handleLogVitals = async (e) => {
    e.preventDefault();
    if (!vitalsForm.heartRate || !vitalsForm.bloodPressure) return;
    setVitalsLoading(true);
    try {
      await logVitals(user.id, parseInt(vitalsForm.heartRate), vitalsForm.bloodPressure);
      setVitalsForm({ heartRate: '', bloodPressure: '' });
      showStatus('💓 Vitals successfully recorded!', 'success');
      await fetchDashboardData(); // Automatic refresh
    } catch (err) {
      showStatus(`⚠️ ${err.message}`, 'error');
    } finally {
      setVitalsLoading(false);
    }
  };

  const handleMedTaken = async (reminder) => {
    setMedLoading(reminder.id);
    try {
      await markTaken(reminder.id);
      showStatus(`💊 "${reminder.medication_name}" marked as taken!`, 'success');
      await fetchDashboardData(); // Refresh data to update adherence & logs
    } catch (err) {
      showStatus(`⚠️ ${err.message}`, 'error');
    } finally {
      setMedLoading(null);
    }
  };

  const handleUploadDocument = async (formData) => {
    setUploadLoading(true);
    try {
      await uploadDocument(formData);
      showStatus('📁 Medical document uploaded successfully!', 'success');
      await fetchDashboardData();
      return true;
    } catch (err) {
      showStatus(`⚠️ Document upload failed: ${err.message}`, 'error');
      return false;
    } finally {
      setUploadLoading(false);
    }
  };

  const handleDownloadDocument = async (doc) => {
    try {
      const res = await downloadDocument(doc.id);
      if (res.downloadUrl) {
        const link = document.createElement('a');
        link.href = res.downloadUrl;
        link.setAttribute('download', res.fileName || doc.file_name);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        showStatus('📥 Download started!', 'success');
      } else {
        throw new Error('Download URL not returned from the server.');
      }
    } catch (err) {
      showStatus(`⚠️ Download failed: ${err.message}`, 'error');
    }
  };

  const handleDeleteDocument = async (doc) => {
    try {
      await deleteDocument(doc.id);
      showStatus('🗑️ Document deleted successfully!', 'success');
      await fetchDashboardData();
    } catch (err) {
      showStatus(`⚠️ Deletion failed: ${err.message}`, 'error');
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const timeStr = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const dateStr = time.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-pink-50 font-sans pb-10">
      {/* Header */}
      <header className="bg-gradient-to-r from-indigo-900 via-purple-900 to-indigo-900 text-white px-6 py-5 flex items-center justify-between shadow-xl relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-pink-500 to-indigo-500"></div>
        <div className="flex items-center gap-3 relative z-10">
          <HeartPulse className="w-10 h-10 text-pink-400" />
          <span className="text-3xl font-extrabold tracking-tight drop-shadow-md">ElderPing</span>
        </div>
        <div className="flex items-center gap-6 relative z-10">
          <div className="text-right hidden sm:block">
            <p className="text-2xl font-bold tracking-tight">{timeStr}</p>
            <p className="text-indigo-200 text-sm font-medium">{dateStr}</p>
          </div>
          <button
            id="logout-btn"
            onClick={handleLogout}
            className="flex items-center gap-2 bg-white/10 hover:bg-white/20 backdrop-blur-md px-5 py-2.5 rounded-xl text-lg font-semibold transition-all shadow-md hover:shadow-lg border border-white/20"
          >
            <LogOut className="w-5 h-5" /> Sign Out
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* Welcome */}
        <div className="bg-white/80 backdrop-blur-lg rounded-[2rem] shadow-xl p-8 mb-8 flex items-center justify-between border border-white/60">
          <div className="flex items-center gap-5">
            <div className="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl p-4 shadow-lg">
              <User className="w-10 h-10 text-white" />
            </div>
            <div>
              <p className="text-indigo-600 font-bold uppercase tracking-widest text-sm mb-1">Welcome Back</p>
              <h1 className="text-4xl font-extrabold text-gray-900 drop-shadow-sm capitalize">{user?.username || 'Friend'}</h1>
              {user?.invite_code && (
                <div className="mt-2 inline-flex items-center gap-2 bg-indigo-50 border border-indigo-200 px-3 py-1.5 rounded-lg shadow-sm">
                  <span className="text-xs font-bold text-indigo-500 uppercase">Invite Code:</span>
                  <span className="text-sm font-mono font-extrabold text-indigo-800 tracking-wider">{user.invite_code}</span>
                </div>
              )}
            </div>
          </div>
          
          <div className="hidden md:flex flex-col items-end">
            <p className="text-sm font-bold text-gray-500 flex items-center gap-2 mb-2">
              <Users className="w-4 h-4" /> Monitored By
            </p>
            <div className="flex -space-x-2">
              {linkedFamily.length > 0 ? (
                linkedFamily.map((f, i) => (
                  <div key={f.id} className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 border-2 border-white flex items-center justify-center text-white font-bold shadow-md z-10" style={{ zIndex: 10 - i }} title={f.username}>
                    {f.username.charAt(0).toUpperCase()}
                  </div>
                ))
              ) : (
                <span className="text-sm text-gray-400 bg-gray-100 px-3 py-1 rounded-full">None</span>
              )}
            </div>
          </div>
        </div>

        {/* Status Banner */}
        {statusMessage && (
          <div className={`mb-6 rounded-2xl p-5 text-xl font-semibold text-center ${
            statusType === 'success'
              ? 'bg-green-100 text-green-800 border-2 border-green-400'
              : 'bg-red-100 text-red-800 border-2 border-red-400'
          }`}>
            {statusMessage}
          </div>
        )}

        {dashboardError && (
          <div className="mb-6 bg-red-100 border-2 border-red-400 text-red-800 rounded-2xl p-5 text-lg font-semibold text-center">
            ⚠️ {dashboardError}
          </div>
        )}

        {loading && !dashboardData ? (
          <div className="flex flex-col items-center justify-center py-20 text-indigo-600 gap-3">
            <span className="animate-spin w-16 h-16 border-4 border-indigo-600/30 border-t-indigo-600 rounded-full" />
            <p className="text-xl font-bold">Loading dashboard details...</p>
          </div>
        ) : (
          <div className="space-y-8">
            {/* BIG Check-In Button & Vitals Form */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="transform transition-all hover:scale-[1.02] h-full">
                <button
                  id="checkin-btn"
                  onClick={handleCheckIn}
                  disabled={checkedIn || checkInLoading}
                  className={`w-full h-full py-12 rounded-[2.5rem] flex flex-col items-center justify-center gap-4 shadow-2xl text-white text-3xl font-extrabold transition-all border border-white/20 relative overflow-hidden ${
                    checkedIn
                      ? 'bg-gradient-to-br from-green-500 to-emerald-600 cursor-default shadow-green-500/30'
                      : 'bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-500 hover:shadow-indigo-500/40 active:scale-95'
                  }`}
                >
                  <div className="absolute -top-24 -right-24 w-64 h-64 bg-white opacity-10 rounded-full blur-3xl pointer-events-none"></div>
                  
                  {checkInLoading ? (
                    <span className="animate-spin w-16 h-16 border-4 border-white/30 border-t-white rounded-full" />
                  ) : (
                    <CheckCircle2 className="w-20 h-20 drop-shadow-md" strokeWidth={2} />
                  )}
                  <span className="drop-shadow-md">{checkedIn ? 'Checked In! ✓' : checkInLoading ? 'Sending…' : "I'm Doing Well"}</span>
                  <span className="text-lg font-medium opacity-90 tracking-wide drop-shadow-sm text-center px-4">
                    {checkedIn
                      ? 'Your family knows you are safe.'
                      : 'Tap to let your family know'}
                  </span>
                </button>
              </div>

              <div className="bg-white/80 backdrop-blur-xl rounded-[2.5rem] shadow-xl p-8 border border-white/60 h-full flex flex-col justify-center">
                <h2 className="text-2xl font-bold text-gray-800 mb-6 flex items-center gap-2">
                  <Activity className="w-7 h-7 text-pink-500" /> Log Vitals
                </h2>
                <form onSubmit={handleLogVitals} className="flex flex-col gap-5">
                  <div>
                    <label className="block text-sm font-bold text-gray-600 mb-2 uppercase tracking-wide">Heart Rate (bpm)</label>
                    <input 
                      type="number" 
                      placeholder="e.g. 72" 
                      value={vitalsForm.heartRate} 
                      onChange={e => setVitalsForm({...vitalsForm, heartRate: e.target.value})} 
                      className="w-full bg-gray-50 border-2 border-indigo-100 rounded-2xl px-5 py-4 text-xl font-bold text-gray-800 focus:outline-none focus:border-indigo-400 transition-colors" 
                      required 
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-600 mb-2 uppercase tracking-wide">Blood Pressure</label>
                    <input 
                      type="text" 
                      placeholder="e.g. 120/80" 
                      value={vitalsForm.bloodPressure} 
                      onChange={e => setVitalsForm({...vitalsForm, bloodPressure: e.target.value})} 
                      pattern="\d{2,3}/\d{2,3}"
                      title="Please enter blood pressure in the format SYS/DIA (e.g., 120/80)"
                      className="w-full bg-gray-50 border-2 border-indigo-100 rounded-2xl px-5 py-4 text-xl font-bold text-gray-800 focus:outline-none focus:border-indigo-400 transition-colors" 
                      required 
                    />
                  </div>
                  <button 
                    type="submit" 
                    disabled={vitalsLoading}
                    className="w-full bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600 text-white font-bold text-xl py-4 rounded-2xl shadow-lg transition-all active:scale-95 disabled:opacity-50 mt-2"
                  >
                    {vitalsLoading ? 'Saving...' : 'Save Vitals'}
                  </button>
                </form>
              </div>
            </div>

            {/* Premium Dashboards Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="space-y-6">
                <RiskScoreWidget riskScore={dashboardData?.riskScore} />
                <HealthSummaryWidget summary={dashboardData?.vitalsSummary} />
                <MedicationWidget 
                  reminders={reminders} 
                  compliance={dashboardData?.medicationStatus?.compliance} 
                  onMarkTaken={handleMedTaken}
                  medLoading={medLoading}
                />
                <AppointmentWidget appointments={dashboardData?.upcomingAppointments || []} />
              </div>
              <div className="space-y-6">
                <DocumentWidget 
                  documents={dashboardData?.medicalDocuments || []} 
                  onUpload={handleUploadDocument} 
                  onDownload={handleDownloadDocument} 
                  onDelete={handleDeleteDocument}
                  uploadLoading={uploadLoading}
                  elderId={user?.id}
                />
                <TimelineWidget timeline={timeline || []} />
              </div>
            </div>
          </div>
        )}

        <div className="mt-6 flex items-center gap-2 text-gray-500 justify-center">
          <Clock className="w-5 h-5" />
          <span className="text-base">Last updated: {timeStr}</span>
        </div>
      </main>
    </div>
  );
}
