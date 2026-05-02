export function StatusBadge({ status }) {
  const getStatusStyles = (status) => {
    switch (status?.toLowerCase()) {
      case 'available':
        return 'bg-up-forest-green/10 text-up-forest-green border-up-forest-green/25';
      case 'in-use':
      case 'in_use':
        return 'bg-primary/10 text-primary border-primary/25';
      case 'maintenance':
        return 'bg-up-gold/25 text-up-spot-black border-up-gold/50';
      case 'unavailable':
        return 'bg-destructive/10 text-destructive border-destructive/25';
      default:
        return 'bg-muted text-muted-foreground border-border';
    }
  };

  const formatStatus = (status) => {
    if (!status) return 'Unknown';
    return status.replace('_', '-').replace(/\b\w/g, (l) => l.toUpperCase());
  };

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getStatusStyles(
        status
      )}`}
    >
      {formatStatus(status)}
    </span>
  );
}
