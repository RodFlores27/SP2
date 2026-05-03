import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  BookOpen,
  Building2,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  FileText,
  HelpCircle,
  Hourglass,
  Info,
  RotateCcw,
  Wrench,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

const processSteps = [
  'Log in or register for a regular user account.',
  'Choose Equipment or Rooms, then review the resource details and availability calendar.',
  'Open the booking form from a resource page, the calendar, or Book Now.',
  'Select the resource, booking type, start time, end time, and purpose.',
  'Upload an authorization document when creating or converting to a firm booking.',
  'Submit the booking and respond to any overlap or contention notice shown by the system.',
  'Track updates in My Bookings and check your registered email for notices.',
];

const rules = [
  'New bookings cannot be created when the schedule starts within 24 hours.',
  'Pencil bookings expire at the earlier of 3 days after creation or 24 hours before the scheduled start.',
  'Firm bookings require an authorization document and staff approval.',
  'Firm bookings are pending until approved by PTCF staff.',
  'Firm requests still pending inside the 24-hour pre-start window expire automatically.',
  'Firm bookings cannot overlap other active firm bookings on the same resource and time.',
  'Pencil bookings may overlap other users pencil bookings, but this can start contention.',
  'A firm request may place overlapping pencil bookings on hold until staff decision.',
];

const statuses = [
  ['Penciled', 'A tentative booking is active. It may expire or be challenged.'],
  ['On hold', 'A pencil booking is temporarily blocked by an overlapping firm request.'],
  ['Pending approval', 'A firm booking has been submitted and is waiting for staff decision.'],
  ['Approved', 'A firm booking has been approved by PTCF staff.'],
  ['Denied', 'A firm request was not approved by staff.'],
  ['Cancelled', 'The booking was cancelled by the user or an authorized staff member.'],
  ['Expired', 'The booking lapsed because it was not completed or approved in time.'],
  ['Displaced', 'A pencil booking lost the slot because another booking took priority.'],
  ['Completed', 'An approved booking has passed its scheduled end time.'],
];

const faqs = [
  [
    'Do I need a UP Mail account?',
    'Use the account method accepted by current facility policy. The system supports registered email login and may support Google sign-in when enabled.',
  ],
  [
    'Why can I not book within 24 hours?',
    'The system enforces a 24-hour lock window for new bookings, firm conversion, and staff approval.',
  ],
  [
    'What endorsement letter do I need?',
    'Firm requests require one consolidated endorsement letter. Within ICrops, use an Adviser or Advisory Committee signature. Within CAFS but outside ICrops, use a Division or Institute Head signature with a "Noted by" section. Outside CAFS, use a College or Department Head signature with a "Noted by" section. External users need institution or agency authorization.',
  ],
  [
    'What should I do if my pencil booking is being challenged?',
    'If you are the defender and need the slot, convert the pencil booking to firm before the contention deadline.',
  ],
  [
    'Why can I not convert to firm?',
    'Conversion may be blocked by missing authorization documents, the 24-hour lock window, an overlapping firm booking, terminal status, or challenger status in active contention.',
  ],
  [
    'Can I rebook a past booking?',
    'The system may allow rebooking from cancelled, denied, expired, displaced, or completed bookings when the booking remains eligible.',
  ],
];

const endorsementRequirements = [
  [
    'Within ICrops',
    'Adviser or Advisory Committee signature',
  ],
  [
    'Within CAFS, but outside ICrops',
    'Division or Institute Head signature, with a "Noted by" section',
  ],
  [
    'Outside CAFS',
    'College or Department Head signature, with a "Noted by" section',
  ],
  [
    'External users',
    'Institution or agency authorization',
  ],
];

function SectionHeader({ icon, eyebrow, title, children }) {
  return (
    <div className="mb-5">
      <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-up-forest-green">
        {icon}
        <span>{eyebrow}</span>
      </div>
      <h2 className="mt-2 font-heading text-2xl font-semibold text-primary">{title}</h2>
      {children && <p className="mt-2 max-w-3xl text-sm text-muted-foreground">{children}</p>}
    </div>
  );
}

function NumberedStep({ index, children }) {
  return (
    <li className="flex gap-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
        {index + 1}
      </span>
      <span className="pt-1 text-sm text-foreground/90">{children}</span>
    </li>
  );
}

function RuleItem({ children }) {
  return (
    <li className="flex gap-2">
      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-up-forest-green" aria-hidden="true" />
      <span>{children}</span>
    </li>
  );
}

