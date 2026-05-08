import { useState } from 'react';
import { format } from 'date-fns';
import { formatBookingDateRange } from '@/lib/formatBookingDateRange';
import { getBookingReference } from '@/lib/bookingReference';
import {
  CalendarDays,
  FileText,
  Info,
  X,
  ChevronDown,
  ChevronUp,
  Upload,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BookingStatusBadge } from '@/components/BookingStatusBadge';
import { AuthorizationDocButton } from './AuthorizationDocButton';
import { bookingMessages } from '@/messages/bookingMessages';
import {
  formatBookingTypeLabel,
  formatStatusLabel,
  getFirmCancelBlockedMessage,
  getFirmCancelBlockedReason,
  isCancellable,
  isConvertible,
  getContentionDeadlineQualifier,
  contentionDeadlineQualifierSentence,
} from './bookingDashboardUtils';

const ac = bookingMessages.myBookings.activeCard;
const alerts = ac.alerts;

function AlertIcon({ icon, className }) {
  const LucideIcon = icon;
  return <LucideIcon className={className} />;
}

/** Renders `alerts.*.title` / `body` per `introInSingleParagraph`. */
function ActiveCardAlertIntro({ alert }) {
  const t = alert.title?.();
  const b = alert.body?.();
  if (t == null && b == null) return null;
  const single = Boolean(alert.introInSingleParagraph || !t || !b);
  if (single) {
    return (
      <p>
        {t}
        {b}
      </p>
    );
  }
  return (
    <>
      {t != null && <p>{t}</p>}
      {b != null && <p>{b}</p>}
    </>
  );
}

function getPreviousAttempts(booking) {
  if (!booking?.threadBookings?.length) return [];

  return booking.threadBookings
    .filter((attempt) => attempt.id !== booking.id)
    .filter((attempt) => {
      if (!attempt.createdAt || !booking.createdAt) return true;
      return new Date(attempt.createdAt) < new Date(booking.createdAt);
    })
    .sort((a, b) => {
      const aTime = new Date(a.historyEvent?.occurredAt || a.updatedAt || a.createdAt).getTime();
      const bTime = new Date(b.historyEvent?.occurredAt || b.updatedAt || b.createdAt).getTime();
      return bTime - aTime;
    });
}

function getDisplayReferenceOrFallback(referenceCode, fallbackId) {
  if (referenceCode && String(referenceCode).trim()) return String(referenceCode).trim();
  if (fallbackId != null) return String(fallbackId);
  return 'another booking';
}

function formatHistoryStatus(status) {
  return String(status || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function getHistoryStateBadgeParts(snapshot) {
  if (!snapshot) return { status: '', bookingType: '' };
  const status = snapshot.status
    ? String(snapshot.status)
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase())
    : '';
  const bookingType = snapshot.bookingType
    ? String(snapshot.bookingType)
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase())
    : '';
  return { status, bookingType };
}

function getHistoryRemark(attempt) {
  const status = String(attempt?.status || '').toLowerCase();
  if (status === 'cancelled') return attempt?.cancellationReason || '';
  if (status === 'denied') return attempt?.staffRemark || '';
  if (status === 'expired') return 'Expired';
  if (status === 'displaced') return 'Displaced';
  return attempt?.staffRemark || attempt?.cancellationReason || '';
}

