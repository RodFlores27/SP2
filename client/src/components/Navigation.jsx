import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/useAuth';
import { Button } from '@/components/ui/button';
import { ChevronDown, Menu, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

export function Navigation() {
  const { user, logout, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [manageMenuOpen, setManageMenuOpen] = useState(false);
  const manageMenuRef = useRef(null);
  const canManage =
    isAuthenticated &&
    (user?.accountType === 'ptcf_staff' ||
      user?.accountType === 'system_admin');
  const isSystemAdmin = isAuthenticated && user?.accountType === 'system_admin';

  const handleLogout = () => {
    logout();
    navigate('/login');
    setMobileMenuOpen(false);
    setManageMenuOpen(false);
  };

  useEffect(() => {
    if (!manageMenuOpen) return undefined;

    const handlePointerDown = (event) => {
      if (!manageMenuRef.current?.contains(event.target)) {
        setManageMenuOpen(false);
      }
    };

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setManageMenuOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [manageMenuOpen]);

  const navLinkClass =
    'inline-flex h-9 items-center whitespace-nowrap rounded-md px-2 text-sm font-medium text-foreground/85 transition-colors hover:bg-accent hover:text-primary';
  const dropdownLinkClass =
    'block whitespace-nowrap rounded-sm px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent hover:text-primary';
  const mobileNavLinkClass =
    'block px-4 py-2 text-base font-medium text-foreground transition-colors hover:bg-accent hover:text-primary';

  return (
    <nav className="border-b border-border/80 bg-card/95 shadow-sm">
      <div className="h-1 bg-gradient-to-r from-primary via-up-gold to-up-forest-green" aria-hidden="true" />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 justify-between">
          <div className="flex min-w-0 flex-1">
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
            <div className="hidden min-w-0 items-center gap-1 xl:ml-5 xl:flex xl:gap-2">
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
              <Link
                to="/guidelines"
                className={navLinkClass}
              >
                Guidelines
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
              {canManage && (
                <div
                  ref={manageMenuRef}
                  className="relative"
                >
                  <button
                    type="button"
                    className={`${navLinkClass} gap-1`}
                    aria-expanded={manageMenuOpen}
                    aria-haspopup="menu"
                    onClick={() => setManageMenuOpen((open) => !open)}
                  >
                    Manage
                    <ChevronDown className="h-4 w-4" aria-hidden="true" />
                  </button>
                  {manageMenuOpen && (
                    <div
                      className="absolute left-0 top-full z-50 mt-2 w-48 rounded-md border border-border bg-popover p-1 shadow-lg"
                      role="menu"
                    >
                      <Link
                        to="/staff"
                        className={dropdownLinkClass}
                        role="menuitem"
                        onClick={() => setManageMenuOpen(false)}
                      >
                        Staff Dashboard
                      </Link>
                      {isSystemAdmin && (
                        <Link
                          to="/admin"
                          className={dropdownLinkClass}
                          role="menuitem"
                          onClick={() => setManageMenuOpen(false)}
                        >
                          Admin Panel
                        </Link>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="hidden min-w-0 flex-shrink-0 xl:ml-4 xl:flex xl:items-center xl:gap-3">
            {isAuthenticated ? (
              <>
                <span
                  className="block max-w-[8.5rem] truncate text-right text-sm text-muted-foreground xl:max-w-[10rem] 2xl:max-w-[14rem]"
                  title={user?.email}
                >
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
          <div className="flex items-center xl:hidden">
            <button
              onClick={() => {
                setMobileMenuOpen(!mobileMenuOpen);
                setManageMenuOpen(false);
              }}
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
        <div className="xl:hidden bg-card">
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
            <Link
              to="/guidelines"
              className={mobileNavLinkClass}
              onClick={() => setMobileMenuOpen(false)}
            >
              Guidelines
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
                <div className="break-all px-4 py-2 text-sm text-muted-foreground">
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
