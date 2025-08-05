import { zodResolver } from '@hookform/resolvers/zod'
import type { Meta, StoryObj } from '@storybook/react'
import {
  User,
  Mail,
  Phone,
  MapPin,
  CreditCard,
  Star,
  Upload,
  Shield,
  Settings,
  Briefcase,
  Building,
  Globe,
  Eye,
  EyeOff,
} from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import * as z from 'zod'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'

const meta: Meta<typeof Form> = {
  title: 'Components/Form',
  component: Form,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'A form component built on top of react-hook-form with validation support.',
      },
    },
  },
  tags: ['autodocs'],
}

export default meta
type Story = StoryObj<typeof Form>

// Basic form schema
const basicFormSchema = z.object({
  name: z.string().min(2, { message: 'Name must be at least 2 characters.' }),
  email: z.string().email({ message: 'Please enter a valid email address.' }),
  message: z
    .string()
    .min(10, { message: 'Message must be at least 10 characters.' }),
})

export const Default: Story = {
  args: {},
  render: () => {
    const form = useForm<z.infer<typeof basicFormSchema>>({
      resolver: zodResolver(basicFormSchema),
      defaultValues: {
        name: '',
        email: '',
        message: '',
      },
    })

    function onSubmit(values: z.infer<typeof basicFormSchema>) {
      console.log(values)
    }

    return (
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Contact Form
          </CardTitle>
          <CardDescription>
            Send us a message and we'll get back to you.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Enter your name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Enter your email"
                        type="email"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="message"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Message</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Tell us about your inquiry..."
                        className="resize-none"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      Your message will be sent to our support team.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" className="w-full">
                Send Message
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    )
  },
}

