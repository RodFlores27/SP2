import { useState } from 'react';
import { format } from 'date-fns';
import { formatBookingDateRange } from '@/lib/formatBookingDateRange';
import {
  AlertTriangle,
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
import {
  formatBookingTypeLabel,
  formatStatusLabel,
  getFirmCancelBlockedMessage,
  getFirmCancelBlockedReason,
  isCancellable,
  isConvertible,
} from './bookingDashboardUtils';

function getPreviousAttempts(booking) {
  if (!booking?.threadBookings?.length) return [];

  return booking.threadBookings
    .filter((attempt) => attempt.id !== booking.id)
    .filter((attempt) => {
      if (!attempt.createdAt || !booking.createdAt) return true;
      return new Date(attempt.createdAt) < new Date(booking.createdAt);
    })
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
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
  const isConvertOpen = convertOpenId === booking.id;
  const canCancel = onCancel && isCancellable(booking);
  const firmCancelBlockedReason = onCancel ? getFirmCancelBlockedReason(booking) : null;
  const firmCancelBlockedMessage = firmCancelBlockedReason
    ? getFirmCancelBlockedMessage(firmCancelBlockedReason)
    : '';
  const showCancelControl = onCancel && (canCancel || firmCancelBlockedReason);
  const canConvert = onOpenConvert && isConvertible(booking);
  const previousAttempts = getPreviousAttempts(booking);
  const [showPreviousAttempts, setShowPreviousAttempts] = useState(false);
  const [showContestedChallengerDetail, setShowContestedChallengerDetail] = useState(false);
  const [showQueuedDetail, setShowQueuedDetail] = useState(false);
  const [showChallengerDetail, setShowChallengerDetail] = useState(false);
  const hasExistingAuthDoc = Boolean(
    booking.authorizationDocUrl && String(booking.authorizationDocUrl).trim().length > 0
  );
  const canSubmitConvert = Boolean(convertFile || hasExistingAuthDoc);
  const isChallengerBlockedFromConvert = booking.contentionChallenger === true;
  const challengerPlan = booking.challengerContentionPlan;
  const challengerSteps = challengerPlan?.steps ?? [];
  const canRenderConvertSection = isConvertOpen && !isChallengerBlockedFromConvert;

  return (
    <Card>
      <CardContent className="pt-4 pb-4">
        {booking.contentionChallenger === true && (
          <div className="mb-3 flex items-start gap-2 bg-sky-50 border border-sky-200 text-sky-950 px-3 py-2 rounded-md text-sm">
            <Info className="h-4 w-4 mt-0.5 flex-shrink-0 text-sky-700" />
            <div className="min-w-0 space-y-2">
              <p>
                <strong>You are the active challenger</strong> for this booking.
              </p>
              <p>
                Your booking is currently contesting others to secure this slot. To ensure fairness, the
                current constested holder have until the deadline to firm up their bookings. If they do not, the
                contention moves to the next overlap in your path.
              </p>
              {challengerPlan && (
                <div className="border-t border-sky-200/80 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowChallengerDetail((prev) => !prev)}
                    aria-expanded={showChallengerDetail}
                    aria-label={
                      showChallengerDetail ? 'Hide challenger details' : 'View challenger details'
                    }
                    className="inline-flex w-full items-center gap-1 text-left text-xs font-medium text-sky-950"
                  >
                    View details
                    {showChallengerDetail ? (
                      <ChevronUp className="h-3.5 w-3.5 shrink-0 text-sky-700" aria-hidden />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5 shrink-0 text-sky-700" aria-hidden />
                    )}
                  </button>
                  {showChallengerDetail && (
                    <div className="mt-2 text-xs text-sky-900 space-y-2">
                      <p className="font-semibold text-sky-950">Active challenge details</p>
                      <p className="font-semibold text-sky-950">Overlaps on this resource</p>
                      {challengerSteps.length > 0 ? (
                        <ol className="list-decimal pl-4 space-y-1">
                          {challengerSteps.map((step) => (
                            <li key={step.id}>
                              Booking #{step.id} — {formatBookingDateRange(step.startTime, step.endTime)} —{' '}
                              {step.isCurrentDefender ? (
                                <>
                                  Current step
                                  {challengerPlan.deadlineAt
                                    ? ` (Deadline: ${format(
                                        new Date(challengerPlan.deadlineAt),
                                        'MMM d, yyyy h:mm a'
                                      )})`
                                    : ''}
                                </>
                              ) : (
                                'Pending'
                              )}
                            </li>
                          ))}
                        </ol>
                      ) : (
                        <p className="text-sky-800/90">
                          Overlap details are unavailable right now. Refresh the page to retry.
                        </p>
                      )}
                      <p className="text-sky-800/90">
                        Note: <strong>Convert to Firm</strong> is disabled until all overlaps are cleared.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
        {booking.status === 'contested' && (
          <div className="mb-3 flex items-start gap-2 bg-orange-50 border border-orange-200 text-orange-800 px-3 py-2 rounded-md text-sm">
            <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0 text-orange-600" />
            <div className="min-w-0 space-y-2">
              <p>
                This pencil booking is <strong>contested</strong>. Another user is challenging your slot.
                Convert to a firm booking before the deadline to keep it.
              </p>
              {booking.defenderContentionDetail?.challengedBy && (
                <div className="border-t border-orange-200/80 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowContestedChallengerDetail((prev) => !prev)}
                    aria-expanded={showContestedChallengerDetail}
                    aria-label={
                      showContestedChallengerDetail
                        ? 'Hide challenger details'
                        : 'View challenger details'
                    }
                    className="inline-flex w-full items-center gap-1 text-left text-xs font-medium text-orange-900"
                  >
                    View details
                    {showContestedChallengerDetail ? (
                      <ChevronUp className="h-3.5 w-3.5 shrink-0 text-orange-700" aria-hidden />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5 shrink-0 text-orange-700" aria-hidden />
                    )}
                  </button>
                  {showContestedChallengerDetail && (
                    <div className="mt-2 text-xs text-orange-900 space-y-2">
                      <p className="font-semibold text-orange-950">Who is challenging you</p>
                      <ul className="list-disc pl-4 space-y-1">
                        <li>
                          Booking #{booking.defenderContentionDetail.challengedBy.bookingId} —{' '}
                          {formatBookingDateRange(
                            booking.defenderContentionDetail.challengedBy.startTime,
                            booking.defenderContentionDetail.challengedBy.endTime
                          )}
                        </li>
                        {booking.defenderContentionDetail.challengedBy.user?.email && (
                          <li>{booking.defenderContentionDetail.challengedBy.user.email}</li>
                        )}
                      </ul>
                      {booking.defenderContentionDetail.episodeStatus === 'open' &&
                        booking.defenderContentionDetail.deadlineAt && (
                          <p className="text-orange-800/90 pt-1">
                            Response deadline:{' '}
                            <strong>
                              {format(
                                new Date(booking.defenderContentionDetail.deadlineAt),
                                'MMM d, yyyy h:mm a'
                              )}
                            </strong>
                          </p>
                        )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
        {booking.status === 'queued' && (
          <div className="mb-3 flex items-start gap-2 bg-violet-50 border border-violet-200 text-violet-900 px-3 py-2 rounded-md text-sm">
            <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0 text-violet-600" />
            <div className="min-w-0 space-y-2">
              <p>
                Your booking is <strong>queued</strong> behind an active contention on this resource. You
                will be notified when your turn starts.
              </p>
              {booking.queueContentionDetail ? (
                <div className="border-t border-violet-200/80 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowQueuedDetail((prev) => !prev)}
                    aria-expanded={showQueuedDetail}
                    aria-label={
                      showQueuedDetail ? 'Hide queue details' : 'View queue details'
                    }
                    className="inline-flex w-full items-center gap-1 text-left text-xs font-medium text-violet-950"
                  >
                    View details
                    {showQueuedDetail ? (
                      <ChevronUp className="h-3.5 w-3.5 shrink-0 text-violet-700" aria-hidden />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5 shrink-0 text-violet-700" aria-hidden />
                    )}
                  </button>
                  {showQueuedDetail && (
                    <div className="mt-2 text-xs space-y-2">
                      <p className="font-semibold text-violet-950">Waitlist and active contention</p>
                      <p>
                        <span className="font-semibold">Your waitlist position:</span>{' '}
                        <strong>
                          {booking.queueContentionDetail.position} of{' '}
                          {booking.queueContentionDetail.queueLength}
                        </strong>
                        . (Only queued bookings are numbered; the active pair below is not in this count.)
                      </p>
                      {(booking.queueContentionDetail.activeDefender ||
                        booking.queueContentionDetail.activeChallenger) && (
                        <div>
                          <p className="font-semibold text-violet-950">
                            Active contention (ahead of the waitlist)
                          </p>
                          <ul className="list-disc pl-4 space-y-1 text-violet-900">
                            {booking.queueContentionDetail.activeDefender && (
                              <li>
                                Defender — Booking #{booking.queueContentionDetail.activeDefender.bookingId}{' '}
                                {formatBookingDateRange(
                                  booking.queueContentionDetail.activeDefender.startTime,
                                  booking.queueContentionDetail.activeDefender.endTime
                                )}
                                {booking.queueContentionDetail.activeDefender.user?.email && (
                                  <span> ({booking.queueContentionDetail.activeDefender.user.email})</span>
                                )}
                              </li>
                            )}
                            {booking.queueContentionDetail.activeChallenger && (
                              <li>
                                Challenger — Booking #{booking.queueContentionDetail.activeChallenger.bookingId}{' '}
                                {formatBookingDateRange(
                                  booking.queueContentionDetail.activeChallenger.startTime,
                                  booking.queueContentionDetail.activeChallenger.endTime
                                )}
                                {booking.queueContentionDetail.activeChallenger.user?.email && (
                                  <span> ({booking.queueContentionDetail.activeChallenger.user.email})</span>
                                )}
                              </li>
                            )}
                          </ul>
                        </div>
                      )}
                      {booking.queueContentionDetail.aheadInQueue?.length > 0 ? (
                        <div>
                          <p className="font-semibold text-violet-950">Ahead of you in the waitlist</p>
                          <ol className="list-decimal pl-4 space-y-1 text-violet-900">
                            {booking.queueContentionDetail.aheadInQueue.map((row) => (
                              <li key={row.bookingId}>
                                #{row.bookingId} (position {row.position}) —{' '}
                                {formatBookingDateRange(row.startTime, row.endTime)}
                                {row.user?.email && <span> — {row.user.email}</span>}
                              </li>
                            ))}
                          </ol>
                        </div>
                      ) : (
                        <p className="text-violet-800/90">
                          No other bookings ahead of you in the waitlist—you are next after the active pair
                          resolves.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-xs text-violet-800/90">
                  Queue details are unavailable. Refresh the page or contact staff if this persists.
                </p>
              )}
            </div>
          </div>
        )}

        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-sm">#{booking.id}</span>
              <span className="font-medium truncate">{resourceName}</span>
              <span className="text-xs text-muted-foreground capitalize">{booking.resourceType}</span>
            </div>

            <BookingStatusBadge
              status={booking.status}
              bookingType={booking.bookingType}
              showChallengerBadge={booking.contentionChallenger === true}
            />

            <div className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
              <CalendarDays className="h-3.5 w-3.5 flex-shrink-0" />
              <span>{formatBookingDateRange(booking.startTime, booking.endTime)}</span>
            </div>

            {booking.purpose && (
              <p className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">Purpose:</span> {booking.purpose}
              </p>
            )}

            {booking.staffRemark && (
              <p className="text-sm">
                <span className="font-medium">Staff remark:</span>{' '}
                <span className="text-muted-foreground">{booking.staffRemark}</span>
              </p>
            )}

            {previousAttempts.length > 0 && (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm">
                <button
                  type="button"
                  onClick={() => setShowPreviousAttempts((prev) => !prev)}
                  className="flex w-full items-center justify-between gap-2 text-left"
                >
                  <span className="font-medium text-amber-900">
                    Previous attempts ({previousAttempts.length})
                  </span>
                  <span className="text-xs text-amber-700">
                    {showPreviousAttempts ? 'Hide' : 'Show'}
                  </span>
                </button>
                {showPreviousAttempts && (
                  <div className="mt-2 space-y-2">
                    {previousAttempts.map((attempt) => (
                      <div key={attempt.id}>
                        <p className="font-medium text-amber-900">
                          Booking #{attempt.id} ({formatStatusLabel(attempt.status)})
                        </p>
                        <p className="text-xs text-amber-700">
                          {formatBookingDateRange(attempt.startTime, attempt.endTime)}
                        </p>
                      {!!attempt.staffRemark && (
                        <p className="mt-1 text-sm text-amber-800">{attempt.staffRemark}</p>
                      )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {booking.expiryAt && ['penciled', 'contested', 'queued'].includes(booking.status) && (
              <p className="text-xs text-muted-foreground">
                Expires: {format(new Date(booking.expiryAt), 'MMM d, yyyy h:mm a')}
              </p>
            )}

            <AuthorizationDocButton url={booking.authorizationDocUrl} />
          </div>

          <div className="flex flex-row sm:flex-col gap-2 flex-shrink-0">
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
                    Close
                  </>
                ) : (
                  <>
                    <ChevronDown className="h-4 w-4 mr-1" />
                    Convert to Firm
                  </>
                )}
              </Button>
            )}
            {showCancelControl && (
              <div className="flex flex-col gap-1 items-stretch sm:items-end">
                <div className="flex items-center gap-1 justify-end">
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
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>

        {canRenderConvertSection && (
          <div className="mt-4 border-t pt-4 space-y-3">
            <p className="text-sm font-medium">Convert to Firm Booking</p>
            <p className="text-xs text-muted-foreground">
              Convert as a firm request which will be submitted for staff approval.
              {!hasExistingAuthDoc && ' An authorization document is required.'}
            </p>

            <div className="space-y-1.5">
              <label htmlFor={`convert-purpose-${booking.id}`} className="text-sm font-medium leading-none">
                Purpose (optional)
              </label>
              <textarea
                id={`convert-purpose-${booking.id}`}
                value={convertPurpose ?? ''}
                onChange={(e) => onConvertPurposeChange(e.target.value)}
                placeholder="Describe the purpose of your booking..."
                rows={3}
                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>

            {convertError && (
              <div className="bg-red-50 border border-red-200 text-red-800 px-3 py-2 rounded-md text-sm">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <div>
                    <p>{convertError}</p>
                    {convertConflicts && convertConflicts.length > 0 && (
                      <div className="mt-2 space-y-1">
                        <p className="font-medium text-xs">Conflicting bookings:</p>
                        {convertConflicts.map((c) => (
                          <p key={c.id} className="text-xs">
                            #{c.id} {resourceName} &mdash; {formatBookingTypeLabel(c.bookingType)} (
                            {formatStatusLabel(c.status)}) &mdash;{' '}
                            {formatBookingDateRange(c.startTime, c.endTime)}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium leading-none">Authorization Document</label>
              <p className="text-xs text-muted-foreground">
                Upload an authorization letter or supporting document for your firm booking.
              </p>

              {!convertFile ? (
                hasExistingAuthDoc ? (
                  <div className="space-y-2 p-3 border rounded-lg bg-muted/30">
                    <p className="text-sm text-muted-foreground">
                      Using authorization document from previous attempt.
                    </p>
                    <div className="flex items-center justify-between gap-2">
                      <AuthorizationDocButton url={booking.authorizationDocUrl} />
                      <label className="cursor-pointer shrink-0">
                        <Button type="button" variant="outline" size="sm" asChild>
                          <span>Replace File</span>
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
                    <p className="text-sm text-muted-foreground mb-2">
                      PDF, DOC, DOCX, JPG, or PNG (max 5MB)
                    </p>
                    <label className="cursor-pointer">
                      <Button type="button" variant="outline" size="sm" asChild>
                        <span>Choose File</span>
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
                <p className="text-sm text-red-600">{convertFileError}</p>
              )}
            </div>

            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => onConvertSubmit(booking.id)}
                disabled={convertLoading || !canSubmitConvert || isChallengerBlockedFromConvert}
              >
                {convertLoading ? 'Converting...' : 'Submit for Approval'}
              </Button>
              <Button size="sm" variant="outline" onClick={onCloseConvert} disabled={convertLoading}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
