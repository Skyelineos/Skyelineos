import { useState } from 'react';
import { LayoutDashboard, FolderOpen, Calendar, Users, MessageSquare, DollarSign } from 'lucide-react';

// Pure construction management app without any authentication
export default function App() {
  const [view, setView] = useState('dashboard');

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'projects', label: 'Projects', icon: FolderOpen },
    { id: 'schedule', label: 'Schedule', icon: Calendar },
    { id: 'contacts', label: 'Contacts', icon: Users },
    { id: 'messages', label: 'Messages', icon: MessageSquare },
    { id: 'financials', label: 'Financials', icon: DollarSign }
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-blue-600 text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <h1 className="text-3xl font-bold">skyelineos Construction Management</h1>
          <p className="text-blue-100 mt-1">Streamline your construction projects</p>
        </div>
      </header>

      <nav className="bg-white border-b shadow-sm">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex space-x-1">
            {navItems.map(item => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => setView(item.id)}
                  className={`flex items-center space-x-2 px-4 py-3 text-sm font-medium rounded-none border-b-2 transition-colors ${
                    view === item.id
                      ? 'border-blue-500 text-blue-600 bg-blue-50'
                      : 'border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {view === 'dashboard' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Active Projects</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-blue-600">12</div>
                <p className="text-gray-600">Currently in progress</p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle>This Month Revenue</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-green-600">$485,200</div>
                <p className="text-gray-600">+12% from last month</p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle>Pending Tasks</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-orange-600">28</div>
                <p className="text-gray-600">Across all projects</p>
              </CardContent>
            </Card>
          </div>
        )}

        {view === 'projects' && (
          <Card>
            <CardHeader>
              <CardTitle>Project Management</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="border rounded-lg p-4">
                  <h3 className="font-semibold">Skyline Residence - Phase 1</h3>
                  <p className="text-gray-600">Custom home construction</p>
                  <div className="mt-2">
                    <div className="bg-blue-200 rounded-full h-2 w-full">
                      <div className="bg-blue-600 h-2 rounded-full" style={{width: '65%'}}></div>
                    </div>
                    <span className="text-sm text-gray-500">65% Complete</span>
                  </div>
                </div>
                
                <div className="border rounded-lg p-4">
                  <h3 className="font-semibold">Mountain View Estate</h3>
                  <p className="text-gray-600">Luxury home renovation</p>
                  <div className="mt-2">
                    <div className="bg-green-200 rounded-full h-2 w-full">
                      <div className="bg-green-600 h-2 rounded-full" style={{width: '90%'}}></div>
                    </div>
                    <span className="text-sm text-gray-500">90% Complete</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {view === 'schedule' && (
          <Card>
            <CardHeader>
              <CardTitle>Project Schedule</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex justify-between items-center border-b pb-2">
                  <span className="font-medium">Foundation Work</span>
                  <span className="text-blue-600">In Progress</span>
                </div>
                <div className="flex justify-between items-center border-b pb-2">
                  <span className="font-medium">Framing</span>
                  <span className="text-gray-500">Scheduled</span>
                </div>
                <div className="flex justify-between items-center border-b pb-2">
                  <span className="font-medium">Electrical Rough-In</span>
                  <span className="text-gray-500">Pending</span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {view === 'contacts' && (
          <Card>
            <CardHeader>
              <CardTitle>Contacts & Trades</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex justify-between items-center border-b pb-2">
                  <div>
                    <span className="font-medium">ABC Electrical</span>
                    <p className="text-sm text-gray-600">Licensed Electrician</p>
                  </div>
                  <span className="text-green-600">Active</span>
                </div>
                <div className="flex justify-between items-center border-b pb-2">
                  <div>
                    <span className="font-medium">ProFrame Construction</span>
                    <p className="text-sm text-gray-600">Framing Contractor</p>
                  </div>
                  <span className="text-green-600">Active</span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {view === 'messages' && (
          <Card>
            <CardHeader>
              <CardTitle>Recent Messages</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="border rounded-lg p-3">
                  <div className="flex justify-between items-start">
                    <span className="font-medium">John Smith</span>
                    <span className="text-sm text-gray-500">2 hours ago</span>
                  </div>
                  <p className="text-gray-600 mt-1">Foundation inspection scheduled for tomorrow at 10 AM.</p>
                </div>
                <div className="border rounded-lg p-3">
                  <div className="flex justify-between items-start">
                    <span className="font-medium">Sarah Johnson</span>
                    <span className="text-sm text-gray-500">1 day ago</span>
                  </div>
                  <p className="text-gray-600 mt-1">Material delivery confirmed for Friday morning.</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {view === 'financials' && (
          <Card>
            <CardHeader>
              <CardTitle>Financial Overview</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div className="border rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-green-600">$1,250,000</div>
                  <p className="text-gray-600">Total Revenue</p>
                </div>
                <div className="border rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-blue-600">$950,000</div>
                  <p className="text-gray-600">Total Expenses</p>
                </div>
                <div className="border rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-purple-600">$300,000</div>
                  <p className="text-gray-600">Net Profit</p>
                </div>
                <div className="border rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-orange-600">24%</div>
                  <p className="text-gray-600">Profit Margin</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}