// User registration form
const registrationSchema = z
  .object({
    firstName: z.string().min(2, 'First name must be at least 2 characters'),
    lastName: z.string().min(2, 'Last name must be at least 2 characters'),
    email: z.string().email('Please enter a valid email address'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string(),
    phone: z.string().min(10, 'Please enter a valid phone number'),
    country: z.string().min(1, 'Please select your country'),
    agreeToTerms: z
      .boolean()
      .refine((val) => val === true, 'You must agree to the terms'),
    newsletter: z.boolean(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
  })

export const UserRegistration: Story = {
  args: {},
  render: () => {
    const [showPassword, setShowPassword] = useState(false)
    const [showConfirmPassword, setShowConfirmPassword] = useState(false)

    const form = useForm<z.infer<typeof registrationSchema>>({
      resolver: zodResolver(registrationSchema),
      defaultValues: {
        firstName: '',
        lastName: '',
        email: '',
        password: '',
        confirmPassword: '',
        phone: '',
        country: '',
        agreeToTerms: false,
        newsletter: false,
      },
    })

    function onSubmit(values: z.infer<typeof registrationSchema>) {
      console.log(values)
    }

    return (
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Create Account
          </CardTitle>
          <CardDescription>
            Join our platform and start your journey with us.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="firstName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>First Name</FormLabel>
                      <FormControl>
                        <Input placeholder="John" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="lastName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Last Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Doe" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email Address</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Mail className="text-muted-foreground absolute top-3 left-3 h-4 w-4" />
                        <Input
                          placeholder="john@example.com"
                          className="pl-10"
                          {...field}
                        />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Password</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Input
                            type={showPassword ? 'text' : 'password'}
                            placeholder="Enter password"
                            {...field}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="absolute top-0 right-0 h-full px-3 py-2 hover:bg-transparent"
                            onClick={() => setShowPassword(!showPassword)}
                          >
                            {showPassword ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="confirmPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Confirm Password</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Input
                            type={showConfirmPassword ? 'text' : 'password'}
                            placeholder="Confirm password"
                            {...field}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="absolute top-0 right-0 h-full px-3 py-2 hover:bg-transparent"
                            onClick={() =>
                              setShowConfirmPassword(!showConfirmPassword)
                            }
                          >
                            {showConfirmPassword ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone Number</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Phone className="text-muted-foreground absolute top-3 left-3 h-4 w-4" />
                          <Input
                            placeholder="+1 (555) 123-4567"
                            className="pl-10"
                            {...field}
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="country"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Country</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select your country" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="us">United States</SelectItem>
                          <SelectItem value="ca">Canada</SelectItem>
                          <SelectItem value="uk">United Kingdom</SelectItem>
                          <SelectItem value="au">Australia</SelectItem>
                          <SelectItem value="de">Germany</SelectItem>
                          <SelectItem value="fr">France</SelectItem>
                          <SelectItem value="jp">Japan</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <Separator />

              <div className="space-y-4">
                <FormField
                  control={form.control}
                  name="agreeToTerms"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-start space-y-0 space-x-3">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                      <div className="space-y-1 leading-none">
                        <FormLabel className="text-sm font-normal">
                          I agree to the{' '}
                          <a href="#" className="text-primary underline">
                            Terms of Service
                          </a>{' '}
                          and{' '}
                          <a href="#" className="text-primary underline">
                            Privacy Policy
                          </a>
                        </FormLabel>
                        <FormMessage />
                      </div>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="newsletter"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">Newsletter</FormLabel>
                        <FormDescription>
                          Receive updates about new features and product
                          announcements.
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>

              <Button type="submit" className="w-full" size="lg">
                Create Account
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    )
  },
}

// Survey form with different input types
const surveySchema = z.object({
  experience: z.string().min(1, 'Please select your experience level'),
  satisfaction: z.array(z.number()).min(1).max(1),
  features: z.array(z.string()).min(1, 'Please select at least one feature'),
  recommendation: z.string().min(1, 'Please select a recommendation level'),
  feedback: z
    .string()
    .min(10, 'Please provide at least 10 characters of feedback'),
  contactMethod: z.string().min(1, 'Please select a contact method'),
  improvements: z.string().optional(),
})

export const SurveyForm: Story = {
  args: {},
  render: () => {
    const form = useForm<z.infer<typeof surveySchema>>({
      resolver: zodResolver(surveySchema),
      defaultValues: {
        experience: '',
        satisfaction: [5],
        features: [],
        recommendation: '',
        feedback: '',
        contactMethod: '',
        improvements: '',
      },
    })

    function onSubmit(values: z.infer<typeof surveySchema>) {
      console.log(values)
    }

    const features = [
      { id: 'dashboard', label: 'Dashboard' },
      { id: 'analytics', label: 'Analytics' },
      { id: 'reports', label: 'Reports' },
      { id: 'integrations', label: 'Integrations' },
      { id: 'api', label: 'API Access' },
      { id: 'support', label: 'Customer Support' },
    ]

    return (
      <Card className="w-full max-w-3xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Star className="h-5 w-5" />
            Customer Satisfaction Survey
          </CardTitle>
          <CardDescription>
            Help us improve our product by sharing your experience.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
              <FormField
                control={form.control}
                name="experience"
                render={({ field }) => (
                  <FormItem className="space-y-3">
                    <FormLabel className="text-base font-medium">
                      How would you describe your experience level with our
                      product?
                    </FormLabel>
                    <FormControl>
                      <RadioGroup
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                        className="flex flex-col space-y-1"
                      >
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="beginner" id="beginner" />
                          <label htmlFor="beginner">
                            Beginner (Less than 1 month)
                          </label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem
                            value="intermediate"
                            id="intermediate"
                          />
                          <label htmlFor="intermediate">
                            Intermediate (1-6 months)
                          </label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="advanced" id="advanced" />
                          <label htmlFor="advanced">Advanced (6+ months)</label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="expert" id="expert" />
                          <label htmlFor="expert">Expert (1+ years)</label>
                        </div>
                      </RadioGroup>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="satisfaction"
                render={({ field }) => (
                  <FormItem className="space-y-3">
                    <FormLabel className="text-base font-medium">
                      Overall Satisfaction: {field.value[0]}/10
                    </FormLabel>
                    <FormControl>
                      <Slider
                        min={1}
                        max={10}
                        step={1}
                        value={field.value}
                        onValueChange={field.onChange}
                        className="w-full"
                      />
                    </FormControl>
                    <div className="text-muted-foreground flex justify-between text-sm">
                      <span>Very Dissatisfied</span>
                      <span>Very Satisfied</span>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="features"
                render={() => (
                  <FormItem>
                    <div className="mb-4">
                      <FormLabel className="text-base font-medium">
                        Which features do you use most often?
                      </FormLabel>
                      <FormDescription>Select all that apply.</FormDescription>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      {features.map((item) => (
                        <FormField
                          key={item.id}
                          control={form.control}
                          name="features"
                          render={({ field }) => {
                            return (
                              <FormItem
                                key={item.id}
                                className="flex flex-row items-start space-y-0 space-x-3"
                              >
                                <FormControl>
                                  <Checkbox
                                    checked={field.value?.includes(item.id)}
                                    onCheckedChange={(checked) => {
                                      return checked
                                        ? field.onChange([
                                            ...field.value,
                                            item.id,
                                          ])
                                        : field.onChange(
                                            field.value?.filter(
                                              (value) => value !== item.id,
                                            ),
                                          )
                                    }}
                                  />
                                </FormControl>
                                <FormLabel className="font-normal">
                                  {item.label}
                                </FormLabel>
                              </FormItem>
                            )
                          }}
                        />
                      ))}
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="recommendation"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-base font-medium">
                      How likely are you to recommend our product?
                    </FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select recommendation level" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="very-likely">Very Likely</SelectItem>
                        <SelectItem value="likely">Likely</SelectItem>
                        <SelectItem value="neutral">Neutral</SelectItem>
                        <SelectItem value="unlikely">Unlikely</SelectItem>
                        <SelectItem value="very-unlikely">
                          Very Unlikely
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="feedback"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-base font-medium">
                      Additional Feedback
                    </FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Tell us what you think about our product..."
                        className="resize-none"
                        rows={4}
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      Share any specific comments, suggestions, or concerns.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="contactMethod"
                render={({ field }) => (
                  <FormItem className="space-y-3">
                    <FormLabel className="text-base font-medium">
                      Preferred Contact Method
                    </FormLabel>
                    <FormControl>
                      <RadioGroup
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                      >
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="email" id="email" />
                          <label htmlFor="email">Email</label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="phone" id="phone" />
                          <label htmlFor="phone">Phone</label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="none" id="none" />
                          <label htmlFor="none">No contact needed</label>
                        </div>
                      </RadioGroup>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button type="submit" className="w-full" size="lg">
                Submit Survey
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    )
  },
}

// Profile settings form
const profileSchema = z.object({
  username: z.string().min(3, 'Username must be at least 3 characters'),
  displayName: z.string().min(1, 'Display name is required'),
  bio: z.string().max(160, 'Bio must be 160 characters or less').optional(),
  website: z
    .string()
    .url('Please enter a valid URL')
    .optional()
    .or(z.literal('')),
  location: z.string().optional(),
  company: z.string().optional(),
  jobTitle: z.string().optional(),
  emailNotifications: z.boolean(),
  marketingEmails: z.boolean(),
  profileVisibility: z.string().min(1, 'Please select profile visibility'),
  theme: z.string().min(1, 'Please select a theme'),
})

export const ProfileSettings: Story = {
  args: {},
  render: () => {
    const form = useForm<z.infer<typeof profileSchema>>({
      resolver: zodResolver(profileSchema),
      defaultValues: {
        username: 'johnsmith',
        displayName: 'John Smith',
        bio: 'Software engineer passionate about building great products.',
        website: 'https://johnsmith.dev',
        location: 'San Francisco, CA',
        company: 'Tech Corp',
        jobTitle: 'Senior Developer',
        emailNotifications: true,
        marketingEmails: false,
        profileVisibility: 'public',
        theme: 'system',
      },
    })

    function onSubmit(values: z.infer<typeof profileSchema>) {
      console.log(values)
    }

    return (
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <div className="flex items-center gap-4">
            <Avatar className="h-20 w-20">
              <AvatarImage src="/placeholder-avatar.jpg" />
              <AvatarFallback>JS</AvatarFallback>
            </Avatar>
            <div>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Profile Settings
              </CardTitle>
              <CardDescription>
                Manage your account settings and preferences.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="space-y-4">
                <h3 className="text-lg font-medium">Basic Information</h3>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="username"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Username</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <User className="text-muted-foreground absolute top-3 left-3 h-4 w-4" />
                            <Input
                              placeholder="username"
                              className="pl-10"
                              {...field}
                            />
                          </div>
                        </FormControl>
                        <FormDescription>
                          This is your public username.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="displayName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Display Name</FormLabel>
                        <FormControl>
                          <Input placeholder="John Smith" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="bio"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Bio</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Tell us a little bit about yourself"
                          className="resize-none"
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        {field.value?.length || 0}/160 characters
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="website"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Website</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Globe className="text-muted-foreground absolute top-3 left-3 h-4 w-4" />
                            <Input
                              placeholder="https://example.com"
                              className="pl-10"
                              {...field}
                            />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="location"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Location</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <MapPin className="text-muted-foreground absolute top-3 left-3 h-4 w-4" />
                            <Input
                              placeholder="San Francisco, CA"
                              className="pl-10"
                              {...field}
                            />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="company"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Company</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Building className="text-muted-foreground absolute top-3 left-3 h-4 w-4" />
                            <Input
                              placeholder="Acme Inc."
                              className="pl-10"
                              {...field}
                            />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="jobTitle"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Job Title</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Briefcase className="text-muted-foreground absolute top-3 left-3 h-4 w-4" />
                            <Input
                              placeholder="Software Engineer"
                              className="pl-10"
                              {...field}
                            />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              <Separator />

              <div className="space-y-4">
                <h3 className="text-lg font-medium">Preferences</h3>

                <FormField
                  control={form.control}
                  name="profileVisibility"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Profile Visibility</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select visibility" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="public">
                            <div className="flex items-center gap-2">
                              <Globe className="h-4 w-4" />
                              Public - Anyone can see your profile
                            </div>
                          </SelectItem>
                          <SelectItem value="private">
                            <div className="flex items-center gap-2">
                              <Shield className="h-4 w-4" />
                              Private - Only you can see your profile
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="theme"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Theme</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select theme" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="light">Light</SelectItem>
                          <SelectItem value="dark">Dark</SelectItem>
                          <SelectItem value="system">System</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        Choose your preferred theme appearance.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <Separator />

              <div className="space-y-4">
                <h3 className="text-lg font-medium">Notifications</h3>

                <FormField
                  control={form.control}
                  name="emailNotifications"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">
                          Email Notifications
                        </FormLabel>
                        <FormDescription>
                          Receive notifications about your account activity.
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="marketingEmails"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">
                          Marketing Emails
                        </FormLabel>
                        <FormDescription>
                          Receive emails about new features and updates.
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>

              <div className="flex gap-2">
                <Button type="submit" size="lg">
                  Save Changes
                </Button>
                <Button type="button" variant="outline" size="lg">
                  Cancel
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    )
  },
}

export const CoreLiveThemeShowcase: Story = {
  args: {},
  render: () => {
    const showcaseForm = useForm({
      defaultValues: {
        primaryInput: '',
        secondarySelect: '',
        accentCheckbox: false,
        successRadio: '',
        warningSwitch: false,
        dangerTextarea: '',
        infoRange: [50],
        discoveryMultiSelect: [],
        neutralPassword: '',
        agreement: false,
      },
    })

    return (
      <div className="w-full max-w-4xl space-y-8">
        <div className="space-y-2 text-center">
          <h2 className="text-2xl font-bold">CoreLive Form Components</h2>
          <p className="text-muted-foreground">
            Comprehensive form examples showcasing CoreLive Design System
            integration
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {/* Brand Colors Forms */}
          <Card className="border-primary/20">
            <CardHeader>
              <CardTitle className="text-primary flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                Primary Form
              </CardTitle>
              <CardDescription>Form with primary brand styling</CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...showcaseForm}>
                <form className="space-y-4">
                  <FormField
                    name="primaryInput"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Account Name</FormLabel>
                        <FormControl>
                          <Input placeholder="Enter account name" {...field} />
                        </FormControl>
                        <FormDescription>
                          Your unique account identifier
                        </FormDescription>
                      </FormItem>
                    )}
                  />
                  <Button className="bg-primary hover:bg-primary/90 w-full">
                    Create Account
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>

          <Card className="border-secondary/20">
            <CardHeader>
              <CardTitle className="text-secondary flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Secondary Form
              </CardTitle>
              <CardDescription>
                Form with secondary brand styling
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...showcaseForm}>
                <form className="space-y-4">
                  <FormField
                    name="secondarySelect"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Preference</FormLabel>
                        <Select onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Choose option" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="option1">Option 1</SelectItem>
                            <SelectItem value="option2">Option 2</SelectItem>
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )}
                  />
                  <Button className="bg-secondary hover:bg-secondary/90 text-secondary-foreground w-full">
                    Update Settings
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>

          <Card className="border-accent/20">
            <CardHeader>
              <CardTitle className="text-accent-foreground flex items-center gap-2">
                <Star className="h-5 w-5" />
                Accent Form
              </CardTitle>
              <CardDescription>Form with accent styling</CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...showcaseForm}>
                <form className="space-y-4">
                  <FormField
                    name="accentCheckbox"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-start space-y-0 space-x-3">
                        <FormControl>
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                        <div className="space-y-1 leading-none">
                          <FormLabel>Enable feature</FormLabel>
                          <FormDescription>
                            Activate the new functionality
                          </FormDescription>
                        </div>
                      </FormItem>
                    )}
                  />
                  <Button className="bg-accent hover:bg-accent/90 text-accent-foreground w-full">
                    Save Feature
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>

          {/* Semantic Colors Forms */}
          <Card className="border-success/20">
            <CardHeader>
              <CardTitle className="text-success flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Success Form
              </CardTitle>
              <CardDescription>Form for successful operations</CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...showcaseForm}>
                <form className="space-y-4">
                  <FormField
                    name="successRadio"
                    render={({ field }) => (
                      <FormItem className="space-y-3">
                        <FormLabel>Backup Status</FormLabel>
                        <FormControl>
                          <RadioGroup onValueChange={field.onChange}>
                            <div className="flex items-center space-x-2">
                              <RadioGroupItem value="completed" />
                              <label>Completed</label>
                            </div>
                            <div className="flex items-center space-x-2">
                              <RadioGroupItem value="pending" />
                              <label>Pending</label>
                            </div>
                          </RadioGroup>
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <Button className="bg-success hover:bg-success/90 text-success-foreground w-full">
                    Confirm Backup
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>

          <Card className="border-warning/20">
            <CardHeader>
              <CardTitle className="text-warning flex items-center gap-2">
                <Upload className="h-5 w-5" />
                Warning Form
              </CardTitle>
              <CardDescription>Form with warning indicators</CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...showcaseForm}>
                <form className="space-y-4">
                  <FormField
                    name="warningSwitch"
                    render={({ field }) => (
                      <FormItem className="border-warning/20 flex flex-row items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <FormLabel>Beta Features</FormLabel>
                          <FormDescription>
                            Enable experimental features
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <Button className="bg-warning hover:bg-warning/90 text-warning-foreground w-full">
                    Apply Changes
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>

          <Card className="border-danger/20">
            <CardHeader>
              <CardTitle className="text-danger flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Danger Form
              </CardTitle>
              <CardDescription>Form for critical operations</CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...showcaseForm}>
                <form className="space-y-4">
                  <FormField
                    name="dangerTextarea"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Deletion Reason</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Explain why you want to delete..."
                            className="border-danger/20"
                            {...field}
                          />
                        </FormControl>
                        <FormDescription className="text-danger/80">
                          This action cannot be undone
                        </FormDescription>
                      </FormItem>
                    )}
                  />
                  <Button
                    variant="destructive"
                    className="bg-danger hover:bg-danger/90 w-full"
                  >
                    Delete Account
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>
        </div>

        {/* Token Usage Examples */}
        <Card>
          <CardHeader>
            <CardTitle>CoreLive Design System Form Tokens</CardTitle>
            <CardDescription>
              Examples of form components using CoreLive design tokens
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div className="space-y-4">
                <h4 className="font-medium">Component Tokens</h4>
                <div className="space-y-2">
                  <Badge variant="outline">
                    form-label-color: var(--foreground)
                  </Badge>
                  <Badge variant="outline">
                    form-input-border: var(--border)
                  </Badge>
                  <Badge variant="outline">form-input-focus: var(--ring)</Badge>
                  <Badge variant="outline">
                    form-error-color: var(--destructive)
                  </Badge>
                  <Badge variant="outline">
                    form-description-color: var(--muted-foreground)
                  </Badge>
                </div>
              </div>
              <div className="space-y-4">
                <h4 className="font-medium">Interactive States</h4>
                <div className="space-y-2">
                  <Badge variant="outline">hover: opacity-90</Badge>
                  <Badge variant="outline">focus: ring-2 ring-ring</Badge>
                  <Badge variant="outline">disabled: opacity-50</Badge>
                  <Badge variant="outline">invalid: border-destructive</Badge>
                  <Badge variant="outline">valid: border-success</Badge>
                </div>
              </div>
            </div>

            <Separator />

            <div className="space-y-4">
              <h4 className="font-medium">Form Validation States</h4>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Normal State</label>
                  <Input placeholder="Enter value" />
                  <p className="text-muted-foreground text-sm">Helper text</p>
                </div>
                <div className="space-y-2">
                  <label className="text-destructive text-sm font-medium">
                    Error State
                  </label>
                  <Input
                    placeholder="Invalid input"
                    className="border-destructive"
                  />
                  <p className="text-destructive text-sm">
                    This field is required
                  </p>
                </div>
                <div className="space-y-2">
                  <label className="text-success text-sm font-medium">
                    Success State
                  </label>
                  <Input placeholder="Valid input" className="border-success" />
                  <p className="text-success text-sm">Input is valid</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  },
}
