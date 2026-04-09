import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from '@/contexts/AuthContext';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { Navigation } from '@/components/Navigation';
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import Dashboard from '@/pages/Dashboard';
import EquipmentList from '@/pages/EquipmentList';
import EquipmentDetail from '@/pages/EquipmentDetail';
import RoomList from '@/pages/RoomList';
import RoomDetail from '@/pages/RoomDetail';
import Calendar from '@/pages/Calendar';
import BookingForm from '@/pages/BookingForm';

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <div className="min-h-screen bg-background">
          <Navigation />
          <Routes>
            <Route path="/" element={<Navigate to="/equipment" replace />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/equipment" element={<EquipmentList />} />
            <Route
              path="/equipment/:id"
              element={
                <ProtectedRoute>
                  <EquipmentDetail />
                </ProtectedRoute>
              }
            />
            <Route path="/rooms" element={<RoomList />} />
            <Route
              path="/rooms/:id"
              element={
                <ProtectedRoute>
                  <RoomDetail />
                </ProtectedRoute>
              }
            />
            <Route path="/calendar" element={<Calendar />} />
            <Route
              path="/bookings/new"
              element={
                <ProtectedRoute>
                  <BookingForm />
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              }
            />
          </Routes>
        </div>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
