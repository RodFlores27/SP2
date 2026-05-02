export function BookingStatusBadge({
  status,
  bookingType,
  showChallengerBadge = false,
  showDefenderBadge = false,
}) {
  const showPrimaryStatus = !(status === 'penciled' && bookingType === 'pencil');

  const getStatusStyles = (s) => {
    switch (s) {
      case 'approved':
        return 'bg-up-forest-green/10 text-up-forest-green border-up-forest-green/25';
      case 'pending_approval':
        return 'bg-up-gold/25 text-up-spot-black border-up-gold/50';
      case 'penciled':
        return 'bg-up-parchment text-up-spot-black border-border';
      case 'on_hold':
        return 'bg-up-gold/15 text-up-spot-black border-up-gold/45';
      case 'contested':
        return 'bg-primary/10 text-primary border-primary/25';
      case 'displaced':
        return 'bg-muted text-muted-foreground border-border';
      case 'denied':
        return 'bg-destructive/10 text-destructive border-destructive/25';
      case 'cancelled':
        return 'bg-muted text-muted-foreground border-border';
      case 'expired':
        return 'bg-muted text-muted-foreground/80 border-border';
      case 'completed':
        return 'bg-up-forest-green/10 text-up-forest-green border-up-forest-green/25';
      default:
        return 'bg-muted text-muted-foreground border-border';
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
      {showPrimaryStatus && (
        <span
          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getStatusStyles(status)}`}
        >
          {formatStatus(status)}
        </span>
      )}
      {bookingType && (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-secondary text-secondary-foreground border border-border">
          {formatType(bookingType)}
        </span>
      )}
      {showChallengerBadge && (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border border-up-forest-green/30 bg-secondary text-up-forest-green">
          Challenger
        </span>
      )}
      {showDefenderBadge && (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border border-primary/30 bg-primary/10 text-primary">
          Defender
        </span>
      )}
    </div>
  );
}
