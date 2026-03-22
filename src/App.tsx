import React, { useState, useEffect, useMemo } from 'react';
import { 
  Users, CalendarCheck, BarChart3, History, Settings, LogOut, 
  UploadCloud, Download, Trash2, Edit, AlertTriangle, CheckSquare, 
  Square, Search, Plus, ChevronUp, ChevronDown, ShieldAlert, Key,
  Filter, X, Clock
} from 'lucide-react';
import Fuse from 'fuse.js';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, onAuthStateChanged, signOut,
  createUserWithEmailAndPassword, signInWithEmailAndPassword,
  setPersistence, browserLocalPersistence, GoogleAuthProvider, signInWithPopup,
  sendPasswordResetEmail
} from 'firebase/auth';
import { 
  getFirestore, collection, onSnapshot, addDoc, updateDoc, 
  deleteDoc, doc, writeBatch, setDoc, getDocs
} from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { 
  PieChart, Pie, Cell, Tooltip as RechartsTooltip, ResponsiveContainer, 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend 
} from 'recharts';

// --- Firebase Initialization ---
const firebaseConfig = {
  apiKey: "AIzaSyDb6tkifR6f3Eu72Fg3_CMF4j6qDzIa0V0",
  authDomain: "myproject-94586.firebaseapp.com",
  projectId: "myproject-94586",
  storageBucket: "myproject-94586.firebasestorage.app",
  messagingSenderId: "102468237263",
  appId: "1:102468237263:web:129749aa7b9d4126ac44ba"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);
const appId = 'attendance-pro-production';

// --- ERP Relational Data Structure ---
const MASTER_DEPARTMENTS = [
  { id: "dept_acc", name: "Account" }, { id: "dept_cp", name: "CP" }, { id: "dept_cpnd", name: "CPND" },
  { id: "dept_admin", name: "Admin" }, { id: "dept_boiler", name: "Boiler" }, { id: "dept_centri", name: "Centrifugal" },
  { id: "dept_sec", name: "Security" }, { id: "dept_cane", name: "Cane" }, { id: "dept_fs", name: "Firefighting & Safety" },
  { id: "dept_mgt", name: "Management" }, { id: "dept_wh", name: "Warehouse" }, { id: "dept_inst", name: "Instrumentation" },
  { id: "dept_ms", name: "Machine shop" }, { id: "dept_mill", name: "Mill" }, { id: "dept_evap", name: "Evaporator" },
  { id: "dept_elec", name: "Electrical" }, { id: "dept_pan", name: "Pan" }, { id: "dept_gv", name: "General(Vehicle)" },
  { id: "dept_gen", name: "General" }, { id: "dept_lab", name: "Laboratory" }, { id: "dept_me", name: "Manager of Engineering" },
  { id: "dept_mis", name: "MIS" }, { id: "dept_pp", name: "Power Plant" }, { id: "dept_prod", name: "Production" },
  { id: "dept_off", name: "Office" }, { id: "dept_store", name: "Store" }, { id: "dept_cpny", name: "CPNY" }, { id: "dept_safety", name: "Safety" }
];

const getDeptName = (idOrName) => {
  const dept = MASTER_DEPARTMENTS.find(d => d.id === idOrName || d.name === idOrName);
  return dept ? dept.name : idOrName;
};

const getDeptId = (name) => {
  const dept = MASTER_DEPARTMENTS.find(d => d.name === name);
  return dept ? dept.id : name;
};

const ATTENDANCE_TYPES = ["Present", "Leave", "Absent", "Late", "Half-Day"];
const EMPLOYEE_STATUSES = ["Active", "Inactive", "Resigned"];
const USER_ROLES = ["Super Admin", "Admin", "Normal"];

