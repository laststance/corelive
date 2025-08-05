import type { Meta, StoryObj } from '@storybook/react'
import { format, addDays, isSameDay, isBefore, isAfter } from 'date-fns'
import {
  Calendar as CalendarIcon,
  Users,
  Phone,
  AlertCircle,
  CheckCircle,
  Flag,
  Plane,
  Gift,
  PartyPopper,
  Building,
  Stethoscope,
} from 'lucide-react'
import { useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'

const meta: Meta<typeof Calendar> = {
  title: 'CoreLive Design System/Components/Calendar',
  component: Calendar,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'A date picker component for selecting dates. Built with React DayPicker and styled with CoreLive Design System tokens.',
      },
    },
  },
  tags: ['autodocs'],
}

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  // @ts-ignore - Storybook type issue with no component props
  args: {},
  render: () => {
    const [date, setDate] = useState<Date | undefined>(new Date())

    return (
      <Calendar
        mode="single"
        selected={date}
        onSelect={setDate}
        className="rounded-md border"
      />
    )
  },
}

export const MultipleSelection: Story = {
  // @ts-ignore - Storybook type issue with no component props
  args: {},
  render: () => {
    const [dates, setDates] = useState<Date[] | undefined>([])

    return (
      <div className="space-y-4">
        <Calendar
          mode="multiple"
          selected={dates}
          onSelect={setDates}
          className="rounded-md border"
        />
        {dates && dates.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium">Selected dates:</p>
            <div className="flex flex-wrap gap-2">
              {dates.map((date, index) => (
                <Badge key={index} variant="secondary">
                  {format(date, 'MMM dd, yyyy')}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  },
}

export const DateRangeSelection: Story = {
  // @ts-ignore - Storybook type issue with no component props
  args: {},
  render: () => {
    const [dateRange, setDateRange] = useState<{
      from: Date | undefined
      to: Date | undefined
    }>({
      from: new Date(),
      to: addDays(new Date(), 7),
    })

    return (
      <div className="space-y-4">
        <Calendar
          mode="range"
          selected={dateRange}
          onSelect={(range) => {
            if (range) {
              setDateRange({
                from: range.from,
                to: range.to,
              })
            }
          }}
          numberOfMonths={2}
          className="rounded-md border"
        />
        {dateRange?.from && (
          <div className="text-sm">
            <p>
              <span className="font-medium">From:</span>{' '}
              {format(dateRange.from, 'PPP')}
            </p>
            {dateRange.to && (
              <p>
                <span className="font-medium">To:</span>{' '}
                {format(dateRange.to, 'PPP')}
              </p>
            )}
          </div>
        )}
      </div>
    )
  },
}

export const WithDisabledDates: Story = {
  // @ts-ignore - Storybook type issue with no component props
  args: {},
  render: () => {
    const [date, setDate] = useState<Date | undefined>(new Date())

    // Disable weekends and past dates
    const disabledDays = (date: Date) => {
      const day = date.getDay()
      return day === 0 || day === 6 || isBefore(date, new Date())
    }

    return (
      <Card>
        <CardHeader>
          <CardTitle>Book Appointment</CardTitle>
          <CardDescription>
            Select an available weekday (weekends and past dates disabled)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Calendar
            mode="single"
            selected={date}
            onSelect={setDate}
            disabled={disabledDays}
            className="rounded-md border"
          />
        </CardContent>
      </Card>
    )
  },
}

export const DatePickerPopover: Story = {
  // @ts-ignore - Storybook type issue with no component props
  args: {},
  render: () => {
    const [date, setDate] = useState<Date>()

    return (
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className="w-[280px] justify-start text-left font-normal"
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {date ? format(date, 'PPP') : <span>Pick a date</span>}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0">
          <Calendar
            mode="single"
            selected={date}
            onSelect={setDate}
            initialFocus
          />
        </PopoverContent>
      </Popover>
    )
  },
}

export const EventCalendar: Story = {
  // @ts-ignore - Storybook type issue with no component props
  args: {},
  render: () => {
    const [selectedDate, setSelectedDate] = useState<Date | undefined>(
      new Date(),
    )

    const events = [
      {
        date: new Date(),
        title: 'Team Meeting',
        type: 'meeting',
        time: '10:00 AM',
        icon: Users,
      },
      {
        date: new Date(),
        title: 'Project Deadline',
        type: 'deadline',
        time: '5:00 PM',
        icon: Flag,
      },
      {
        date: addDays(new Date(), 1),
        title: 'Client Call',
        type: 'call',
        time: '2:00 PM',
        icon: Phone,
      },
      {
        date: addDays(new Date(), 2),
        title: 'Design Review',
        type: 'review',
        time: '11:00 AM',
        icon: CheckCircle,
      },
      {
        date: addDays(new Date(), 3),
        title: 'Birthday Party',
        type: 'personal',
        time: '7:00 PM',
        icon: PartyPopper,
      },
      {
        date: addDays(new Date(), 5),
        title: 'Conference',
        type: 'conference',
        time: 'All Day',
        icon: Building,
      },
      {
        date: addDays(new Date(), 7),
        title: 'Vacation Starts',
        type: 'vacation',
        time: 'All Day',
        icon: Plane,
      },
    ]

    const getDayEvents = (date: Date) => {
      return events.filter((event) => isSameDay(event.date, date))
    }

    const modifiers = {
      hasEvents: (date: Date) => getDayEvents(date).length > 0,
    }

    const modifiersStyles = {
      hasEvents: {
        fontWeight: 'bold',
        textDecoration: 'underline',
      },
    }

    const selectedEvents = selectedDate ? getDayEvents(selectedDate) : []

    const getEventColor = (type: string) => {
      switch (type) {
        case 'meeting':
          return 'bg-primary'
        case 'deadline':
          return 'bg-danger'
        case 'call':
          return 'bg-info'
        case 'review':
          return 'bg-success'
        case 'personal':
          return 'bg-secondary'
        case 'conference':
          return 'bg-accent'
        case 'vacation':
          return 'bg-warning'
        default:
          return 'bg-muted'
      }
    }

    return (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Calendar</CardTitle>
            <CardDescription>
              Click on dates with events to view details
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={setSelectedDate}
              modifiers={modifiers}
              modifiersStyles={modifiersStyles}
              className="rounded-md border"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              Events{' '}
              {selectedDate && `for ${format(selectedDate, 'MMM dd, yyyy')}`}
            </CardTitle>
            <CardDescription>
              {selectedEvents.length > 0
                ? `${selectedEvents.length} event${selectedEvents.length > 1 ? 's' : ''} scheduled`
                : 'No events scheduled'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {selectedEvents.length > 0 ? (
              <div className="space-y-3">
                {selectedEvents.map((event, index) => {
                  const Icon = event.icon
                  return (
                    <div
                      key={index}
                      className="flex items-start gap-3 rounded-lg border p-3"
                    >
                      <div
                        className={`rounded p-2 ${getEventColor(event.type)} text-white`}
                      >
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="flex-1">
                        <p className="font-medium">{event.title}</p>
                        <p className="text-muted-foreground text-sm">
                          {event.time}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className="text-muted-foreground py-8 text-center text-sm">
                Select a date to view events
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    )
  },
  parameters: {
    layout: 'padded',
  },
}

export const BirthdayPicker: Story = {
  // @ts-ignore - Storybook type issue with no component props
  args: {},
  render: () => {
    const [date, setDate] = useState<Date>()
    const [age, setAge] = useState<number>()

    const calculateAge = (birthDate: Date) => {
      const today = new Date()
      let age = today.getFullYear() - birthDate.getFullYear()
      const monthDiff = today.getMonth() - birthDate.getMonth()

      if (
        monthDiff < 0 ||
        (monthDiff === 0 && today.getDate() < birthDate.getDate())
      ) {
        age--
      }

      return age
    }

    const handleDateSelect = (selectedDate: Date | undefined) => {
      setDate(selectedDate)
      if (selectedDate) {
        setAge(calculateAge(selectedDate))
      }
    }

    return (
      <Card className="w-[350px]">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Gift className="h-5 w-5" />
            Birthday
          </CardTitle>
          <CardDescription>When were you born?</CardDescription>
        </CardHeader>
        <CardContent>
          <Calendar
            mode="single"
            selected={date}
            onSelect={handleDateSelect}
            disabled={(date) => isAfter(date, new Date())}
            captionLayout="dropdown"
            fromYear={1900}
            toYear={new Date().getFullYear()}
            className="rounded-md border"
          />
          {date && age !== undefined && (
            <div className="bg-muted mt-4 rounded-lg p-3">
              <p className="text-sm">
                <span className="font-medium">Birthday:</span>{' '}
                {format(date, 'MMMM dd, yyyy')}
              </p>
              <p className="text-sm">
                <span className="font-medium">Age:</span> {age} years old
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    )
  },
}

export const AppointmentScheduler: Story = {
  // @ts-ignore - Storybook type issue with no component props
  args: {},
  render: () => {
    const [selectedDate, setSelectedDate] = useState<Date>()
    const [selectedTime, setSelectedTime] = useState<string>()
    const [appointmentType, setAppointmentType] = useState<string>()

    const timeSlots = [
      '9:00 AM',
      '9:30 AM',
      '10:00 AM',
      '10:30 AM',
      '11:00 AM',
      '11:30 AM',
      '2:00 PM',
      '2:30 PM',
      '3:00 PM',
      '3:30 PM',
      '4:00 PM',
      '4:30 PM',
    ]

    const appointmentTypes = [
      {
        value: 'consultation',
        label: 'Consultation',
        icon: Stethoscope,
        duration: '30 min',
      },
      {
        value: 'checkup',
        label: 'Regular Checkup',
        icon: CheckCircle,
        duration: '45 min',
      },
      {
        value: 'followup',
        label: 'Follow-up',
        icon: Users,
        duration: '15 min',
      },
      {
        value: 'emergency',
        label: 'Emergency',
        icon: AlertCircle,
        duration: '60 min',
      },
    ]

    return (
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle>Schedule Appointment</CardTitle>
          <CardDescription>
            Choose a date, time, and appointment type
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div className="space-y-4">
              <div>
                <h4 className="mb-3 text-sm font-medium">Select Date</h4>
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={setSelectedDate}
                  disabled={(date) => {
                    const day = date.getDay()
                    return day === 0 || day === 6 || isBefore(date, new Date())
                  }}
                  className="rounded-md border"
                />
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <h4 className="mb-3 text-sm font-medium">Appointment Type</h4>
                <div className="grid grid-cols-1 gap-2">
                  {appointmentTypes.map((type) => {
                    const Icon = type.icon
                    return (
                      <button
                        key={type.value}
                        onClick={() => setAppointmentType(type.value)}
                        className={`flex items-center gap-3 rounded-lg border p-3 text-left transition-colors ${
                          appointmentType === type.value
                            ? 'border-primary bg-primary/10'
                            : 'hover:bg-muted'
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                        <div className="flex-1">
                          <p className="text-sm font-medium">{type.label}</p>
                          <p className="text-muted-foreground text-xs">
                            {type.duration}
                          </p>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>

              {selectedDate && (
                <div>
                  <h4 className="mb-3 text-sm font-medium">Available Times</h4>
                  <div className="grid grid-cols-3 gap-2">
                    {timeSlots.map((time) => (
                      <Button
                        key={time}
                        variant={selectedTime === time ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setSelectedTime(time)}
                      >
                        {time}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {selectedDate && selectedTime && appointmentType && (
            <div className="bg-muted mt-6 rounded-lg p-4">
              <h4 className="mb-2 font-medium">Appointment Summary</h4>
              <div className="space-y-1 text-sm">
                <p>
                  <span className="font-medium">Date:</span>{' '}
                  {format(selectedDate, 'EEEE, MMMM dd, yyyy')}
                </p>
                <p>
                  <span className="font-medium">Time:</span> {selectedTime}
                </p>
                <p>
                  <span className="font-medium">Type:</span>{' '}
                  {
                    appointmentTypes.find((t) => t.value === appointmentType)
                      ?.label
                  }
                </p>
              </div>
              <Button className="mt-4 w-full">Confirm Appointment</Button>
            </div>
          )}
        </CardContent>
      </Card>
    )
  },
  parameters: {
    layout: 'padded',
  },
}

export const HolidayCalendar: Story = {
  // @ts-ignore - Storybook type issue with no component props
  args: {},
  render: () => {
    const [selectedMonth, setSelectedMonth] = useState(new Date())

    const holidays = [
      { date: new Date(2024, 0, 1), name: "New Year's Day", type: 'federal' },
      {
        date: new Date(2024, 1, 14),
        name: "Valentine's Day",
        type: 'observance',
      },
      {
        date: new Date(2024, 2, 17),
        name: "St. Patrick's Day",
        type: 'observance',
      },
      {
        date: new Date(2024, 3, 1),
        name: "April Fool's Day",
        type: 'observance',
      },
      { date: new Date(2024, 4, 27), name: 'Memorial Day', type: 'federal' },
      { date: new Date(2024, 6, 4), name: 'Independence Day', type: 'federal' },
      { date: new Date(2024, 8, 2), name: 'Labor Day', type: 'federal' },
      { date: new Date(2024, 9, 31), name: 'Halloween', type: 'observance' },
      { date: new Date(2024, 10, 28), name: 'Thanksgiving', type: 'federal' },
      { date: new Date(2024, 11, 25), name: 'Christmas Day', type: 'federal' },
    ]

    const modifiers = {
      holiday: holidays.map((h) => h.date),
      federal: holidays.filter((h) => h.type === 'federal').map((h) => h.date),
    }

    const modifiersClassNames = {
      holiday: 'bg-primary/20 font-semibold',
      federal: 'bg-danger/20',
    }

    return (
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PartyPopper className="h-5 w-5" />
            Holiday Calendar 2024
          </CardTitle>
          <CardDescription>Federal holidays and observances</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <Calendar
              mode="single"
              selected={selectedMonth}
              onSelect={(date) => date && setSelectedMonth(date)}
              modifiers={modifiers}
              modifiersClassNames={modifiersClassNames}
              className="rounded-md border"
            />

            <div className="space-y-2">
              <h4 className="text-sm font-medium">Legend</h4>
              <div className="flex gap-4">
                <div className="flex items-center gap-2">
                  <div className="bg-primary/20 h-4 w-4 rounded" />
                  <span className="text-sm">Holiday/Observance</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="bg-danger/20 h-4 w-4 rounded" />
                  <span className="text-sm">Federal Holiday</span>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="text-sm font-medium">Holidays This Year</h4>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                {holidays.map((holiday, index) => (
                  <div
                    key={index}
                    className={`rounded-lg border p-2 text-sm ${
                      holiday.type === 'federal'
                        ? 'bg-danger/5 border-danger/20'
                        : 'bg-primary/5 border-primary/20'
                    }`}
                  >
                    <p className="font-medium">{holiday.name}</p>
                    <p className="text-muted-foreground">
                      {format(holiday.date, 'MMMM dd, yyyy')}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  },
  parameters: {
    layout: 'padded',
  },
}

export const MiniCalendar: Story = {
  // @ts-ignore - Storybook type issue with no component props
  args: {},
  render: () => {
    const [date, setDate] = useState<Date | undefined>(new Date())

    return (
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Compact Calendar</CardTitle>
          </CardHeader>
          <CardContent className="p-3">
            <Calendar
              mode="single"
              selected={date}
              onSelect={setDate}
              className="origin-top-left scale-90 rounded-md border"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Sidebar Calendar</CardTitle>
          </CardHeader>
          <CardContent className="p-3">
            <Calendar
              mode="single"
              selected={date}
              onSelect={setDate}
              className="rounded-md border"
              classNames={{
                months: 'space-y-2',
                month: 'space-y-2',
                caption: 'flex justify-center pt-1 relative items-center',
                caption_label: 'text-xs font-medium',
                nav: 'space-x-1 flex items-center',
                nav_button:
                  'h-6 w-6 bg-transparent p-0 opacity-50 hover:opacity-100',
                nav_button_previous: 'absolute left-1',
                nav_button_next: 'absolute right-1',
                table: 'w-full border-collapse space-y-1',
                head_row: 'flex',
                head_cell:
                  'text-muted-foreground rounded-md w-8 font-normal text-[0.7rem]',
                row: 'flex w-full mt-1',
                cell: 'text-center text-xs p-0 relative [&:has([aria-selected])]:bg-accent first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20',
                day: 'h-8 w-8 p-0 font-normal aria-selected:opacity-100 text-xs',
                day_selected:
                  'bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground',
                day_today: 'bg-accent text-accent-foreground',
                day_outside: 'text-muted-foreground opacity-50',
                day_disabled: 'text-muted-foreground opacity-50',
                day_range_middle:
                  'aria-selected:bg-accent aria-selected:text-accent-foreground',
                day_hidden: 'invisible',
              }}
            />
          </CardContent>
        </Card>
      </div>
    )
  },
}

export const CoreLiveThemeShowcase: Story = {
  // @ts-ignore - Storybook type issue with no component props
  args: {},
  render: () => (
    <div className="w-full max-w-2xl space-y-6">
      <div>
        <h3 className="text-heading-3 mb-4 font-medium">Calendar States</h3>
        <div className="grid grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Default State</CardTitle>
            </CardHeader>
            <CardContent>
              <Calendar
                mode="single"
                className="rounded-md border"
                style={
                  {
                    '--calendar-background':
                      'var(--component-calendar-background)',
                    '--calendar-border': 'var(--component-calendar-border)',
                  } as React.CSSProperties
                }
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">With Selection</CardTitle>
            </CardHeader>
            <CardContent>
              <Calendar
                mode="single"
                selected={new Date()}
                className="rounded-md border"
              />
            </CardContent>
          </Card>
        </div>
      </div>

      <div>
        <h3 className="text-heading-3 mb-4 font-medium">Selection Modes</h3>
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Range Selection</CardTitle>
            </CardHeader>
            <CardContent>
              <Calendar
                mode="range"
                selected={{
                  from: new Date(),
                  to: addDays(new Date(), 5),
                }}
                numberOfMonths={2}
                className="rounded-md border"
              />
            </CardContent>
          </Card>
        </div>
      </div>

      <div>
        <h3 className="text-heading-3 mb-4 font-medium">Semantic Usage</h3>
        <div className="grid grid-cols-2 gap-4">
          <Card className="border-success/20">
            <CardHeader>
              <CardTitle className="text-success text-sm">
                Available Dates
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Calendar
                mode="single"
                className="border-success/20 rounded-md"
                modifiers={{
                  available: [
                    addDays(new Date(), 1),
                    addDays(new Date(), 3),
                    addDays(new Date(), 5),
                  ],
                }}
                modifiersClassNames={{
                  available: 'bg-success/20 text-success font-medium',
                }}
              />
            </CardContent>
          </Card>

          <Card className="border-danger/20">
            <CardHeader>
              <CardTitle className="text-danger text-sm">
                Blocked Dates
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Calendar
                mode="single"
                className="border-danger/20 rounded-md"
                disabled={[
                  addDays(new Date(), 2),
                  addDays(new Date(), 4),
                  addDays(new Date(), 6),
                ]}
                modifiersClassNames={{
                  disabled: 'bg-danger/10 text-danger/50 line-through',
                }}
              />
            </CardContent>
          </Card>
        </div>
      </div>

      <div>
        <h3 className="text-heading-3 mb-4 font-medium">
          Component Token Usage
        </h3>
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-4">
              <div
                className="rounded-lg p-4"
                style={{
                  backgroundColor: 'var(--component-calendar-background)',
                  border: '1px solid var(--component-calendar-border)',
                }}
              >
                <div className="grid grid-cols-7 gap-2 text-center">
                  {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, i) => (
                    <div
                      key={i}
                      className="p-2 text-xs font-medium"
                      style={{
                        color: 'var(--component-calendar-weekday-text)',
                      }}
                    >
                      {day}
                    </div>
                  ))}
                  {Array.from({ length: 28 }, (_, i) => (
                    <button
                      key={i}
                      className="rounded-md p-2 text-sm transition-colors"
                      style={{
                        backgroundColor:
                          i === 14
                            ? 'var(--component-calendar-selected-background)'
                            : i === 10
                              ? 'var(--component-calendar-today-background)'
                              : 'transparent',
                        color:
                          i === 14
                            ? 'var(--component-calendar-selected-text)'
                            : i === 10
                              ? 'var(--component-calendar-today-text)'
                              : 'var(--component-calendar-day-text)',
                        border:
                          i === 10
                            ? '1px solid var(--component-calendar-today-border)'
                            : 'none',
                      }}
                    >
                      {i + 1}
                    </button>
                  ))}
                </div>
              </div>

              <div className="bg-muted rounded-md p-3">
                <code className="text-xs">
                  --component-calendar-background
                  <br />
                  --component-calendar-border
                  <br />
                  --component-calendar-day-text
                  <br />
                  --component-calendar-weekday-text
                  <br />
                  --component-calendar-selected-background
                  <br />
                  --component-calendar-selected-text
                  <br />
                  --component-calendar-today-background
                  <br />
                  --component-calendar-today-text
                  <br />
                  --component-calendar-today-border
                  <br />
                  --component-calendar-hover-background
                  <br />
                  --component-calendar-disabled-text
                </code>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div>
        <h3 className="text-heading-3 mb-4 font-medium">Advanced Features</h3>
        <Card>
          <CardHeader>
            <CardTitle>Multi-Month View</CardTitle>
          </CardHeader>
          <CardContent>
            <Calendar
              mode="single"
              numberOfMonths={3}
              className="rounded-md border"
              classNames={{
                months:
                  'flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0',
              }}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  ),
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        story:
          'Comprehensive showcase of calendar variations using CoreLive Design System tokens for consistent date selection across different contexts.',
      },
    },
  },
}
