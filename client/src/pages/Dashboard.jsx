import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function Dashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <Button onClick={handleLogout} variant="outline">
            Logout
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Welcome to PTCF System</CardTitle>
            <CardDescription>
              Plant Tissue Culture Facility - Room & Equipment Reservation Management
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h3 className="font-semibold text-lg mb-2">Your Profile</h3>
              <div className="space-y-2 text-sm">
                <p>
                  <span className="font-medium">Email:</span> {user?.email}
                </p>
                <p>
                  <span className="font-medium">Account Type:</span>{' '}
                  <span className="capitalize">{user?.accountType?.replace('_', ' ')}</span>
                </p>
                {user?.userCategory && (
                  <p>
                    <span className="font-medium">User Category:</span>{' '}
                    <span className="capitalize">{user?.userCategory?.replace('_', ' ')}</span>
                  </p>
                )}
              </div>
            </div>

            <div className="pt-4 border-t">
              <h3 className="font-semibold text-lg mb-2">Quick Actions</h3>
              <p className="text-sm text-muted-foreground">
                Equipment and room management features will be available in the next milestone.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>System Information</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              <p>✅ Authentication system active</p>
              <p>✅ Role-based access control configured</p>
              <p>✅ JWT token management working</p>
              <p>⏳ Equipment & Room CRUD (Coming in Milestone 5)</p>
              <p>⏳ Booking system (Coming soon)</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