export function ActiveBookingCard({
  booking,
  resourceName,
  convertOpenId,
  onCancel,
  onOpenConvert,
  onCloseConvert,
  convertFile,
  convertFileError,
  convertLoading,
  convertError,
  convertConflicts,
  onConvertFileChange,
  onConvertSubmit,
  onRemoveConvertFile,
  convertPurpose,
  onConvertPurposeChange,
}) {
  const equipmentRequestTypeLabel =
    booking.resourceType === 'equipment'
      ? booking.equipmentRequestType === 'loan'
        ? 'Loan'
        : 'In-house'
      : null;
  const isConvertOpen = convertOpenId === booking.id;
  const canCancel = onCancel && isCancellable(booking);
  const firmCancelBlockedReason = onCancel ? getFirmCancelBlockedReason(booking) : null;
  const firmCancelBlockedMessage = firmCancelBlockedReason
    ? getFirmCancelBlockedMessage(firmCancelBlockedReason)
    : '';
  const showCancelControl = onCancel && (canCancel || firmCancelBlockedReason);
  const canConvert = onOpenConvert && isConvertible(booking);
  const previousAttempts = getPreviousAttempts(booking);
  const hasUnifiedDetails =
    Boolean(booking.purpose) ||
    booking.resourceType === 'room' ||
    (booking.resourceType === 'equipment' && booking.equipmentRequestType === 'loan') ||
    previousAttempts.length > 0 ||
    Boolean(booking.staffRemark) ||
    Boolean(booking.cancellationReason) ||
    Boolean(booking.probableRebookDate) ||
    (booking.expiryAt && ['penciled', 'contested', 'on_hold'].includes(booking.status));
  const [showDefenderChallengerDetail, setShowDefenderChallengerDetail] = useState(false);
  const [showChallengerDetail, setShowChallengerDetail] = useState(false);
  const [showFirmPendingDetail, setShowFirmPendingDetail] = useState(false);
  const [showOnHoldDetail, setShowOnHoldDetail] = useState(false);
  const [showCardDetails, setShowCardDetails] = useState(false);
  const hasExistingAuthDoc = Boolean(
    booking.authorizationDocUrl && String(booking.authorizationDocUrl).trim().length > 0
  );
  const canSubmitConvert = Boolean(convertFile || hasExistingAuthDoc);
  const isChallengerBlockedFromConvert = booking.contentionChallenger === true;
  const canRenderConvertSection = isConvertOpen && !isChallengerBlockedFromConvert;
  const detail = booking.contentionDetail;
  const isDefenderInContention =
    booking.bookingType === 'pencil' &&
    !booking.contentionChallenger &&
    (booking.contentionRole === 'defender' ||
      (booking.status === 'contested' && !booking.contentionRole));
  const challengerDefenderStart = detail?.role === 'challenger' ? detail.defender?.startTime : null;
  const challengerDeadlineQualifier = getContentionDeadlineQualifier(
    detail?.deadlineAt,
    challengerDefenderStart ?? booking.startTime,
    booking.expiryAt
  );
  const defenderDeadlineQualifier = getContentionDeadlineQualifier(
    detail?.deadlineAt ?? booking.contentionDeadlineAt,
    booking.startTime,
    booking.expiryAt
  );

  return (
    <Card>
      <CardContent className="pt-4 pb-4">
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-[1.2fr_1fr_auto] md:items-start">
            <div className="space-y-1 min-w-0">
              <p className="font-medium truncate">{resourceName}</p>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-sm">{getBookingReference(booking)}</span>
                <span className="text-xs text-muted-foreground capitalize">{booking.resourceType}</span>
                {equipmentRequestTypeLabel && (
                  <span className="inline-flex items-center rounded-full border border-primary/20 bg-primary/5 px-2 py-0.5 text-[11px] font-medium text-primary">
                    {equipmentRequestTypeLabel}
                  </span>
                )}
              </div>
            </div>

            <div className="space-y-1 min-w-0">
              <div className="text-sm text-muted-foreground flex items-center gap-1">
                <CalendarDays className="h-3.5 w-3.5 flex-shrink-0" />
                <span>{formatBookingDateRange(booking.startTime, booking.endTime)}</span>
              </div>
              <BookingStatusBadge
                status={booking.status}
                bookingType={booking.bookingType}
                showChallengerBadge={booking.contentionChallenger === true}
                showDefenderBadge={isDefenderInContention}
              />
            </div>

            <div className="flex flex-row md:flex-col gap-2 md:items-end">
              {canConvert && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={isChallengerBlockedFromConvert}
                  onClick={() => (isConvertOpen ? onCloseConvert() : onOpenConvert(booking.id))}
                >
                  {isConvertOpen ? (
                    <>
                      <ChevronUp className="h-4 w-4 mr-1" />
                      {ac.convertPanel.close()}
                    </>
                  ) : (
                    <>
                      <ChevronDown className="h-4 w-4 mr-1" />
                      {ac.convertPanel.convertToFirm()}
                    </>
                  )}
                </Button>
              )}
              {showCancelControl && (
                <div className="flex items-center gap-1 md:justify-end">
                  {firmCancelBlockedReason && (
                    <button
                      type="button"
                      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      title={firmCancelBlockedMessage}
                      aria-label={firmCancelBlockedMessage}
                    >
                      <Info className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  )}
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={!canCancel}
                    onClick={() => canCancel && onCancel(booking.id)}
                  >
                    {ac.convertPanel.buttonCancelBooking()}
                  </Button>
                </div>
              )}
            </div>
          </div>

          {booking.bookingType === 'firm' &&
            booking.status === 'pending_approval' &&
            booking.overlappingOnHoldPencils?.length > 0 && (
              <div className="flex items-start gap-2 bg-accent border border-up-gold/30 text-accent-foreground px-3 py-2 rounded-md text-sm">
                <AlertIcon
                  icon={alerts.firmPendingOnHold.icon}
                  className="h-4 w-4 mt-0.5 flex-shrink-0 text-primary"
                />
                <div className="min-w-0 space-y-2">
                  <p>
                    {alerts.firmPendingOnHold.summaryLine({
                      count: booking.overlappingOnHoldPencils.length,
                    })}
                  </p>
                  <div className="border-t border-up-gold/30 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowFirmPendingDetail((prev) => !prev)}
                      aria-expanded={showFirmPendingDetail}
                      aria-label={
                        showFirmPendingDetail
                          ? alerts.firmPendingOnHold.toggleAriaHide
                          : alerts.firmPendingOnHold.toggleAriaView
                      }
                      className="inline-flex w-full items-center gap-1 text-left text-xs font-medium text-accent-foreground"
                    >
                      {showFirmPendingDetail
                        ? alerts.firmPendingOnHold.toggleHideDetails
                        : alerts.firmPendingOnHold.toggleViewDetails}
                      {showFirmPendingDetail ? (
                        <ChevronUp className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
                      )}
                    </button>
                    {showFirmPendingDetail && (
                      <div className="mt-2 space-y-2 text-xs text-accent-foreground">
                        <p>{alerts.firmPendingOnHold.detailsBody()}</p>
                        <p className="font-medium text-accent-foreground">
                          {alerts.firmPendingOnHold.listHeading()}
                        </p>
                        <ul className="list-disc pl-4 space-y-1">
                          {booking.overlappingOnHoldPencils.map((p) => (
                            <li key={p.id}>
                              {getBookingReference(p)} — {formatBookingDateRange(p.startTime, p.endTime)}
                              {p.user?.email ? ` (${p.user.email})` : ''}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

          {booking.bookingType === 'pencil' && booking.status === 'on_hold' && (
            <div className="flex items-start gap-2 bg-accent border border-up-gold/40 text-accent-foreground px-3 py-2 rounded-md text-sm">
              <AlertIcon
                icon={alerts.pencilOnHold.icon}
                className="h-4 w-4 mt-0.5 flex-shrink-0 text-primary"
              />
              <div className="min-w-0 space-y-2">
                <p>
                  {alerts.pencilOnHold.summaryLine({
                    count: booking.overlappingFirmBookings?.length ?? 0,
                  })}
                </p>
                <div className="border-t border-up-gold/30 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowOnHoldDetail((prev) => !prev)}
                    aria-expanded={showOnHoldDetail}
                    aria-label={
                      showOnHoldDetail
                        ? alerts.pencilOnHold.toggleAriaHide
                        : alerts.pencilOnHold.toggleAriaView
                    }
                    className="inline-flex w-full items-center gap-1 text-left text-xs font-medium text-accent-foreground"
                  >
                    {showOnHoldDetail
                      ? alerts.pencilOnHold.toggleHideDetails
                      : alerts.pencilOnHold.toggleViewDetails}
                    {showOnHoldDetail ? (
                      <ChevronUp className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
                    )}
                  </button>
                  {showOnHoldDetail && (
                    <div className="mt-2 space-y-2 text-xs text-accent-foreground">
                      <p>{alerts.pencilOnHold.detailsBody()}</p>
                      {booking.overlappingFirmBookings?.length > 0 && (
                        <>
                          <p className="font-medium text-accent-foreground">
                            {alerts.pencilOnHold.overlappingFirmsListHeading()}
                          </p>
                          <ul className="list-disc pl-4 space-y-1">
                            {booking.overlappingFirmBookings.map((f) => (
                              <li key={f.id}>
                                {getBookingReference(f)} — {formatBookingTypeLabel(f.bookingType)} (
                                {formatStatusLabel(f.status)}) —{' '}
                                {formatBookingDateRange(f.startTime, f.endTime)}
                                {f.user?.email ? ` (${f.user.email})` : ''}
                              </li>
                            ))}
                          </ul>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {booking.contentionChallenger === true && (
            <div className="flex items-start gap-2 bg-secondary border border-up-forest-green/20 text-up-forest-green px-3 py-2 rounded-md text-sm">
              <AlertIcon
                icon={alerts.challenger.icon}
                className="h-4 w-4 mt-0.5 flex-shrink-0 text-up-forest-green"
              />
              <div className="min-w-0 space-y-2">
                {detail?.defender && detail?.deadlineAt ? (
                  <p>
                    {alerts.challenger.summaryLine({
                      bookingId: getDisplayReferenceOrFallback(
                        detail.defender.referenceCode,
                        detail.defender.bookingId
                      ),
                      formattedDeadline: format(new Date(detail.deadlineAt), 'MMM d, yyyy h:mm a'),
                    })}
                  </p>
                ) : (
                  <ActiveCardAlertIntro alert={alerts.challenger} />
                )}
                {detail?.defender && (
                  <div className="border-t border-up-forest-green/20 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowChallengerDetail((prev) => !prev)}
                      aria-expanded={showChallengerDetail}
                      aria-label={
                        showChallengerDetail
                          ? alerts.challenger.toggleAriaHide
                          : alerts.challenger.toggleAriaView
                      }
                      className="inline-flex w-full items-center gap-1 text-left text-xs font-medium text-up-forest-green"
                    >
                      {showChallengerDetail
                        ? alerts.challenger.toggleHideDetails
                        : alerts.challenger.toggleViewDetails}
                      {showChallengerDetail ? (
                        <ChevronUp className="h-3.5 w-3.5 shrink-0 text-up-forest-green" aria-hidden />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-up-forest-green" aria-hidden />
                      )}
                    </button>
                    {showChallengerDetail && (
                      <div className="mt-2 space-y-2 text-xs text-up-forest-green">
                        <p>{alerts.challenger.detailsBody()}</p>
                        {detail.deadlineAt && contentionDeadlineQualifierSentence(challengerDeadlineQualifier) && (
                          <p className="text-up-forest-green/90">
                            {contentionDeadlineQualifierSentence(challengerDeadlineQualifier)}
                          </p>
                        )}
                        <p className="font-semibold text-up-forest-green">
                          {alerts.challenger.whoDefenderHeading()}
                        </p>
                        <ul className="list-disc pl-4 space-y-1">
                          <li>
                            {alerts.challenger.defenderSummaryLine({
                              bookingId: getDisplayReferenceOrFallback(
                                detail.defender.referenceCode,
                                detail.defender.bookingId
                              ),
                              timeRange: formatBookingDateRange(
                                detail.defender.startTime,
                                detail.defender.endTime
                              ),
                            })}
                          </li>
                          {detail.defender.user?.email && <li>{detail.defender.user.email}</li>}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {isDefenderInContention && (
            <div className="flex items-start gap-2 bg-primary/10 border border-primary/25 text-primary px-3 py-2 rounded-md text-sm">
              <AlertIcon
                icon={alerts.defender.icon}
                className="h-4 w-4 mt-0.5 flex-shrink-0 text-primary"
              />
              <div className="min-w-0 space-y-2">
                {(detail?.deadlineAt || booking.contentionDeadlineAt) ? (
                  <p>
                    {alerts.defender.summaryLine({
                      formattedDeadline: format(
                        new Date(detail?.deadlineAt ?? booking.contentionDeadlineAt),
                        'MMM d, yyyy h:mm a'
                      ),
                    })}
                  </p>
                ) : (
                  <ActiveCardAlertIntro alert={alerts.defender} />
                )}
                {detail?.challenger && (
                  <div className="border-t border-primary/20 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowDefenderChallengerDetail((prev) => !prev)}
                      aria-expanded={showDefenderChallengerDetail}
                      aria-label={
                        showDefenderChallengerDetail
                          ? alerts.defender.toggleAriaHide
                          : alerts.defender.toggleAriaView
                      }
                      className="inline-flex w-full items-center gap-1 text-left text-xs font-medium text-primary"
                    >
                      {alerts.defender.toggleViewDetails}
                      {showDefenderChallengerDetail ? (
                        <ChevronUp className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
                      )}
                    </button>
                    {showDefenderChallengerDetail && (
                      <div className="mt-2 text-xs text-primary space-y-2">
                        <p>{alerts.defender.detailsBody()}</p>
                        {(detail?.deadlineAt || booking.contentionDeadlineAt) && (
                          <p>
                            {alerts.defender.deadlineLine({
                              formattedDeadline: format(
                                new Date(detail?.deadlineAt ?? booking.contentionDeadlineAt),
                                'MMM d, yyyy h:mm a'
                              ),
                            })}
                            {contentionDeadlineQualifierSentence(defenderDeadlineQualifier) && (
                              <span className="block mt-1 text-primary/90">
                                {contentionDeadlineQualifierSentence(defenderDeadlineQualifier)}
                              </span>
                            )}
                          </p>
                        )}
                        <p className="font-semibold text-primary">
                          {alerts.defender.whoChallengesHeading()}
                        </p>
                        <ul className="list-disc pl-4 space-y-1">
                          <li>
                            {alerts.defender.challengerSummaryLine({
                              bookingId: getDisplayReferenceOrFallback(
                                detail.challenger.referenceCode,
                                detail.challenger.bookingId
                              ),
                              timeRange: formatBookingDateRange(
                                detail.challenger.startTime,
                                detail.challenger.endTime
                              ),
                            })}
                          </li>
                          {detail.challenger.user?.email && <li>{detail.challenger.user.email}</li>}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {hasUnifiedDetails && (
            <div className="rounded-md border border-border bg-muted/20">
              <button
                type="button"
                onClick={() => setShowCardDetails((prev) => !prev)}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm font-medium"
                aria-expanded={showCardDetails}
              >
                <span>{showCardDetails ? 'Hide Details' : 'View Details'}</span>
                {showCardDetails ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground" aria-hidden />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" aria-hidden />
                )}
              </button>
              {showCardDetails && (
                <div className="border-t border-border px-3 py-3 space-y-3 text-sm">
                  {booking.purpose && (
                    <div>
                      <p className="font-medium text-foreground">{ac.meta.purposeLabel()}</p>
                      <p className="text-muted-foreground whitespace-pre-wrap break-words">{booking.purpose}</p>
                      {booking.staffRemark && (
                        <p className="mt-1.5">
                          <span className="font-medium">{ac.meta.staffRemarkLabel()}</span>{' '}
                          <span className="text-muted-foreground">{booking.staffRemark}</span>
                        </p>
                      )}
                    </div>
                  )}

                  {(booking.resourceType === 'room' ||
                    (booking.resourceType === 'equipment' && booking.equipmentRequestType === 'loan')) && (
                    <div className="space-y-2">
                      <p className="font-medium text-foreground">
                        {booking.resourceType === 'room' ? 'Room request details:' : 'Loan request details:'}
                      </p>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {booking.resourceType === 'equipment' && booking.equipmentRequestType === 'loan' && (
                          <>
                            <div className="space-y-1 min-w-0">
                              <p className="text-[11px] font-semibold tracking-wide uppercase text-muted-foreground">Reason</p>
                              <p className="break-words text-foreground">{booking.loanReason || '—'}</p>
                            </div>
                            <div className="space-y-1 min-w-0">
                              <p className="text-[11px] font-semibold tracking-wide uppercase text-muted-foreground">Workflow Note</p>
                              <p className="break-words text-foreground">{booking.loanWorkflowNote || '—'}</p>
                            </div>
                            <div className="space-y-1 min-w-0">
                              <p className="text-[11px] font-semibold tracking-wide uppercase text-muted-foreground">Transport Plan</p>
                              <p className="break-words text-foreground">{booking.loanTransportPlan || '—'}</p>
                            </div>
                          </>
                        )}
                        {booking.resourceType === 'room' && (
                          <>
                            <div className="space-y-1 min-w-0">
                              <p className="text-[11px] font-semibold tracking-wide uppercase text-muted-foreground">Expected Participants</p>
                              <p className="break-words text-foreground">{booking.roomParticipantCount ?? '—'}</p>
                            </div>
                            <div className="space-y-1 min-w-0">
                              <p className="text-[11px] font-semibold tracking-wide uppercase text-muted-foreground">Event Equipment Needs</p>
                              <p className="break-words text-foreground">{booking.roomEquipmentNeeds || '—'}</p>
                            </div>
                            <div className="space-y-1 min-w-0">
                              <p className="text-[11px] font-semibold tracking-wide uppercase text-muted-foreground">Setup & Catering</p>
                              <p className="break-words text-foreground">{booking.roomSetupRequirements || '—'}</p>
                            </div>
                            <div className="space-y-1 min-w-0 sm:col-span-2 lg:col-span-3">
                              <p className="text-[11px] font-semibold tracking-wide uppercase text-muted-foreground">Program / Event Details</p>
                              <p className="break-words text-foreground">{booking.roomProgramDetails || '—'}</p>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  )}

                  {previousAttempts.length > 0 && (
                    <div className="space-y-2 rounded-md border border-border bg-muted/40 px-3 py-3">
                      <p className="font-medium text-foreground">History ({previousAttempts.length})</p>
                      <div
                        className={
                          previousAttempts.length > 2
                            ? 'max-h-[9rem] overflow-y-auto pr-1'
                            : ''
                        }
                      >
                        <div className="relative">
                          <div className="space-y-4">
                            {previousAttempts.map((attempt, index) => {
                              const rowOpacity =
                                index === 0
                                  ? 'opacity-100'
                                  : index === 1
                                    ? 'opacity-[0.85]'
                                    : 'opacity-[0.7]';
                              const bulletClass =
                                index === 0
                                  ? 'border-primary/70 bg-primary ring-2 ring-primary/25'
                                  : 'border-border bg-muted-foreground/70';
                              const stemClass =
                                index === 0
                                  ? 'bg-border/70'
                                  : index === 1
                                    ? 'bg-border/55'
                                    : 'bg-border/40';
                              return (
                                <div key={attempt.id} className={`relative ${rowOpacity}`}>
                                  <div className={`absolute left-3 top-0 bottom-0 w-px ${stemClass}`} />
                                  <div className="grid grid-cols-[9.5rem_1fr] gap-3 pl-0">
                                    <div className="pt-0.5 text-xs text-muted-foreground whitespace-nowrap">
                                      {format(
                                        new Date(
                                          attempt.historyEvent?.occurredAt ||
                                            attempt.updatedAt ||
                                            attempt.createdAt
                                        ),
                                        'MMM d, yyyy h:mm a'
                                      )}
                                    </div>
                                    <div className="relative min-w-0 pb-0.5">
                                      <span
                                        className={`absolute -left-[1.95rem] top-[0.35rem] h-2.5 w-2.5 rounded-full border ${bulletClass}`}
                                      />
                                      <p className="text-sm break-words">
                                        <span className="font-semibold">{formatHistoryStatus(attempt.status)}</span>
                                        {' — '}
                                        <span className="font-medium text-foreground">
                                          {getBookingReference(attempt)}
                                        </span>
                                        {(() => {
                                          const badgeParts = getHistoryStateBadgeParts(
                                            attempt.historyEvent?.stateBeforeEvent
                                          );
                                          if (!badgeParts.status && !badgeParts.bookingType) return null;
                                          return (
                                            <span className="ml-2 inline-flex flex-wrap items-center gap-1.5 align-middle">
                                              {badgeParts.status && (
                                                <span className="inline-flex items-center rounded-full border border-border bg-background px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                                                  {badgeParts.status}
                                                </span>
                                              )}
                                              {badgeParts.bookingType && (
                                                <span className="inline-flex items-center rounded-full border border-border bg-background px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                                                  {badgeParts.bookingType}
                                                </span>
                                              )}
                                            </span>
                                          );
                                        })()}
                                      </p>
                                      {!!getHistoryRemark(attempt) && (
                                        <p className="mt-1 text-sm italic text-muted-foreground break-words">
                                          Remark: {getHistoryRemark(attempt)}
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {(booking.cancellationReason || booking.probableRebookDate) && (
                    <div className="space-y-1.5">
                      {booking.cancellationReason && (
                        <p>
                          <span className="font-medium">Cancellation reason:</span>{' '}
                          <span className="text-muted-foreground">{booking.cancellationReason}</span>
                        </p>
                      )}
                      {booking.probableRebookDate && (
                        <p>
                          <span className="font-medium">Probable rebook date:</span>{' '}
                          <span className="text-muted-foreground">
                            {format(new Date(booking.probableRebookDate), 'MMM d, yyyy h:mm a')}
                          </span>
                        </p>
                      )}
                    </div>
                  )}

                  {booking.expiryAt && ['penciled', 'contested', 'on_hold'].includes(booking.status) && (
                    <p className="text-xs text-muted-foreground">
                      {ac.meta.expiresPrefix()} {format(new Date(booking.expiryAt), 'MMM d, yyyy h:mm a')}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          <AuthorizationDocButton url={booking.authorizationDocUrl} />
        </div>

        {canRenderConvertSection && (
          <div className="mt-4 border-t pt-4 space-y-3">
            <p className="text-sm font-medium">{ac.convertPanel.convertSectionTitle()}</p>
            <p className="text-xs text-muted-foreground">
              {ac.convertPanel.convertSectionBlurb()}
              {!hasExistingAuthDoc ? ac.convertPanel.convertAuthRequiredSuffix() : null}
            </p>

            <div className="space-y-1.5">
              <label htmlFor={`convert-purpose-${booking.id}`} className="text-sm font-medium leading-none">
                {ac.convertPanel.convertPurposeLabel()}
              </label>
              <textarea
                id={`convert-purpose-${booking.id}`}
                value={convertPurpose ?? ''}
                onChange={(e) => onConvertPurposeChange(e.target.value)}
                placeholder={ac.convertPanel.convertPurposePlaceholder}
                rows={3}
                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>

            {convertError && (
              <div className="bg-destructive/10 border border-destructive/20 text-destructive px-3 py-2 rounded-md text-sm">
                <div className="flex items-start gap-2">
                  <AlertIcon
                    icon={ac.convertPanel.icons.convertError}
                    className="h-4 w-4 mt-0.5 flex-shrink-0"
                  />
                  <div>
                    <p>{convertError}</p>
                    {convertConflicts && convertConflicts.length > 0 && (
                      <div className="mt-2 space-y-1">
                        <p className="font-medium text-xs">{ac.convertPanel.convertConflictsHeading()}</p>
                        {convertConflicts.map((c) => (
                          <p key={c.id} className="text-xs">
                            {ac.convertPanel.convertConflictLine({
                              id: c.id,
                              resourceName,
                              typeLabel: formatBookingTypeLabel(c.bookingType),
                              statusLabel: formatStatusLabel(c.status),
                              range: formatBookingDateRange(c.startTime, c.endTime),
                            })}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium leading-none">{ac.convertPanel.convertAuthLabel()}</label>
              <p className="text-xs text-muted-foreground">{ac.convertPanel.convertAuthHint()}</p>

              {!convertFile ? (
                hasExistingAuthDoc ? (
                  <div className="space-y-2 p-3 border rounded-lg bg-muted/30">
                    <p className="text-sm text-muted-foreground">{ac.convertPanel.convertUsingPreviousDoc()}</p>
                    <div className="flex items-center justify-between gap-2">
                      <AuthorizationDocButton url={booking.authorizationDocUrl} />
                      <label className="cursor-pointer shrink-0">
                        <Button type="button" variant="outline" size="sm" asChild>
                          <span>{ac.convertPanel.replaceFile()}</span>
                        </Button>
                        <input
                          type="file"
                          className="hidden"
                          accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                          onChange={onConvertFileChange}
                        />
                      </label>
                    </div>
                  </div>
                ) : (
                  <div className="border-2 border-dashed border-border rounded-lg p-6 text-center hover:border-muted-foreground/50 transition-colors">
                    <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground mb-2">{ac.convertPanel.dropzoneTypes()}</p>
                    <label className="cursor-pointer">
                      <Button type="button" variant="outline" size="sm" asChild>
                        <span>{ac.convertPanel.chooseFile()}</span>
                      </Button>
                      <input
                        type="file"
                        className="hidden"
                        accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                        onChange={onConvertFileChange}
                      />
                    </label>
                  </div>
                )
              ) : (
                <div className="flex items-center gap-3 p-3 border rounded-lg bg-muted/50">
                  <FileText className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{convertFile.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {(convertFile.size / 1024).toFixed(1)} KB
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={onRemoveConvertFile}
                    className="flex-shrink-0"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}

              {convertFileError && (
                <p className="text-sm text-destructive">{convertFileError}</p>
              )}
            </div>

            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => onConvertSubmit(booking.id)}
                disabled={convertLoading || !canSubmitConvert || isChallengerBlockedFromConvert}
              >
                {convertLoading ? ac.convertPanel.convertSubmitLoading() : ac.convertPanel.convertSubmit()}
              </Button>
              <Button size="sm" variant="outline" onClick={onCloseConvert} disabled={convertLoading}>
                {ac.convertPanel.cancel()}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
