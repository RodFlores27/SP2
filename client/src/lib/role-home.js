export function getRoleHomePath(user) {
  if (user?.accountType === 'system_admin') return '/admin';
  if (user?.accountType === 'ptcf_staff') return '/staff';
  return '/dashboard';
}