export default function Guidelines() {
  return (
    <main className="bg-background">
      <section className="border-b border-border/80 bg-secondary/45">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          <div className="max-w-4xl">
            <p className="text-sm font-semibold uppercase tracking-wide text-up-forest-green">
              Plant Tissue Culture Facility
            </p>
            <h1 className="mt-3 font-heading text-4xl font-bold text-primary sm:text-5xl">
              PTCF Reservation System Guidelines
            </h1>
            <p className="mt-4 max-w-3xl text-base text-muted-foreground">
              A user guide for reserving PTCF rooms and equipment, understanding booking
              statuses, and preparing firm booking documents.
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <Button
                asChild
                variant="outline"
                className="justify-start border-primary/35 bg-card text-primary shadow-sm hover:border-primary hover:bg-primary/10 hover:text-primary"
              >
                <Link to="/equipment">
                  <Wrench className="h-4 w-4" aria-hidden="true" />
                  Browse Equipment
                </Link>
              </Button>
              <Button
                asChild
                variant="outline"
                className="justify-start border-primary/35 bg-card text-primary shadow-sm hover:border-primary hover:bg-primary/10 hover:text-primary"
              >
                <Link to="/rooms">
                  <Building2 className="h-4 w-4" aria-hidden="true" />
                  View Rooms
                </Link>
              </Button>
              <Button
                asChild
                variant="outline"
                className="justify-start border-primary/35 bg-card text-primary shadow-sm hover:border-primary hover:bg-primary/10 hover:text-primary"
              >
                <Link to="/calendar">
                  <CalendarDays className="h-4 w-4" aria-hidden="true" />
                  Check Calendar
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-7xl space-y-10 px-4 py-10 sm:px-6 lg:px-8">
        <section>
          <SectionHeader
            icon={<Info className="h-4 w-4" aria-hidden="true" />}
            eyebrow="Overview"
            title="What the system is for"
          >
            The PTCF Reservation System helps users request rooms and equipment, check schedules,
            submit supporting documents, and monitor booking updates in one place.
          </SectionHeader>
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Find Resources</CardTitle>
                <CardDescription>
                  Browse live equipment and room lists instead of relying on printed copies.
                </CardDescription>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Request Schedules</CardTitle>
                <CardDescription>
                  Create tentative pencil bookings or submit formal firm requests.
                </CardDescription>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Track Decisions</CardTitle>
                <CardDescription>
                  Use My Bookings and email notices to follow approval, expiry, and conflict updates.
                </CardDescription>
              </CardHeader>
            </Card>
          </div>
        </section>

        <section>
          <SectionHeader
            icon={<ClipboardList className="h-4 w-4" aria-hidden="true" />}
            eyebrow="Process"
            title="Reservation process flow"
          >
            Follow these steps when requesting use of PTCF equipment or rooms.
          </SectionHeader>
          <Card>
            <CardContent className="pt-6">
              <ol className="space-y-4">
                {processSteps.map((step, index) => (
                  <NumberedStep key={step} index={index}>
                    {step}
                  </NumberedStep>
                ))}
              </ol>
            </CardContent>
          </Card>
        </section>

        <section>
          <SectionHeader
            icon={<BookOpen className="h-4 w-4" aria-hidden="true" />}
            eyebrow="Booking Types"
            title="Pencil and firm bookings"
          >
            Choose the booking type that matches how ready your reservation request is.
          </SectionHeader>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="border-primary/15">
              <CardHeader>
                <CardTitle className="text-xl">Pencil Booking</CardTitle>
                <CardDescription>
                  A tentative temporary hold. It helps you mark a possible schedule, but it is
                  not final approval to use the resource.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <RuleItem>Use when the schedule is still tentative.</RuleItem>
                  <RuleItem>Convert to firm if the reservation should proceed.</RuleItem>
                  <RuleItem>Monitor expiry and contention notices carefully.</RuleItem>
                </ul>
              </CardContent>
            </Card>
            <Card className="border-up-forest-green/20">
              <CardHeader>
                <CardTitle className="text-xl">Firm Booking</CardTitle>
                <CardDescription>
                  A formal request that requires an authorization document and PTCF staff
                  approval before it becomes approved.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <RuleItem>Use when the schedule and documents are ready.</RuleItem>
                  <RuleItem>Wait for staff approval before treating it as approved.</RuleItem>
                  <RuleItem>Submit early enough for review before the 24-hour cutoff.</RuleItem>
                </ul>
              </CardContent>
            </Card>
          </div>
        </section>

        <section>
          <SectionHeader
            icon={<AlertTriangle className="h-4 w-4" aria-hidden="true" />}
            eyebrow="Rules"
            title="Important booking rules"
          >
            These are the main system rules users should know before submitting a request.
          </SectionHeader>
          <Card>
            <CardContent className="pt-6">
              <ul className="grid gap-3 text-sm text-foreground/90 md:grid-cols-2">
                {rules.map((rule) => (
                  <RuleItem key={rule}>{rule}</RuleItem>
                ))}
              </ul>
            </CardContent>
          </Card>
        </section>

        <section>
          <SectionHeader
            icon={<Hourglass className="h-4 w-4" aria-hidden="true" />}
            eyebrow="Overlaps"
            title="Contention, on-hold, and displaced bookings"
          >
            Some booking conflicts are resolved automatically by the system.
          </SectionHeader>
          <div className="grid gap-4 lg:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Contention</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                When two users have overlapping pencil bookings, the existing holder becomes
                the defender and the new overlapping request becomes the challenger. The
                defender must convert to firm before the deadline to keep priority.
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">On Hold</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                A pencil booking can become on hold when an overlapping firm request is waiting
                for staff decision. It may reactivate if the firm request is denied or cancelled.
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Displaced</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                A pencil booking is displaced when another booking takes priority, such as an
                approved firm booking or a missed contention deadline.
              </CardContent>
            </Card>
          </div>
        </section>

        <section>
          <SectionHeader
            icon={<CalendarDays className="h-4 w-4" aria-hidden="true" />}
            eyebrow="Statuses"
            title="Booking status guide"
          >
            My Bookings uses these status labels to describe what is happening to a reservation.
          </SectionHeader>
          <Card>
            <CardContent className="pt-6">
              <div className="space-y-3 sm:hidden">
                {statuses.map(([status, meaning]) => (
                  <div key={status} className="border-b border-border/70 pb-3 last:border-0 last:pb-0">
                    <p className="font-medium text-primary">{status}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{meaning}</p>
                  </div>
                ))}
              </div>
              <div className="hidden overflow-x-auto sm:block">
                <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="py-3 pr-4 font-semibold">Status</th>
                      <th className="py-3 font-semibold">Meaning</th>
                    </tr>
                  </thead>
                  <tbody>
                    {statuses.map(([status, meaning]) => (
                      <tr key={status} className="border-b border-border/70 last:border-0">
                        <td className="py-3 pr-4 font-medium text-primary">{status}</td>
                        <td className="py-3 text-muted-foreground">{meaning}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </section>

        <section>
          <SectionHeader
            icon={<FileText className="h-4 w-4" aria-hidden="true" />}
            eyebrow="Documents"
            title="Authorization documents"
          >
            Firm bookings and firm conversion require one consolidated endorsement letter.
          </SectionHeader>
          <Card>
            <CardContent className="space-y-5 pt-6">
              <div className="space-y-3 text-sm text-muted-foreground">
                <p>
                  Upload one consolidated endorsement letter that contains the required
                  authorization for your affiliation. The signatory or authorization source
                  depends on where you belong.
                </p>
                <div className="overflow-hidden rounded-md border border-border bg-card">
                  <div className="hidden border-b bg-muted/40 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-foreground sm:grid sm:grid-cols-[0.9fr_1.1fr]">
                    <span>Affiliation</span>
                    <span>Required signatory or authorization</span>
                  </div>
                  {endorsementRequirements.map(([affiliation, requirement]) => (
                    <div
                      key={affiliation}
                      className="grid gap-1 border-b border-border/70 px-3 py-3 last:border-b-0 sm:grid-cols-[0.9fr_1.1fr] sm:gap-3"
                    >
                      <span className="font-medium text-foreground">{affiliation}</span>
                      <span>{requirement}</span>
                    </div>
                  ))}
                </div>
                <p>
                  Accepted files are PDF, DOC, DOCX, JPG, and PNG. The maximum file size is 5 MB.
                </p>
              </div>
              <div className="rounded-md border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
                <p>
                  <span className="font-semibold text-foreground">Before submitting:</span>{' '}
                  Confirm your schedule, resource, and endorsement letter before creating a firm
                  request. Staff approval is still required after submission.
                </p>
              </div>
            </CardContent>
          </Card>
        </section>

        <section>
          <SectionHeader
            icon={<HelpCircle className="h-4 w-4" aria-hidden="true" />}
            eyebrow="FAQ"
            title="Frequently asked questions"
          >
            Quick answers for common user concerns.
          </SectionHeader>
          <div className="grid gap-4 lg:grid-cols-2">
            {faqs.map(([question, answer]) => (
              <Card key={question}>
                <CardHeader>
                  <CardTitle className="text-lg">{question}</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">{answer}</CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section>
          <Card className="border-primary/15 bg-secondary/60">
            <CardContent className="flex flex-col gap-4 pt-6 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold text-up-forest-green">
                  <RotateCcw className="h-4 w-4" aria-hidden="true" />
                  Ready to reserve?
                </div>
                <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                  Review the live resource list and calendar before creating a new booking.
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button asChild>
                  <Link to="/bookings/new">Book Now</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link to="/dashboard">My Bookings</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  );
}