export default function App() {
  const [user, setUser] = useState(null);
  const [currentUserRole, setCurrentUserRole] = useState(null);
  const [currentView, setCurrentView] = useState('dashboard');
  const [previousView, setPreviousView] = useState('dashboard');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(null);
  
  const [employees, setEmployees] = useState([]);
  const [attendances, setAttendances] = useState([]);
  const [appUsers, setAppUsers] = useState([]);
  const [shifts, setShifts] = useState([]);
  
  const [loading, setLoading] = useState(true);
  const [notification, setNotification] = useState(null);

  const [authMode, setAuthMode] = useState('login'); 
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const showNotification = (message, type = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 5000); 
  };

  useEffect(() => {
    const initAuth = async () => {
      try {
        await setPersistence(auth, browserLocalPersistence);
        await auth.authStateReady();
      } catch (error) {
        console.error("Auth Init Error:", error);
      }
    };
    initAuth();

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (!currentUser) setCurrentUserRole(null);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return; 

    setLoading(true);
    const empRef = collection(db, 'artifacts', appId, 'public', 'data', 'employees');
    const attRef = collection(db, 'artifacts', appId, 'public', 'data', 'attendances');
    const usersRef = collection(db, 'artifacts', appId, 'public', 'data', 'app_users'); // Global users list
    const shiftsRef = collection(db, 'artifacts', appId, 'public', 'data', 'shifts');

    const handleFirebaseError = (error) => {
      if (error.code === 'permission-denied') {
        showNotification("🔴 Firebase Rules တွင် allow read, write: if true; ဟု ပြင်ပေးပါ။", 'error');
      }
      setLoading(false);
    };

    const unsubEmp = onSnapshot(empRef, (snapshot) => {
      setEmployees(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, handleFirebaseError);

    const unsubAtt = onSnapshot(attRef, (snapshot) => {
      setAttendances(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, handleFirebaseError);

    const unsubUsers = onSnapshot(usersRef, (snapshot) => {
      const usersData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
      setAppUsers(usersData);
      
      // Sync current user's role
      const myProfile = usersData.find(u => u.id === user.uid);
      if (myProfile) {
        setCurrentUserRole(myProfile.role);
      } else {
        // Self-heal: If user logs in via Google and has no profile, create one.
        const defaultRole = usersData.length === 0 ? 'Super Admin' : 'Normal';
        setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'app_users', user.uid), {
          email: user.email,
          role: defaultRole,
          createdAt: new Date().toISOString()
        });
        setCurrentUserRole(defaultRole);
      }
      setLoading(false);
    }, handleFirebaseError);

    const unsubShifts = onSnapshot(shiftsRef, (snapshot) => {
      setShifts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, handleFirebaseError);

    return () => { unsubEmp(); unsubAtt(); unsubUsers(); unsubShifts(); };
  }, [user]);

  const handleEmailAuth = async (e) => {
    e.preventDefault();
    try {
      if (authMode === 'signup') {
        // Check if this is the very first user in the system
        const usersSnap = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'app_users'));
        const isFirstUser = usersSnap.empty;
        const assignedRole = isFirstUser ? 'Super Admin' : 'Normal';

        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        
        // Save to public app_users collection so Super Admins can manage them
        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'app_users', userCredential.user.uid), {
          email: email,
          role: assignedRole,
          createdAt: new Date().toISOString()
        });
        
        showNotification(`Account created successfully! Role: ${assignedRole}`);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
        showNotification("Logged in successfully!");
      }
    } catch (error) {
      showNotification(error.message, 'error');
    }
  };

  const handlePasswordReset = async () => {
    if (!email) {
      showNotification("Please enter your email address first.", "error");
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email);
      showNotification("Password reset email sent! Please check your inbox.");
    } catch (error) {
      showNotification(error.message, "error");
    }
  };

  const loginWithGoogle = async () => {
    if (window !== window.top) {
      showNotification("Google Login ကို Preview (Iframe) တွင် သုံး၍မရပါ။ Email/Password ကိုသာ အသုံးပြုပါ။", 'error');
      return;
    }
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
      // Logic for new Google users is handled in the onSnapshot above (Self-heal)
      showNotification("Google Login Successful!");
    } catch (error) {
      showNotification("Google Login Failed: " + error.message, 'error');
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        {notification && (
          <div className={`absolute top-4 right-4 z-50 px-4 py-3 rounded-md shadow-lg flex items-center gap-2 max-w-md ${notification.type === 'error' ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`}>
            <AlertTriangle size={20} className="flex-shrink-0" />
            <span className="font-medium text-sm leading-snug">{notification.message}</span>
          </div>
        )}
        <div className="bg-white p-8 rounded-xl shadow-lg max-w-md w-full">
          <div className="flex justify-center mb-6">
            <div className="p-4 bg-blue-100 rounded-full text-blue-700">
              <ShieldAlert size={48} />
            </div>
          </div>
          <h1 className="text-3xl font-bold text-slate-800 mb-2 text-center">Attendance Pro</h1>
          <p className="text-slate-500 mb-6 text-center">Architect Edition ERP (RBAC)</p>
          
          <form onSubmit={handleEmailAuth} className="space-y-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-blue-500" placeholder="admin@erp.com" />
            </div>
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="block text-sm font-medium text-slate-700">Password</label>
                {authMode === 'login' && (
                  <button type="button" onClick={handlePasswordReset} className="text-xs text-blue-600 hover:underline">
                    Forgot Password?
                  </button>
                )}
              </div>
              <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-blue-500" placeholder="••••••••" />
            </div>
            <button type="submit" className="w-full bg-slate-800 hover:bg-slate-900 text-white py-3 px-4 rounded-lg font-medium transition-colors">
              {authMode === 'login' ? 'Sign In' : 'Create Account'}
            </button>
          </form>

          <div className="relative flex items-center justify-center mb-6">
            <div className="absolute border-t border-slate-200 w-full"></div>
            <span className="bg-white px-3 text-sm text-slate-400 relative">OR</span>
          </div>

          <button onClick={loginWithGoogle} type="button" className="w-full flex items-center justify-center gap-2 border border-slate-300 hover:bg-slate-50 text-slate-700 py-3 px-4 rounded-lg font-medium transition-colors mb-4">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
            Sign in with Google
          </button>

          <p className="text-center text-sm text-slate-500">
            <button onClick={() => setAuthMode(authMode === 'login' ? 'signup' : 'login')} className="text-blue-600 font-medium hover:underline">
              {authMode === 'login' ? 'Switch to Sign Up' : 'Switch to Log In'}
            </button>
          </p>
        </div>
      </div>
    );
  }

  // Handle waiting for role to load to prevent UI flickering
  if (!currentUserRole) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col md:flex-row font-sans">
      {/* Sidebar */}
      <aside className="w-full md:w-64 bg-slate-900 text-white flex flex-col">
        <div className="p-6 border-b border-slate-800">
          <h1 className="text-2xl font-bold flex items-center gap-2 text-blue-400"><CalendarCheck /> AttenPro</h1>
          <p className="text-xs text-slate-400 mt-1">ERP Module - v2.0</p>
        </div>
        <nav className="flex-1 px-4 py-6 space-y-2">
          {/* Normal, Admin, Super Admin */}
          <SidebarItem icon={<BarChart3 />} label="Dashboard" active={currentView === 'dashboard'} onClick={() => setCurrentView('dashboard')} />
          <SidebarItem icon={<CheckSquare />} label="Submit form" active={currentView === 'submit'} onClick={() => setCurrentView('submit')} />
          
          {/* Admin, Super Admin */}
          {['Admin', 'Super Admin'].includes(currentUserRole) && (
            <>
              <SidebarItem icon={<History />} label="Records History" active={currentView === 'history'} onClick={() => setCurrentView('history')} />
              <SidebarItem icon={<Users />} label="Employee Mgt" active={currentView === 'employees'} onClick={() => setCurrentView('employees')} />
              <SidebarItem icon={<Clock />} label="Shifts" active={currentView === 'shifts'} onClick={() => setCurrentView('shifts')} />
            </>
          )}

          {/* Super Admin Only */}
          {currentUserRole === 'Super Admin' && (
            <div className="pt-4 mt-4 border-t border-slate-800">
              <p className="text-xs text-slate-500 font-bold uppercase mb-2 ml-4">System Settings</p>
              <SidebarItem icon={<Settings />} label="User Management" active={currentView === 'settings'} onClick={() => setCurrentView('settings')} />
            </div>
          )}
        </nav>
        
        <div className="p-4 border-t border-slate-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-sm font-bold shadow-inner">
                {user.email ? user.email[0].toUpperCase() : 'U'}
              </div>
              <div className="flex flex-col">
                <p className="font-medium text-sm truncate w-24 leading-tight">{user.email}</p>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded mt-1 w-max ${
                  currentUserRole === 'Super Admin' ? 'bg-purple-500/20 text-purple-300' :
                  currentUserRole === 'Admin' ? 'bg-blue-500/20 text-blue-300' : 'bg-slate-700 text-slate-300'
                }`}>
                  {currentUserRole}
                </span>
              </div>
            </div>
            <button onClick={() => signOut(auth)} className="text-slate-400 hover:text-red-400 p-2"><LogOut size={18} /></button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden relative">
        {notification && (
          <div className={`absolute top-4 right-4 z-50 px-4 py-3 rounded-md shadow-lg flex items-center gap-2 max-w-md ${notification.type === 'error' ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`}>
            <AlertTriangle size={20} className="flex-shrink-0" />
            <span className="font-medium text-sm">{notification.message}</span>
          </div>
        )}
        <div className="flex-1 overflow-auto p-4 md:p-8">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-500">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mb-4"></div>
              <p>Connecting ERP Database...</p>
            </div>
          ) : (
            <>
              {currentView === 'dashboard' && <DashboardView employees={employees} attendances={attendances} />}
              {currentView === 'submit' && <SubmitAttendanceView employees={employees} attendances={attendances} showNotification={showNotification} />}
              
              {/* Protected Routes Handling */}
              {['Admin', 'Super Admin'].includes(currentUserRole) && currentView === 'history' && <HistoryView attendances={attendances} employees={employees} showNotification={showNotification} onEmployeeClick={(id) => { setPreviousView(currentView); setSelectedEmployeeId(id); setCurrentView('employeeProfile'); }} />}
              {['Admin', 'Super Admin'].includes(currentUserRole) && currentView === 'employees' && <EmployeeManagementView employees={employees} shifts={shifts} showNotification={showNotification} onEmployeeClick={(id) => { setPreviousView(currentView); setSelectedEmployeeId(id); setCurrentView('employeeProfile'); }} />}
              {['Admin', 'Super Admin'].includes(currentUserRole) && currentView === 'shifts' && <ShiftsView shifts={shifts} showNotification={showNotification} />}
              
              {currentUserRole === 'Super Admin' && currentView === 'settings' && <SettingsView appUsers={appUsers} showNotification={showNotification} currentUid={user.uid} />}
              
              {currentView === 'employeeProfile' && <EmployeeProfileView employeeId={selectedEmployeeId} employees={employees} attendances={attendances} appUsers={appUsers} shifts={shifts} onBack={() => setCurrentView(previousView)} showNotification={showNotification} />}
            </>
          )}
        </div>
      </main>
    </div>
  );
}

const SidebarItem = ({ icon, label, active, onClick }) => (
  <button onClick={onClick} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors text-left ${active ? 'bg-blue-600 text-white font-medium shadow-md' : 'text-slate-300 hover:bg-slate-800 hover:text-white'}`}>
    {icon} <span>{label}</span>
  </button>
);


