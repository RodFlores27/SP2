export function BookingStatusBadge({ status, bookingType, showChallengerBadge = false }) {
  const getStatusStyles = (s) => {
    switch (s) {
      case 'approved':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'pending_approval':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'penciled':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'contested':
        return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'queued':
        return 'bg-violet-100 text-violet-800 border-violet-200';
      case 'displaced':
        return 'bg-slate-100 text-slate-700 border-slate-200';
      case 'denied':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'cancelled':
        return 'bg-gray-100 text-gray-500 border-gray-200';
      case 'expired':
        return 'bg-gray-100 text-gray-400 border-gray-200';
      case 'completed':
        return 'bg-emerald-50 text-emerald-900 border-emerald-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const formatStatus = (s) => {
    if (!s) return 'Unknown';
    return s
      .split('_')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  };

  const formatType = (t) => {
    if (!t) return '';
    return t.charAt(0).toUpperCase() + t.slice(1);
  };

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span
        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getStatusStyles(status)}`}
      >
        {formatStatus(status)}
      </span>
      {bookingType && (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-secondary text-secondary-foreground border border-border">
          {formatType(bookingType)}
        </span>
      )}
      {showChallengerBadge && (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border border-sky-300 bg-sky-100 text-sky-900">
          Challenger
        </span>
      )}
    </div>
  );
}
