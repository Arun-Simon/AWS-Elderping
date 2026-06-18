import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldAlert, Cpu, BarChart3, Database, AlertCircle, LogOut, Terminal, DollarSign, BrainCircuit } from 'lucide-react';

export default function SuperAdminDashboard() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('finops');
  const [userProfile, setUserProfile] = useState(null);

  // Aggregated Cost Telemetry
  const [finopsData, setFinopsData] = useState({
    billingPeriod: 'June 2026',
    eks_cost: 142.50,
    rds_cost: 84.20,
    bedrock_cost: 28.10,
    cloudwatch_cost: 12.45,
    sns_cost: 4.80,
    ses_cost: 1.20,
    total_cost: 273.25
  });

  const [recommendations, setRecommendations] = useState([
    { id: '1', category: 'EKS Worker Nodes', finding: 'Worker nodes average utilization is <15% during off-peak times (10PM-6AM).', action_item: 'Configure Karpenter to consolidate pods and scale node groups to zero off-peak.', savings: '$45.00/mo' },
    { id: '2', category: 'RDS DB Instances', finding: 'Database instances running at fixed provisioning rates.', action_item: 'Migrate users_db and health_db to Aurora Serverless v2 to leverage automatic scaling.', savings: '$32.10/mo' }
  ]);

  const [auditLogs, setAuditLogs] = useState([
    { id: '1', action_type: 'READ_PATIENT_RECORDS', resource: 'health_logs', actor: 'daughter', status: 'SUCCESS', created_at: '2026-06-17T11:20:00Z', ip: '192.168.1.45' },
    { id: '2', action_type: 'ROLE_ELEVATION_ATTEMPT', resource: 'users', actor: 'malicious_user', status: 'FAILURE', created_at: '2026-06-17T10:45:00Z', ip: '198.51.100.12' }
  ]);

  const [aiUsage, setAiUsage] = useState([
    { id: '1', model: 'anthropic.claude-3-haiku', capability: 'symptom_check', input_tokens: 420, output_tokens: 310, cost: 0.00043, created_at: '2026-06-17T11:05:00Z' },
    { id: '2', model: 'anthropic.claude-3-haiku', capability: 'risk_analysis', input_tokens: 1250, output_tokens: 420, cost: 0.00084, created_at: '2026-06-17T10:30:00Z' }
  ]);

  useEffect(() => {
    const raw = localStorage.getItem('user');
    if (!raw) {
      navigate('/login');
      return;
    }
    const user = JSON.parse(raw);
    if (user.role !== 'SUPER_ADMIN') {
      navigate('/login');
    }
    setUserProfile(user);
  }, [navigate]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-slate-950 flex font-sans text-slate-100">
      {/* Sidebar */}
      <aside className="w-80 bg-slate-900 border-r border-slate-800 flex flex-col justify-between p-6">
        <div>
          <div className="flex items-center gap-3 mb-10">
            <ShieldAlert className="w-10 h-10 text-emerald-400" />
            <h1 className="text-2xl font-bold tracking-tight">Enterprise Console</h1>
          </div>

          <nav className="space-y-4">
            <button
              onClick={() => setActiveTab('finops')}
              className={`w-full flex items-center gap-4 px-4 py-3 rounded-xl text-lg font-medium transition-colors ${activeTab === 'finops' ? 'bg-emerald-500 text-white' : 'text-slate-400 hover:bg-slate-800'}`}
            >
              <DollarSign className="w-6 h-6" /> FinOps Cost Center
            </button>
            <button
              onClick={() => setActiveTab('audit')}
              className={`w-full flex items-center gap-4 px-4 py-3 rounded-xl text-lg font-medium transition-colors ${activeTab === 'audit' ? 'bg-emerald-500 text-white' : 'text-slate-400 hover:bg-slate-800'}`}
            >
              <Terminal className="w-6 h-6" /> Audit Log Ledgers
            </button>
            <button
              onClick={() => setActiveTab('ai')}
              className={`w-full flex items-center gap-4 px-4 py-3 rounded-xl text-lg font-medium transition-colors ${activeTab === 'ai' ? 'bg-emerald-500 text-white' : 'text-slate-400 hover:bg-slate-800'}`}
            >
              <BrainCircuit className="w-6 h-6" /> Bedrock AI Usage
            </button>
          </nav>
        </div>

        <div>
          <div className="border-t border-slate-800 pt-6 mb-6">
            <div className="text-sm text-slate-400">Signed In As</div>
            <div className="font-semibold text-emerald-400">{userProfile?.username || 'Super Admin'}</div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full bg-red-900/20 hover:bg-red-900/60 text-red-400 hover:text-white flex items-center justify-center gap-3 py-3 rounded-xl transition-all border border-red-900/30"
          >
            <LogOut className="w-5 h-5" /> Logout
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 p-10 overflow-y-auto">
        <header className="mb-10">
          <h2 className="text-4xl font-extrabold tracking-tight">Super Admin Dashboard</h2>
          <p className="text-slate-400 mt-2 text-lg">Cloud governance, security hub telemetry, real-time AWS usage audit logging.</p>
        </header>

        {activeTab === 'finops' && (
          <div className="space-y-8">
            {/* Cost overview grid */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800">
                <div className="text-slate-400 text-sm">Monthly Accumulated Cost</div>
                <div className="text-3xl font-bold mt-2">${finopsData.total_cost.toFixed(2)}</div>
              </div>
              <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800">
                <div className="text-slate-400 text-sm">EKS Cluster Allocation</div>
                <div className="text-3xl font-bold mt-2">${finopsData.eks_cost.toFixed(2)}</div>
              </div>
              <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800">
                <div className="text-slate-400 text-sm">RDS Multi-AZ Clusters</div>
                <div className="text-3xl font-bold mt-2">${finopsData.rds_cost.toFixed(2)}</div>
              </div>
              <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800">
                <div className="text-slate-400 text-sm">Amazon Bedrock Queries</div>
                <div className="text-3xl font-bold mt-2">${finopsData.bedrock_cost.toFixed(2)}</div>
              </div>
            </div>

            {/* AI Cost recommendations */}
            <section className="bg-slate-900 border border-slate-800 rounded-3xl p-8">
              <h3 className="text-2xl font-bold mb-6 text-emerald-400 flex items-center gap-3">
                <BrainCircuit className="w-7 h-7" /> AI-Generated Cost Optimizations
              </h3>
              <div className="space-y-6">
                {recommendations.map(r => (
                  <div key={r.id} className="p-6 bg-slate-950 border border-slate-800 rounded-2xl flex justify-between items-start">
                    <div>
                      <span className="text-emerald-500 font-bold bg-emerald-500/10 px-3 py-1 rounded-full text-xs uppercase">{r.category}</span>
                      <p className="text-lg font-semibold mt-3 text-slate-200">{r.finding}</p>
                      <p className="text-sm text-slate-400 mt-2">Action: {r.action_item}</p>
                    </div>
                    <div className="text-right">
                      <span className="text-xs text-slate-500 uppercase block">Estimated Savings</span>
                      <span className="text-2xl font-extrabold text-emerald-400 block mt-1">{r.savings}</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}

        {activeTab === 'audit' && (
          <section className="bg-slate-900 border border-slate-800 rounded-3xl p-8">
            <h3 className="text-2xl font-bold mb-6 text-emerald-400">Security Audit Ledgers</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-850 text-slate-400 uppercase text-sm font-semibold">
                    <th className="py-4">Time</th>
                    <th className="py-4">Action</th>
                    <th className="py-4">Entity</th>
                    <th className="py-4">User Subject</th>
                    <th className="py-4">IP Address</th>
                    <th className="py-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-850 text-slate-300 text-lg">
                  {auditLogs.map(l => (
                    <tr key={l.id} className="hover:bg-slate-950/40 transition-colors">
                      <td className="py-4">{new Date(l.created_at).toLocaleTimeString()}</td>
                      <td className="py-4 font-mono text-cyan-400 text-sm">{l.action_type}</td>
                      <td className="py-4 text-slate-500">{l.resource}</td>
                      <td className="py-4 font-medium">{l.actor}</td>
                      <td className="py-4 font-mono text-xs text-slate-400">{l.ip}</td>
                      <td className="py-4">
                        <span className={`px-3 py-1 rounded-full text-xs font-black uppercase ${l.status === 'SUCCESS' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                          {l.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {activeTab === 'ai' && (
          <section className="bg-slate-900 border border-slate-800 rounded-3xl p-8">
            <h3 className="text-2xl font-bold mb-6 text-emerald-400">AWS Bedrock Token Transactions</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-850 text-slate-400 uppercase text-sm font-semibold">
                    <th className="py-4">Timestamp</th>
                    <th className="py-4">Model ID</th>
                    <th className="py-4">Capability</th>
                    <th className="py-4">Input Tokens</th>
                    <th className="py-4">Output Tokens</th>
                    <th className="py-4">Estimated Charge</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-850 text-slate-300 text-lg">
                  {aiUsage.map(a => (
                    <tr key={a.id} className="hover:bg-slate-950/40 transition-colors">
                      <td className="py-4">{new Date(a.created_at).toLocaleTimeString()}</td>
                      <td className="py-4 font-mono text-xs">{a.model}</td>
                      <td className="py-4 font-medium uppercase text-sm">{a.capability}</td>
                      <td className="py-4 text-slate-400">{a.input_tokens}</td>
                      <td className="py-4 text-slate-400">{a.output_tokens}</td>
                      <td className="py-4 font-mono text-emerald-400 text-sm">${a.cost.toFixed(5)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