// ==========================================
// 1. DASHBOARD VIEW
// ==========================================
function DashboardView({ employees, attendances }) {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [detailStatus, setDetailStatus] = useState(null);

  const todaysRecords = useMemo(() => {
    return attendances.filter(a => a.date === selectedDate);
  }, [attendances, selectedDate]);

  const stats = useMemo(() => {
    return {
      present: todaysRecords.filter(a => a.status === 'Present').length,
      leave: todaysRecords.filter(a => a.status === 'Leave').length,
      absent: todaysRecords.filter(a => a.status === 'Absent').length,
      late: todaysRecords.filter(a => a.status === 'Late').length,
      halfDay: todaysRecords.filter(a => a.status === 'Half-Day').length,
    };
  }, [todaysRecords]);

  const activeCount = employees.filter(e => e.status === 'Active').length;
  const inactiveCount = employees.filter(e => e.status === 'Inactive').length;
  const resignedCount = employees.filter(e => e.status === 'Resigned').length;

  const detailEmployees = useMemo(() => {
    if (!detailStatus) return [];
    return todaysRecords
      .filter(a => a.status === detailStatus)
      .map(a => {
        const emp = employees.find(e => e.empId === a.empId);
        return { ...a, empName: emp ? emp.name : 'Unknown', photoUrl: emp?.photoUrl };
      });
  }, [todaysRecords, detailStatus, employees]);

  const pieData = useMemo(() => {
    return [
      { name: 'Present', value: stats.present, color: '#22c55e' },
      { name: 'Leave', value: stats.leave, color: '#eab308' },
      { name: 'Absent', value: stats.absent, color: '#ef4444' },
      { name: 'Late', value: stats.late, color: '#f97316' },
      { name: 'Half-Day', value: stats.halfDay, color: '#a855f7' },
    ].filter(d => d.value > 0);
  }, [stats]);

  const last7DaysData = useMemo(() => {
    const dates = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(selectedDate);
      d.setDate(d.getDate() - i);
      dates.push(d.toISOString().split('T')[0]);
    }
    return dates.map(date => {
      const records = attendances.filter(a => a.date === date);
      return {
        date: date.substring(5), // MM-DD
        Present: records.filter(a => a.status === 'Present').length,
        Leave: records.filter(a => a.status === 'Leave').length,
        Absent: records.filter(a => a.status === 'Absent').length,
        Late: records.filter(a => a.status === 'Late').length,
        'Half-Day': records.filter(a => a.status === 'Half-Day').length,
      };
    });
  }, [attendances, selectedDate]);

  return (
    <div className="space-y-6 animate-fadeIn">
      <header className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <div>
          <h2 className="text-3xl font-bold text-slate-800">Dashboard</h2>
          <p className="text-slate-500">Attendance Summary for {selectedDate}</p>
        </div>
        <div className="flex items-center gap-2 bg-white p-2 rounded-lg border border-slate-200 shadow-sm">
          <CalendarCheck size={18} className="text-slate-400" />
          <input 
            type="date" 
            value={selectedDate} 
            onChange={(e) => {
              setSelectedDate(e.target.value);
              setDetailStatus(null);
            }} 
            className="border-none focus:ring-0 text-sm font-medium text-slate-700 outline-none"
          />
        </div>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard 
          title="Present" 
          value={stats.present} 
          color="bg-green-500" 
          onClick={() => setDetailStatus(detailStatus === 'Present' ? null : 'Present')}
          isActive={detailStatus === 'Present'}
        />
        <StatCard 
          title="Leave" 
          value={stats.leave} 
          color="bg-yellow-500" 
          onClick={() => setDetailStatus(detailStatus === 'Leave' ? null : 'Leave')}
          isActive={detailStatus === 'Leave'}
        />
        <StatCard 
          title="Absent" 
          value={stats.absent} 
          color="bg-red-500" 
          onClick={() => setDetailStatus(detailStatus === 'Absent' ? null : 'Absent')}
          isActive={detailStatus === 'Absent'}
        />
        <StatCard 
          title="Late" 
          value={stats.late} 
          color="bg-orange-500" 
          onClick={() => setDetailStatus(detailStatus === 'Late' ? null : 'Late')}
          isActive={detailStatus === 'Late'}
        />
        <StatCard 
          title="Half-Day" 
          value={stats.halfDay} 
          color="bg-purple-500" 
          onClick={() => setDetailStatus(detailStatus === 'Half-Day' ? null : 'Half-Day')}
          isActive={detailStatus === 'Half-Day'}
        />
      </div>

      {detailStatus && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden animate-slideDown">
          <div className={`p-4 border-b border-slate-100 flex items-center justify-between ${
            detailStatus === 'Present' ? 'bg-green-50' : 
            detailStatus === 'Leave' ? 'bg-yellow-50' : 
            detailStatus === 'Absent' ? 'bg-red-50' : 
            detailStatus === 'Late' ? 'bg-orange-50' : 'bg-purple-50'
          }`}>
            <h3 className="font-bold text-slate-800 flex items-center gap-2">
              <Users size={18} /> {detailStatus} List ({detailEmployees.length})
            </h3>
            <button onClick={() => setDetailStatus(null)} className="text-slate-400 hover:text-slate-600 transition-colors">
              <Plus size={20} className="rotate-45" />
            </button>
          </div>
          <div className="max-h-96 overflow-y-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider sticky top-0">
                <tr>
                  <th className="p-4 font-medium">Emp ID</th>
                  <th className="p-4 font-medium">Name</th>
                  <th className="p-4 font-medium">Department</th>
                  <th className="p-4 font-medium">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {detailEmployees.length > 0 ? detailEmployees.map((record, idx) => (
                  <tr key={idx} className="hover:bg-slate-50 transition-colors">
                    <td className="p-4 text-sm font-mono text-slate-600">{record.empId}</td>
                    <td className="p-4 text-sm font-medium text-slate-800 flex items-center gap-3">
                      <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-[10px] font-bold shadow-inner overflow-hidden flex-shrink-0">
                        {record.photoUrl ? (
                          <img src={record.photoUrl} alt={record.empName} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        ) : (
                          record.empName.charAt(0).toUpperCase()
                        )}
                      </div>
                      {record.empName}
                    </td>
                    <td className="p-4 text-sm text-slate-600">{getDeptName(record.departmentId || record.department)}</td>
                    <td className="p-4 text-sm text-slate-500">
                      {record.timestamp ? new Date(record.timestamp).toLocaleTimeString() : 'N/A'}
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan="4" className="p-8 text-center text-slate-400 italic">No records found for this status.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2"><BarChart3 size={18}/> Today's Attendance</h3>
          <div className="h-64">
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <RechartsTooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-400 italic">No attendance data for today</div>
            )}
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2"><BarChart3 size={18}/> Last 7 Days Trend</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={last7DaysData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                <RechartsTooltip cursor={{ fill: '#f1f5f9' }} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '12px' }} />
                <Bar dataKey="Present" stackId="a" fill="#22c55e" radius={[0, 0, 4, 4]} />
                <Bar dataKey="Leave" stackId="a" fill="#eab308" />
                <Bar dataKey="Absent" stackId="a" fill="#ef4444" />
                <Bar dataKey="Late" stackId="a" fill="#f97316" />
                <Bar dataKey="Half-Day" stackId="a" fill="#a855f7" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm lg:col-span-2">
          <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2"><Users size={18}/> Employee Breakdown</h3>
          <div className="flex gap-4 text-center">
            <div className="flex-1 p-4 bg-blue-50 border border-blue-100 rounded-lg"><div className="text-2xl font-bold text-blue-700">{activeCount}</div><div className="text-sm font-medium text-blue-600">Active</div></div>
            <div className="flex-1 p-4 bg-slate-50 border border-slate-200 rounded-lg"><div className="text-2xl font-bold text-slate-600">{inactiveCount}</div><div className="text-sm font-medium text-slate-500">Inactive</div></div>
            <div className="flex-1 p-4 bg-red-50 border border-red-100 rounded-lg"><div className="text-2xl font-bold text-red-700">{resignedCount}</div><div className="text-sm font-medium text-red-600">Resigned</div></div>
          </div>
        </div>
      </div>
    </div>
  );
}

const StatCard = ({ title, value, color, onClick, isActive }) => (
  <button 
    onClick={onClick}
    className={`bg-white p-6 rounded-xl shadow-sm border transition-all duration-200 flex items-center w-full text-left outline-none ${
      isActive ? 'border-slate-400 ring-2 ring-slate-100 shadow-md transform scale-[1.02]' : 'border-slate-200 hover:border-slate-300 hover:shadow-md'
    }`}
  >
    <div className={`w-3 h-12 rounded-full ${color} mr-4`}></div>
    <div>
      <p className="text-sm font-medium text-slate-500">{title}</p>
      <h3 className="text-2xl font-bold text-slate-800">{value}</h3>
    </div>
  </button>
);


// ==========================================
// 2. SUBMIT ATTENDANCE VIEW
// ==========================================
function SubmitAttendanceView({ employees, attendances, showNotification }) {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [departmentId, setDepartmentId] = useState('');
  const [status, setStatus] = useState('Present');
  const [selectedEmpIds, setSelectedEmpIds] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const filteredEmployees = useMemo(() => {
    return employees.filter(e => e.departmentId === departmentId && e.status === 'Active');
  }, [employees, departmentId]);

  const toggleEmployee = (empId) => {
    setSelectedEmpIds(prev => prev.includes(empId) ? prev.filter(id => id !== empId) : [...prev, empId]);
  };

  const toggleAll = () => {
    if (selectedEmpIds.length === filteredEmployees.length) setSelectedEmpIds([]);
    else setSelectedEmpIds(filteredEmployees.map(e => e.empId));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!departmentId || selectedEmpIds.length === 0) return showNotification("Department နှင့် ဝန်ထမ်းများကို ရွေးပါ။", 'error');

    setIsSubmitting(true);
    
    const existingRecordsForDate = attendances.filter(a => a.date === date);
    const validEmpIds = [];
    const duplicateEmpNames = [];

    selectedEmpIds.forEach(empId => {
      const alreadyHasRecord = existingRecordsForDate.some(record => record.empId === empId);
      if (alreadyHasRecord) {
        const emp = employees.find(e => e.empId === empId);
        duplicateEmpNames.push(emp ? emp.name : empId);
      } else {
        validEmpIds.push(empId);
      }
    });

    if (duplicateEmpNames.length > 0) {
      showNotification(`သတိပြုရန်: ${duplicateEmpNames.join(', ')} တို့သည် ဤရက်စွဲတွင် စာရင်းသွင်းပြီးသားဖြစ်၍ ကျော်သွားပါမည်။`, 'error');
    }

    if (validEmpIds.length === 0) {
      setIsSubmitting(false);
      return; 
    }

    try {
      const batch = writeBatch(db);
      const attRef = collection(db, 'artifacts', appId, 'public', 'data', 'attendances');

      validEmpIds.forEach(empId => {
        const emp = employees.find(e => e.empId === empId);
        if (emp) {
          const newDocRef = doc(attRef);
          batch.set(newDocRef, {
            date,
            departmentId: departmentId, 
            empId: emp.empId,
            empName: emp.name,
            status,
            timestamp: new Date().toISOString()
          });
        }
      });

      await batch.commit();
      showNotification(`အောင်မြင်ပါသည်။ ဝန်ထမ်း (${validEmpIds.length}) ဦးအတွက် Attendance တင်ပြီးပါပြီ။`);
      setSelectedEmpIds([]);
    } catch (error) {
      showNotification("Error: " + error.message, 'error');
    }
    setIsSubmitting(false);
  };

  return (
    <div className="max-w-4xl mx-auto animate-fadeIn">
      <header className="mb-6">
        <h2 className="text-2xl font-bold text-slate-800">Submit Attendance</h2>
        <p className="text-slate-500">Duplicate Entry Check ပါဝင်သည်။ တစ်ရက်လျှင် တစ်ကြိမ်သာ တင်ခွင့်ရှိသည်။</p>
      </header>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-6 bg-slate-50 border-b border-slate-200 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Date</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full border rounded-lg p-2.5 outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Department</label>
            <select value={departmentId} onChange={(e) => { setDepartmentId(e.target.value); setSelectedEmpIds([]); }} className="w-full border rounded-lg p-2.5 outline-none">
              <option value="">-- Select Department --</option>
              {MASTER_DEPARTMENTS.map(dept => <option key={dept.id} value={dept.id}>{dept.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Attendance Status</label>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full border rounded-lg p-2.5 outline-none">
              {ATTENDANCE_TYPES.map(type => <option key={type} value={type}>{type}</option>)}
            </select>
          </div>
        </div>

        <div className="p-6">
          {!departmentId ? (
            <div className="text-center py-12 text-slate-400">Department တစ်ခုခုကို ရွေးချယ်ပါ</div>
          ) : filteredEmployees.length === 0 ? (
            <div className="text-center py-12 text-slate-400">ဤဌာနတွင် Active ဝန်ထမ်းမရှိပါ။</div>
          ) : (
            <div>
              <div className="flex justify-between items-center mb-4 pb-2 border-b">
                <span className="font-medium text-slate-700">Select Employees ({selectedEmpIds.length}/{filteredEmployees.length})</span>
                <button type="button" onClick={toggleAll} className="text-sm text-blue-600 hover:text-blue-800 font-medium">Select All</button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-96 overflow-y-auto">
                {filteredEmployees.map(emp => (
                  <div key={emp.empId} onClick={() => toggleEmployee(emp.empId)} className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${selectedEmpIds.includes(emp.empId) ? 'border-blue-500 bg-blue-50/50' : 'border-slate-200 hover:bg-slate-50'}`}>
                    <div className="text-blue-600">{selectedEmpIds.includes(emp.empId) ? <CheckSquare size={20} /> : <Square size={20} className="text-slate-300" />}</div>
                    <div>
                      <p className="font-medium text-slate-800 text-sm">{emp.name}</p>
                      <p className="text-xs text-slate-500">{emp.empId}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-8 pt-4 border-t flex justify-end">
                <button onClick={handleSubmit} disabled={isSubmitting || selectedEmpIds.length === 0} className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white px-8 py-3 rounded-lg font-medium shadow-sm transition-colors">
                  {isSubmitting ? 'Submitting...' : 'Submit Attendance'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


// ==========================================
// 3. HISTORY VIEW
// ==========================================
function HistoryView({ attendances, employees, showNotification, onEmployeeClick }) {
  const today = new Date().toISOString().split('T')[0];
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [filterDept, setFilterDept] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  
  const [sortConfig, setSortConfig] = useState({ key: 'date', direction: 'desc' });

  const requestSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc';
    setSortConfig({ key, direction });
  };

  const sortedAndFilteredRecords = useMemo(() => {
    let filtered = attendances.filter(a => {
      const matchDateRange = (startDate && endDate) 
        ? (a.date >= startDate && a.date <= endDate)
        : (startDate ? a.date >= startDate : (endDate ? a.date <= endDate : true));
      
      const matchDept = filterDept ? a.departmentId === filterDept : true;
      const matchStatus = filterStatus ? a.status === filterStatus : true;
      const matchSearch = searchQuery 
        ? (
            a.empName?.toLowerCase().includes(searchQuery.toLowerCase()) || 
            a.empId?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            a.status?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            getDeptName(a.departmentId || a.department)?.toLowerCase().includes(searchQuery.toLowerCase())
          )
        : true;

      return matchDateRange && matchDept && matchStatus && matchSearch;
    });

    if (sortConfig.key) {
      filtered.sort((a, b) => {
        let aValue = a[sortConfig.key] || '';
        let bValue = b[sortConfig.key] || '';
        if (sortConfig.key === 'departmentId') {
          aValue = getDeptName(a.departmentId);
          bValue = getDeptName(b.departmentId);
        }
        if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return filtered;
  }, [attendances, startDate, endDate, filterDept, filterStatus, searchQuery, sortConfig]);

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this record?")) return;
    await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'attendances', id));
  };

  const exportToCSV = () => {
    if (sortedAndFilteredRecords.length === 0) {
      showNotification("No records to export.", "error");
      return;
    }

    const headers = ["Date", "Emp ID", "Name", "Department", "Status", "Recorded At"];
    const csvRows = [headers.join(",")];

    sortedAndFilteredRecords.forEach(record => {
      const row = [
        record.date,
        record.empId,
        `"${record.empName}"`,
        `"${getDeptName(record.departmentId || record.department)}"`,
        record.status,
        `"${record.timestamp ? new Date(record.timestamp).toLocaleString() : 'N/A'}"`
      ];
      csvRows.push(row.join(","));
    });

    const csvContent = csvRows.join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `attendance_export_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const SortableHeader = ({ label, sortKey }) => (
    <th className="p-4 font-medium cursor-pointer hover:bg-slate-100 select-none" onClick={() => requestSort(sortKey)}>
      <div className="flex items-center gap-1">
        {label}
        {sortConfig.key === sortKey && (
          sortConfig.direction === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />
        )}
      </div>
    </th>
  );

  return (
    <div className="animate-fadeIn">
      <header className="mb-6 flex justify-between items-center flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Records History</h2>
          <p className="text-slate-500">Default view is today's report. Use filters for custom range.</p>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={() => setIsFilterOpen(!isFilterOpen)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors border ${isFilterOpen ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'}`}
          >
            <Filter size={16} />
            {isFilterOpen ? 'Hide Filters' : 'Show Filters'}
          </button>
          <button 
            onClick={exportToCSV}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm"
          >
            <Download size={16} />
            Export CSV
          </button>
        </div>
      </header>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 mb-6">
        {isFilterOpen && (
          <div className="p-6 bg-slate-50 border-b border-slate-200 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-slideDown">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Start Date</label>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full border rounded-md p-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">End Date</label>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full border rounded-md p-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Department</label>
              <select value={filterDept} onChange={(e) => setFilterDept(e.target.value)} className="w-full border rounded-md p-2 text-sm outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">All Departments</option>
                {MASTER_DEPARTMENTS.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Status</label>
              <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="w-full border rounded-md p-2 text-sm outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">All Statuses</option>
                {ATTENDANCE_TYPES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="lg:col-span-2">
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Search</label>
              <div className="relative">
                <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
                <input 
                  type="text" 
                  placeholder="Search name, ID, status, or dept..." 
                  value={searchQuery} 
                  onChange={(e) => setSearchQuery(e.target.value)} 
                  className="w-full pl-10 pr-4 py-2 border rounded-md text-sm outline-none focus:ring-2 focus:ring-blue-500" 
                />
              </div>
            </div>
            <div className="lg:col-span-2 flex items-end">
              <button 
                onClick={() => {
                  setStartDate(today);
                  setEndDate(today);
                  setFilterDept('');
                  setFilterStatus('');
                  setSearchQuery('');
                }}
                className="text-sm text-red-600 hover:text-red-800 font-medium flex items-center gap-1"
              >
                <X size={14} /> Reset Filters
              </button>
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50 text-slate-600 border-b">
              <tr>
                <SortableHeader label="Date" sortKey="date" />
                <SortableHeader label="Emp ID" sortKey="empId" />
                <SortableHeader label="Name" sortKey="empName" />
                <SortableHeader label="Department" sortKey="departmentId" />
                <SortableHeader label="Status" sortKey="status" />
                <th className="p-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sortedAndFilteredRecords.map(record => {
                const emp = employees?.find(e => e.empId === record.empId);
                return (
                  <tr key={record.id} className="hover:bg-slate-50 transition-colors">
                    <td className="p-4">{record.date}</td>
                    <td className="p-4 font-medium text-blue-600 cursor-pointer hover:underline" onClick={() => onEmployeeClick && onEmployeeClick(record.empId)}>{record.empId}</td>
                    <td className="p-4 cursor-pointer hover:text-blue-600 flex items-center gap-3" onClick={() => onEmployeeClick && onEmployeeClick(record.empId)}>
                      <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold shadow-inner overflow-hidden flex-shrink-0">
                        {emp?.photoUrl ? (
                          <img src={emp.photoUrl} alt={record.empName} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        ) : (
                          record.empName?.charAt(0).toUpperCase() || '?'
                        )}
                      </div>
                      {record.empName}
                    </td>
                    <td className="p-4">{getDeptName(record.departmentId || record.department)}</td>
                    <td className="p-4"><span className="px-2 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700">{record.status}</span></td>
                    <td className="p-4 text-right">
                      <button onClick={() => handleDelete(record.id)} className="text-red-500 hover:text-red-700 transition-colors"><Trash2 size={16}/></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}


// ==========================================
// 4. EMPLOYEE MANAGEMENT VIEW
// ==========================================
function EmployeeManagementView({ employees, shifts, showNotification, onEmployeeClick }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ empId: '', name: '', departmentId: MASTER_DEPARTMENTS[0].id, status: 'Active', resignDate: '', shiftId: '' });

  const [sortConfig, setSortConfig] = useState({ key: 'empId', direction: 'asc' });

  const requestSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc';
    setSortConfig({ key, direction });
  };

  const sortedAndFilteredEmployees = useMemo(() => {
    let filtered = [...employees];

    if (searchTerm) {
      const fuse = new Fuse(employees, {
        keys: [
          'name',
          'empId',
          { name: 'departmentId', getFn: (emp: any) => getDeptName(emp.departmentId || emp.department) }
        ],
        threshold: 0.3, // Lower threshold means more exact matching
        distance: 100,
        includeScore: true
      });
      filtered = fuse.search(searchTerm).map(result => result.item);
    }

    if (sortConfig.key) {
      filtered.sort((a, b) => {
        let aValue = a[sortConfig.key] || '';
        let bValue = b[sortConfig.key] || '';
        if (sortConfig.key === 'departmentId') {
          aValue = getDeptName(a.departmentId);
          bValue = getDeptName(b.departmentId);
        }
        if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return filtered;
  }, [employees, searchTerm, sortConfig]);

  const openForm = (emp = null) => {
    if (emp) {
      setEditingId(emp.id);
      const currentDeptId = emp.departmentId || getDeptId(emp.department);
      setForm({ empId: emp.empId, name: emp.name, departmentId: currentDeptId, status: emp.status, resignDate: emp.resignDate || '', shiftId: emp.shiftId || '' });
    } else {
      setEditingId(null);
      setForm({ empId: '', name: '', departmentId: MASTER_DEPARTMENTS[0].id, status: 'Active', resignDate: '', shiftId: '' });
    }
    setIsFormOpen(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    try {
      if (editingId) {
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'employees', editingId), form);
      } else {
        if (employees.some(emp => emp.empId === form.empId)) return showNotification("Employee ID already exists!", 'error');
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'employees'), form);
      }
      setIsFormOpen(false);
      showNotification("Employee saved successfully.");
    } catch (error) {
      showNotification("Error: " + error.message, 'error');
    }
  };

  const parseCSV = (text) => {
    const lines = text.split('\n');
    const result = [];
    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
    
    for(let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if(!line) continue;
      const obj = {};
      const currentline = line.split(',');
      headers.forEach((h, j) => {
        obj[h] = currentline[j] ? currentline[j].trim().replace(/"/g, '') : '';
      });
      result.push(obj);
    }
    return result;
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const parsedData = parseCSV(evt.target.result);
        const batch = writeBatch(db);
        const colRef = collection(db, 'artifacts', appId, 'public', 'data', 'employees');
        
        let count = 0;
        parsedData.forEach(row => {
          if (row.Emp_ID && row.Name && row.Department) {
            if (!employees.some(emp => emp.empId === row.Emp_ID)) {
              const newDocRef = doc(colRef);
              const deptId = getDeptId(row.Department);
              
              batch.set(newDocRef, {
                empId: row.Emp_ID,
                name: row.Name,
                departmentId: deptId,
                status: row.Status || 'Active',
                resignDate: row.ResignDate || '',
                shiftId: row.Shift_ID || ''
              });
              count++;
            }
          }
        });
        
        if (count > 0) {
          await batch.commit();
          showNotification(`အောင်မြင်ပါသည်။ ဝန်ထမ်းအသစ် ${count} ဦးကို Upload လုပ်ပြီးပါပြီ။`);
        } else {
          showNotification("CSV ထဲတွင် ဝန်ထမ်းအသစ်မတွေ့ပါ (သို့) Format မှားယွင်းနေပါသည်။", 'error');
        }
      } catch (error) {
        showNotification("CSV ဖတ်ရာတွင် Error ဖြစ်နေပါသည်။", 'error');
      }
    };
    reader.readAsText(file);
    e.target.value = null; 
  };

  const SortableHeader = ({ label, sortKey }) => (
    <th className="p-4 font-medium cursor-pointer hover:bg-slate-100 select-none" onClick={() => requestSort(sortKey)}>
      <div className="flex items-center gap-1">
        {label}
        {sortConfig.key === sortKey && (
          sortConfig.direction === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />
        )}
      </div>
    </th>
  );

  return (
    <div className="animate-fadeIn pb-12">
      <header className="mb-6 flex justify-between items-center flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Employee Management</h2>
          <p className="text-slate-500">Employee များသည် Department (Master Data) နှင့် တိုက်ရိုက်ချိတ်ဆက်ထားပါသည်။</p>
        </div>
        <div className="flex gap-2">
          <label className="bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-lg flex items-center gap-2 cursor-pointer shadow-sm transition-colors">
            <UploadCloud size={18} /> Upload CSV
            <input type="file" accept=".csv" className="hidden" onChange={handleFileUpload} />
          </label>
          <button onClick={() => openForm()} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 shadow-sm transition-colors"><Plus size={18} /> Add Employee</button>
        </div>
      </header>

      {isFormOpen && (
        <div className="mb-6 bg-white p-6 rounded-xl border border-blue-200 shadow-sm animate-fadeIn">
          <form onSubmit={handleSave} className="grid grid-cols-1 md:grid-cols-6 gap-4">
            <div><label className="block text-xs font-medium text-slate-600 mb-1">Emp ID</label><input required value={form.empId} onChange={e => setForm({...form, empId: e.target.value})} className="w-full border rounded p-2 outline-none focus:ring-1 focus:ring-blue-500" /></div>
            <div><label className="block text-xs font-medium text-slate-600 mb-1">Name</label><input required value={form.name} onChange={e => setForm({...form, name: e.target.value})} className="w-full border rounded p-2 outline-none focus:ring-1 focus:ring-blue-500" /></div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Department</label>
              <select required value={form.departmentId} onChange={e => setForm({...form, departmentId: e.target.value})} className="w-full border rounded p-2 outline-none focus:ring-1 focus:ring-blue-500">
                {MASTER_DEPARTMENTS.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Shift</label>
              <select value={form.shiftId} onChange={e => setForm({...form, shiftId: e.target.value})} className="w-full border rounded p-2 outline-none focus:ring-1 focus:ring-blue-500">
                <option value="">-- No Shift --</option>
                {shifts.map(s => <option key={s.id} value={s.id}>{s.name} ({s.startTime} - {s.endTime})</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Status</label>
              <select value={form.status} onChange={e => setForm({...form, status: e.target.value})} className="w-full border rounded p-2 outline-none focus:ring-1 focus:ring-blue-500">
                {EMPLOYEE_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="flex items-end gap-2">
              <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded font-medium hover:bg-blue-700 transition-colors">Save</button>
              <button type="button" onClick={() => setIsFormOpen(false)} className="px-4 py-2 text-slate-600 border rounded font-medium hover:bg-slate-50 transition-colors">Cancel</button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200">
        <div className="p-4 border-b border-slate-200 bg-slate-50">
          <div className="relative max-w-sm w-full">
            <Search className="absolute left-3 top-2.5 text-slate-400" size={18} />
            <input 
              type="text" placeholder="Search by ID, Name or Department..." 
              value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 pr-4 py-2 w-full border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50 text-slate-600 border-b">
              <tr>
                <SortableHeader label="Emp ID" sortKey="empId" />
                <SortableHeader label="Name" sortKey="name" />
                <SortableHeader label="Department (Relational)" sortKey="departmentId" />
                <SortableHeader label="Shift" sortKey="shiftId" />
                <SortableHeader label="Status" sortKey="status" />
                <th className="p-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sortedAndFilteredEmployees.map(emp => (
                <tr key={emp.id} className="hover:bg-slate-50 transition-colors">
                  <td className="p-4 font-medium text-blue-600 cursor-pointer hover:underline" onClick={() => onEmployeeClick && onEmployeeClick(emp.empId)}>{emp.empId}</td>
                  <td className="p-4 cursor-pointer hover:text-blue-600 flex items-center gap-3" onClick={() => onEmployeeClick && onEmployeeClick(emp.empId)}>
                    <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold shadow-inner overflow-hidden flex-shrink-0">
                      {emp.photoUrl ? (
                        <img src={emp.photoUrl} alt={emp.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      ) : (
                        emp.name.charAt(0).toUpperCase()
                      )}
                    </div>
                    {emp.name}
                  </td>
                  <td className="p-4 text-blue-600 font-medium">{getDeptName(emp.departmentId || emp.department)}</td>
                  <td className="p-4 text-slate-600">{emp.shiftId ? shifts.find(s => s.id === emp.shiftId)?.name || 'Unknown' : 'None'}</td>
                  <td className="p-4">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        emp.status === 'Active' ? 'bg-green-100 text-green-700' :
                        emp.status === 'Inactive' ? 'bg-slate-200 text-slate-700' :
                        'bg-red-100 text-red-700'
                      }`}>
                      {emp.status}
                    </span>
                  </td>
                  <td className="p-4 text-right">
                    <button onClick={() => openForm(emp)} className="text-blue-500 hover:text-blue-700 transition-colors"><Edit size={16}/></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}


// ==========================================
// 5. SETTINGS VIEW (User Role Management - Super Admin Only)
// ==========================================
function SettingsView({ appUsers, showNotification, currentUid }) {
  
  const handleRoleChange = async (userId, newRole) => {
    // Prevent accidental self-demotion
    if (userId === currentUid && newRole !== 'Super Admin') {
      const confirmDemote = window.confirm("Are you sure you want to demote yourself? You will lose Super Admin access.");
      if (!confirmDemote) return;
    }

    try {
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'app_users', userId), {
        role: newRole
      });
      showNotification("User role updated successfully.");
    } catch (error) {
      showNotification("Error updating role: " + error.message, 'error');
    }
  };

  return (
    <div className="animate-fadeIn max-w-5xl mx-auto">
      <header className="mb-6 flex items-center gap-3">
        <div className="p-3 bg-purple-100 text-purple-600 rounded-lg">
          <Key size={24} />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-slate-800">User Management</h2>
          <p className="text-slate-500">Super Admin Only - ဝင်ရောက်ခွင့် Role များကို သတ်မှတ်ပေးရန်</p>
        </div>
      </header>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-6 border-b border-slate-200 bg-slate-50">
          <h3 className="font-bold text-slate-700 flex items-center gap-2">
            <Users size={18} /> System Registered Users ({appUsers.length})
          </h3>
          <p className="text-sm text-slate-500 mt-1">System ထဲသို့ Sign Up ဝင်ထားသော User များ၏ Role များကို ပြောင်းလဲပေးနိုင်ပါသည်။</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-100 text-slate-600 border-b border-slate-200">
              <tr>
                <th className="p-4 font-medium">Email</th>
                <th className="p-4 font-medium">Joined Date</th>
                <th className="p-4 font-medium">Current Role</th>
                <th className="p-4 font-medium text-right">Assign Role</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {appUsers.map(appUser => (
                <tr key={appUser.id} className="hover:bg-slate-50 transition-colors">
                  <td className="p-4 font-medium text-slate-800">
                    {appUser.email}
                    {appUser.id === currentUid && <span className="ml-2 text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-bold">YOU</span>}
                  </td>
                  <td className="p-4 text-slate-500">
                    {appUser.createdAt ? new Date(appUser.createdAt).toLocaleDateString() : 'N/A'}
                  </td>
                  <td className="p-4">
                    <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                      appUser.role === 'Super Admin' ? 'bg-purple-100 text-purple-700' :
                      appUser.role === 'Admin' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-700'
                    }`}>
                      {appUser.role || 'Normal'}
                    </span>
                  </td>
                  <td className="p-4 text-right">
                    <select 
                      value={appUser.role || 'Normal'} 
                      onChange={(e) => handleRoleChange(appUser.id, e.target.value)}
                      className="border border-slate-300 rounded-md p-1.5 text-sm outline-none focus:ring-2 focus:ring-purple-500 bg-white shadow-sm"
                    >
                      {USER_ROLES.map(role => (
                        <option key={role} value={role}>{role}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
              {appUsers.length === 0 && (
                <tr><td colSpan="4" className="p-8 text-center text-slate-400">No users found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      
      {/* Documentation Card for the user */}
      <div className="mt-8 bg-blue-50 border border-blue-200 rounded-xl p-6">
        <h4 className="font-bold text-blue-800 mb-2">Role Permissions Guide</h4>
        <ul className="text-sm text-blue-700 space-y-2 list-disc pl-5">
          <li><strong>Normal User:</strong> Dashboard ကို ကြည့်ခွင့်ရမည်။ Attendance များကို Submit လုပ်ခွင့်ရမည်။</li>
          <li><strong>Admin User:</strong> Normal User လုပ်ခွင့်ရှိသည့်အပြင် Record History များကိုကြည့်ခြင်း၊ ဝန်ထမ်းအသစ်များ ထည့်သွင်းခြင်း ပြုလုပ်နိုင်သည်။</li>
          <li><strong>Super Admin:</strong> အားလုံးလုပ်ခွင့်ရှိသည့်အပြင် ယခုလက်ရှိမြင်နေရသော User Management Setting ကိုပါ ထိန်းချုပ်ခွင့်ရှိသည်။</li>
        </ul>
      </div>
    </div>
  );
}

// ==========================================
// 6. EMPLOYEE PROFILE VIEW
// ==========================================
function EmployeeProfileView({ employeeId, employees, attendances, appUsers, shifts, onBack, showNotification }) {
  const employee = employees.find(e => e.empId === employeeId);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = React.useRef(null);
  
  if (!employee) {
    return (
      <div className="animate-fadeIn pb-12">
        <button onClick={onBack} className="mb-4 text-blue-600 hover:underline flex items-center gap-1">
          &larr; Back
        </button>
        <div className="text-center py-12 text-slate-500">Employee not found.</div>
      </div>
    );
  }

  // Find user role (assuming some link exists, e.g., empId or email if added later)
  const linkedUser = appUsers.find(u => u.empId === employee.empId || u.email === employee.email);
  const role = linkedUser ? linkedUser.role : 'Not Registered (No System Access)';

  const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
  const currentMonthAttendances = attendances.filter(a => a.empId === employeeId && a.date.startsWith(currentMonth));
  
  const presentCount = currentMonthAttendances.filter(a => a.status === 'Present').length;
  const leaveCount = currentMonthAttendances.filter(a => a.status === 'Leave').length;
  const absentCount = currentMonthAttendances.filter(a => a.status === 'Absent').length;
  const lateCount = currentMonthAttendances.filter(a => a.status === 'Late').length;
  const halfDayCount = currentMonthAttendances.filter(a => a.status === 'Half-Day').length;

  // Sort attendances by date descending
  const sortedAttendances = [...currentMonthAttendances].sort((a, b) => b.date.localeCompare(a.date));

  const handlePhotoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type and size (e.g., max 2MB)
    if (!file.type.startsWith('image/')) {
      showNotification('Please select an image file.', 'error');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      showNotification('Image size should be less than 2MB.', 'error');
      return;
    }

    try {
      setIsUploading(true);
      const storageRef = ref(storage, `profiles/${employee.id}_${Date.now()}_${file.name}`);
      await uploadBytes(storageRef, file);
      const photoUrl = await getDownloadURL(storageRef);
      
      await updateDoc(doc(db, 'employees', employee.id), {
        photoUrl
      });
      showNotification('Profile photo updated successfully!', 'success');
    } catch (error) {
      console.error('Error uploading photo:', error);
      showNotification('Failed to upload photo.', 'error');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <div className="animate-fadeIn pb-12 max-w-5xl mx-auto">
      <header className="mb-6 flex justify-between items-center flex-wrap gap-4">
        <div>
          <button onClick={onBack} className="mb-2 text-blue-600 hover:text-blue-800 flex items-center gap-2 font-medium transition-colors">
            &larr; Back to List
          </button>
          <h2 className="text-2xl font-bold text-slate-800">Employee Profile</h2>
        </div>
      </header>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mb-6">
        <div className="p-6 border-b border-slate-200 bg-slate-50 flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="relative group">
              <div className="w-16 h-16 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-2xl font-bold shadow-inner overflow-hidden">
                {employee.photoUrl ? (
                  <img src={employee.photoUrl} alt={employee.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  employee.name.charAt(0).toUpperCase()
                )}
              </div>
              <button 
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="absolute inset-0 bg-black bg-opacity-50 text-white flex items-center justify-center rounded-full opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50"
                title="Upload Photo"
              >
                {isUploading ? <span className="animate-spin text-xs">...</span> : <UploadCloud size={16} />}
              </button>
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handlePhotoUpload} 
                accept="image/*" 
                className="hidden" 
              />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-slate-800">{employee.name}</h2>
              <p className="text-slate-500 font-medium">{employee.empId}</p>
            </div>
          </div>
          <span className={`px-3 py-1 rounded-full text-sm font-bold shadow-sm ${
            employee.status === 'Active' ? 'bg-green-100 text-green-700' :
            employee.status === 'Inactive' ? 'bg-slate-200 text-slate-700' :
            'bg-red-100 text-red-700'
          }`}>
            {employee.status}
          </span>
        </div>
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">Employee Details</h3>
            <div className="space-y-3">
              <div className="flex justify-between border-b border-slate-100 pb-2">
                <span className="text-slate-500">Department</span>
                <span className="font-medium text-slate-800">{getDeptName(employee.departmentId || employee.department)}</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 pb-2">
                <span className="text-slate-500">Shift</span>
                <span className="font-medium text-slate-800">{employee.shiftId ? shifts.find(s => s.id === employee.shiftId)?.name || 'Unknown' : 'None'}</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 pb-2">
                <span className="text-slate-500">System Role</span>
                <span className="font-medium text-purple-600">{role}</span>
              </div>
              {employee.resignDate && (
                <div className="flex justify-between border-b border-slate-100 pb-2">
                  <span className="text-slate-500">Resign Date</span>
                  <span className="font-medium text-red-600">{employee.resignDate}</span>
                </div>
              )}
            </div>
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">Current Month Summary ({currentMonth})</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-green-50 p-3 rounded-lg border border-green-100">
                <div className="text-green-600 text-xs font-bold uppercase mb-1">Present</div>
                <div className="text-2xl font-bold text-green-700">{presentCount}</div>
              </div>
              <div className="bg-yellow-50 p-3 rounded-lg border border-yellow-100">
                <div className="text-yellow-600 text-xs font-bold uppercase mb-1">Leave</div>
                <div className="text-2xl font-bold text-yellow-700">{leaveCount}</div>
              </div>
              <div className="bg-red-50 p-3 rounded-lg border border-red-100">
                <div className="text-red-600 text-xs font-bold uppercase mb-1">Absent</div>
                <div className="text-2xl font-bold text-red-700">{absentCount}</div>
              </div>
              <div className="bg-orange-50 p-3 rounded-lg border border-orange-100">
                <div className="text-orange-600 text-xs font-bold uppercase mb-1">Late / Half-Day</div>
                <div className="text-2xl font-bold text-orange-700">{lateCount + halfDayCount}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-200 bg-slate-50">
          <h3 className="font-bold text-slate-700 flex items-center gap-2">
            <History size={18} /> Attendance History ({currentMonth})
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50 text-slate-600 border-b">
              <tr>
                <th className="p-4 font-medium">Date</th>
                <th className="p-4 font-medium">Status</th>
                <th className="p-4 font-medium">Recorded At</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sortedAttendances.map(record => (
                <tr key={record.id} className="hover:bg-slate-50 transition-colors">
                  <td className="p-4 font-medium text-slate-700">{record.date}</td>
                  <td className="p-4">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      record.status === 'Present' ? 'bg-green-100 text-green-700' :
                      record.status === 'Leave' ? 'bg-yellow-100 text-yellow-700' :
                      record.status === 'Absent' ? 'bg-red-100 text-red-700' :
                      'bg-orange-100 text-orange-700'
                    }`}>
                      {record.status}
                    </span>
                  </td>
                  <td className="p-4 text-slate-500">
                    {record.timestamp ? new Date(record.timestamp).toLocaleString() : 'N/A'}
                  </td>
                </tr>
              ))}
              {sortedAttendances.length === 0 && (
                <tr>
                  <td colSpan="3" className="p-8 text-center text-slate-400">
                    No attendance records found for this month.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// 7. SHIFTS VIEW
// ==========================================
function ShiftsView({ shifts, showNotification }) {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ name: '', startTime: '', endTime: '', description: '' });

  const openForm = (shift = null) => {
    if (shift) {
      setEditingId(shift.id);
      setForm({ name: shift.name, startTime: shift.startTime, endTime: shift.endTime, description: shift.description || '' });
    } else {
      setEditingId(null);
      setForm({ name: '', startTime: '', endTime: '', description: '' });
    }
    setIsFormOpen(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    try {
      if (editingId) {
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'shifts', editingId), form);
      } else {
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'shifts'), form);
      }
      setIsFormOpen(false);
      showNotification("Shift saved successfully.");
    } catch (error) {
      showNotification("Error: " + error.message, 'error');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this shift?")) return;
    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'shifts', id));
      showNotification("Shift deleted successfully.");
    } catch (error) {
      showNotification("Error: " + error.message, 'error');
    }
  };

  return (
    <div className="animate-fadeIn pb-12 max-w-5xl mx-auto">
      <header className="mb-6 flex justify-between items-center flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Shift Management</h2>
          <p className="text-slate-500">Define working shifts to assign to employees.</p>
        </div>
        <button onClick={() => openForm()} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 shadow-sm transition-colors">
          <Plus size={18} /> Add Shift
        </button>
      </header>

      {isFormOpen && (
        <div className="mb-6 bg-white p-6 rounded-xl border border-blue-200 shadow-sm animate-fadeIn">
          <form onSubmit={handleSave} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Shift Name</label>
              <input required value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="e.g., Morning Shift" className="w-full border rounded p-2 outline-none focus:ring-1 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Description</label>
              <input value={form.description} onChange={e => setForm({...form, description: e.target.value})} placeholder="Optional description" className="w-full border rounded p-2 outline-none focus:ring-1 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Start Time</label>
              <input type="time" required value={form.startTime} onChange={e => setForm({...form, startTime: e.target.value})} className="w-full border rounded p-2 outline-none focus:ring-1 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">End Time</label>
              <input type="time" required value={form.endTime} onChange={e => setForm({...form, endTime: e.target.value})} className="w-full border rounded p-2 outline-none focus:ring-1 focus:ring-blue-500" />
            </div>
            <div className="md:col-span-2 flex items-end gap-2 mt-2">
              <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded font-medium hover:bg-blue-700 transition-colors">Save</button>
              <button type="button" onClick={() => setIsFormOpen(false)} className="px-4 py-2 text-slate-600 border rounded font-medium hover:bg-slate-50 transition-colors">Cancel</button>
            </div>
          </form>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {shifts.map(shift => (
          <div key={shift.id} className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex justify-between items-start mb-3">
              <h3 className="font-bold text-slate-800 text-lg">{shift.name}</h3>
              <div className="flex gap-2">
                <button onClick={() => openForm(shift)} className="text-blue-500 hover:text-blue-700 transition-colors"><Edit size={16}/></button>
                <button onClick={() => handleDelete(shift.id)} className="text-red-500 hover:text-red-700 transition-colors"><Trash2 size={16}/></button>
              </div>
            </div>
            {shift.description && <p className="text-sm text-slate-500 mb-4">{shift.description}</p>}
            <div className="flex items-center gap-2 text-sm font-medium text-slate-700 bg-slate-50 p-2 rounded-lg border border-slate-100">
              <Clock size={16} className="text-blue-500" />
              {shift.startTime} - {shift.endTime}
            </div>
          </div>
        ))}
        {shifts.length === 0 && (
          <div className="col-span-full text-center py-12 text-slate-400 bg-white rounded-xl border border-slate-200 border-dashed">
            No shifts defined yet. Click "Add Shift" to create one.
          </div>
        )}
      </div>
    </div>
  );
}