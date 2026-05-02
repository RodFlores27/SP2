import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/useAuth';
import { Button } from '@/components/ui/button';
import { Menu, X } from 'lucide-react';
import { useState } from 'react';

export function Navigation() {
  const { user, logout, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
    setMobileMenuOpen(false);
  };

  const navLinkClass =
    'inline-flex items-center rounded-md px-2 py-1 text-sm font-medium text-foreground/85 transition-colors hover:bg-accent hover:text-primary';
  const mobileNavLinkClass =
    'block px-4 py-2 text-base font-medium text-foreground transition-colors hover:bg-accent hover:text-primary';

  return (
    <nav className="border-b border-border/80 bg-card/95 shadow-sm">
      <div className="h-1 bg-gradient-to-r from-primary via-up-gold to-up-forest-green" aria-hidden="true" />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex">
            <div className="flex-shrink-0 flex items-center">
              <Link to="/dashboard" className="group leading-tight">
                <span className="block font-heading text-xl font-bold text-primary">
                  PTCF Reservation
                </span>
                <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-up-forest-green">
                  Plant Tissue Culture Facility
                </span>
              </Link>
            </div>
            <div className="hidden sm:ml-6 sm:flex sm:space-x-8">
              <Link
                to="/equipment"
                className={navLinkClass}
              >
                Equipment
              </Link>
              <Link
                to="/rooms"
                className={navLinkClass}
              >
                Rooms
              </Link>
              <Link
                to="/calendar"
                className={navLinkClass}
              >
                Calendar
              </Link>
              {isAuthenticated && (
                <Link
                  to="/bookings/new"
                  className={navLinkClass}
                >
                  Book Now
                </Link>
              )}
              {isAuthenticated && (
                <Link
                  to="/dashboard"
                  className={navLinkClass}
                >
                  My Bookings
                </Link>
              )}
              {isAuthenticated &&
                (user?.accountType === 'ptcf_staff' ||
                  user?.accountType === 'system_admin') && (
                  <Link
                    to="/staff"
                    className={navLinkClass}
                  >
                    Staff Dashboard
                  </Link>
                )}
              {isAuthenticated && user?.accountType === 'system_admin' && (
                <Link
                  to="/admin"
                  className={navLinkClass}
                >
                  Admin Panel
                </Link>
              )}
            </div>
          </div>
          <div className="hidden sm:ml-6 sm:flex sm:items-center sm:space-x-4">
            {isAuthenticated ? (
              <>
                <span className="text-sm text-muted-foreground">
                  {user?.email}
                </span>
                <Button onClick={handleLogout} variant="outline" size="sm">
                  Logout
                </Button>
              </>
            ) : (
              <>
                <Link to="/login">
                  <Button variant="outline" size="sm">
                    Login
                  </Button>
                </Link>
                <Link to="/register">
                  <Button size="sm">Register</Button>
                </Link>
              </>
            )}
          </div>
          <div className="flex items-center sm:hidden">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="inline-flex items-center justify-center p-2 rounded-md text-foreground hover:bg-accent hover:text-primary"
            >
              {mobileMenuOpen ? (
                <X className="h-6 w-6" />
              ) : (
                <Menu className="h-6 w-6" />
              )}
            </button>
          </div>
        </div>
      </div>

      {mobileMenuOpen && (
        <div className="sm:hidden bg-card">
          <div className="pt-2 pb-3 space-y-1">
            <Link
              to="/equipment"
              className={mobileNavLinkClass}
              onClick={() => setMobileMenuOpen(false)}
            >
              Equipment
            </Link>
            <Link
              to="/rooms"
              className={mobileNavLinkClass}
              onClick={() => setMobileMenuOpen(false)}
            >
              Rooms
            </Link>
            <Link
              to="/calendar"
              className={mobileNavLinkClass}
              onClick={() => setMobileMenuOpen(false)}
            >
              Calendar
            </Link>
            {isAuthenticated && (
              <Link
                to="/bookings/new"
                className={mobileNavLinkClass}
                onClick={() => setMobileMenuOpen(false)}
              >
                Book Now
              </Link>
            )}
            {isAuthenticated && (
              <Link
                to="/dashboard"
                className={mobileNavLinkClass}
                onClick={() => setMobileMenuOpen(false)}
              >
                My Bookings
              </Link>
            )}
            {isAuthenticated &&
              (user?.accountType === 'ptcf_staff' ||
                user?.accountType === 'system_admin') && (
                <Link
                  to="/staff"
                  className={mobileNavLinkClass}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Staff Dashboard
                </Link>
              )}
            {isAuthenticated && user?.accountType === 'system_admin' && (
              <Link
                to="/admin"
                className={mobileNavLinkClass}
                onClick={() => setMobileMenuOpen(false)}
              >
                Admin Panel
              </Link>
            )}
          </div>
          <div className="pt-4 pb-3 border-t border-border">
            {isAuthenticated ? (
              <div className="space-y-1">
                <div className="px-4 py-2 text-sm text-muted-foreground">
                  {user?.email}
                </div>
                <button
                  onClick={handleLogout}
                  className="block w-full text-left px-4 py-2 text-base font-medium text-foreground hover:bg-accent hover:text-primary"
                >
                  Logout
                </button>
              </div>
            ) : (
              <div className="space-y-1">
                <Link
                  to="/login"
                  className={mobileNavLinkClass}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Login
                </Link>
                <Link
                  to="/register"
                  className={mobileNavLinkClass}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Register
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}
