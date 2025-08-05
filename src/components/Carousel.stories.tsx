import type { Meta, StoryObj } from '@storybook/react'
import {
  Award,
  Briefcase,
  ChevronRight,
  Clock,
  Download,
  ExternalLink,
  Eye,
  FileText,
  Globe,
  GraduationCap,
  Heart,
  Image as ImageIcon,
  Lightbulb,
  MapPin,
  Music,
  Pause,
  Play,
  Share,
  Shield,
  ShoppingCart,
  Smartphone,
  Star,
  Target,
  TrendingUp,
  User,
  Users,
  Video,
  Zap,
} from 'lucide-react'
import { useState } from 'react'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@/components/ui/carousel'
import { Progress } from '@/components/ui/progress'

const meta: Meta<typeof Carousel> = {
  title: 'CoreLive Design System/Components/Carousel',
  component: Carousel,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'A carousel component for displaying content in a scrollable container. Built with Embla Carousel and styled with CoreLive Design System tokens.',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    orientation: {
      control: 'radio',
      options: ['horizontal', 'vertical'],
      description: 'The orientation of the carousel',
    },
  },
}

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {},
  render: () => (
    <Carousel className="w-full max-w-xs">
      <CarouselContent>
        {Array.from({ length: 5 }, (_, index) => (
          <CarouselItem key={index}>
            <div className="p-1">
              <Card>
                <CardContent className="flex aspect-square items-center justify-center p-6">
                  <span className="text-4xl font-semibold">{index + 1}</span>
                </CardContent>
              </Card>
            </div>
          </CarouselItem>
        ))}
      </CarouselContent>
      <CarouselPrevious />
      <CarouselNext />
    </Carousel>
  ),
}

export const MultipleItems: Story = {
  args: {},
  render: () => (
    <Carousel
      opts={{
        align: 'start',
      }}
      className="w-full max-w-sm"
    >
      <CarouselContent>
        {Array.from({ length: 5 }, (_, index) => (
          <CarouselItem key={index} className="md:basis-1/2 lg:basis-1/3">
            <div className="p-1">
              <Card>
                <CardContent className="flex aspect-square items-center justify-center p-6">
                  <span className="text-2xl font-semibold">{index + 1}</span>
                </CardContent>
              </Card>
            </div>
          </CarouselItem>
        ))}
      </CarouselContent>
      <CarouselPrevious />
      <CarouselNext />
    </Carousel>
  ),
}

export const VerticalOrientation: Story = {
  args: {},
  render: () => (
    <Carousel orientation="vertical" className="w-full max-w-xs">
      <CarouselContent className="-mt-1 h-[200px]">
        {Array.from({ length: 5 }, (_, index) => (
          <CarouselItem key={index} className="pt-1 md:basis-1/2">
            <div className="p-1">
              <Card>
                <CardContent className="flex items-center justify-center p-6">
                  <span className="text-3xl font-semibold">{index + 1}</span>
                </CardContent>
              </Card>
            </div>
          </CarouselItem>
        ))}
      </CarouselContent>
      <CarouselPrevious />
      <CarouselNext />
    </Carousel>
  ),
}

export const ProductShowcase: Story = {
  args: {},
  render: () => {
    const products = [
      {
        id: 1,
        name: 'Wireless Headphones',
        price: '$99.99',
        rating: 4.5,
        image: '/api/placeholder/300/200',
        badge: 'Bestseller',
        reviews: 2456,
      },
      {
        id: 2,
        name: 'Smartphone Case',
        price: '$24.99',
        rating: 4.8,
        image: '/api/placeholder/300/200',
        badge: 'New',
        reviews: 892,
      },
      {
        id: 3,
        name: 'Bluetooth Speaker',
        price: '$79.99',
        rating: 4.3,
        image: '/api/placeholder/300/200',
        badge: 'Sale',
        reviews: 1234,
      },
      {
        id: 4,
        name: 'Smart Watch',
        price: '$199.99',
        rating: 4.7,
        image: '/api/placeholder/300/200',
        badge: 'Premium',
        reviews: 567,
      },
      {
        id: 5,
        name: 'USB-C Hub',
        price: '$49.99',
        rating: 4.4,
        image: '/api/placeholder/300/200',
        badge: 'Essential',
        reviews: 3421,
      },
    ]

    return (
      <div className="w-full max-w-4xl">
        <div className="mb-6">
          <h2 className="text-heading-2 mb-2 font-bold">Featured Products</h2>
          <p className="text-muted-foreground">Discover our top-rated items</p>
        </div>

        <Carousel
          opts={{
            align: 'start',
          }}
          className="w-full"
        >
          <CarouselContent>
            {products.map((product) => (
              <CarouselItem
                key={product.id}
                className="md:basis-1/2 lg:basis-1/3"
              >
                <div className="p-1">
                  <Card className="overflow-hidden">
                    <div className="relative">
                      <div className="from-muted to-muted-foreground/20 flex aspect-[4/3] items-center justify-center bg-gradient-to-br">
                        <Smartphone className="text-muted-foreground h-12 w-12" />
                      </div>
                      <Badge
                        className="absolute top-2 left-2"
                        variant="secondary"
                      >
                        {product.badge}
                      </Badge>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="bg-background/80 hover:bg-background absolute top-2 right-2"
                      >
                        <Heart className="h-4 w-4" />
                      </Button>
                    </div>
                    <CardContent className="p-4">
                      <h3 className="mb-1 text-sm font-semibold">
                        {product.name}
                      </h3>
                      <div className="mb-2 flex items-center gap-2">
                        <div className="flex items-center">
                          {Array.from({ length: 5 }, (_, i) => (
                            <Star
                              key={i}
                              className={`h-3 w-3 ${
                                i < Math.floor(product.rating)
                                  ? 'fill-primary text-primary'
                                  : 'text-muted-foreground'
                              }`}
                            />
                          ))}
                        </div>
                        <span className="text-muted-foreground text-xs">
                          ({product.reviews})
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-lg font-bold">
                          {product.price}
                        </span>
                        <Button size="sm">
                          <ShoppingCart className="mr-2 h-4 w-4" />
                          Add to Cart
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </CarouselItem>
            ))}
          </CarouselContent>
          <CarouselPrevious />
          <CarouselNext />
        </Carousel>
      </div>
    )
  },
  parameters: {
    layout: 'padded',
  },
}

export const TeamMembers: Story = {
  args: {},
  render: () => {
    const teamMembers = [
      {
        name: 'Sarah Johnson',
        role: 'CEO & Founder',
        bio: '10+ years in tech leadership',
        avatar: '/api/placeholder/100/100',
        skills: ['Strategy', 'Leadership', 'Product'],
        location: 'San Francisco, CA',
      },
      {
        name: 'Michael Chen',
        role: 'CTO',
        bio: 'Full-stack architect & engineer',
        avatar: '/api/placeholder/100/100',
        skills: ['React', 'Node.js', 'AWS'],
        location: 'Seattle, WA',
      },
      {
        name: 'Emily Rodriguez',
        role: 'Head of Design',
        bio: 'UX/UI designer with agency background',
        avatar: '/api/placeholder/100/100',
        skills: ['Figma', 'Prototyping', 'Research'],
        location: 'Austin, TX',
      },
      {
        name: 'David Kim',
        role: 'Head of Marketing',
        bio: 'Growth marketing specialist',
        avatar: '/api/placeholder/100/100',
        skills: ['SEO', 'Analytics', 'Content'],
        location: 'New York, NY',
      },
      {
        name: 'Lisa Thompson',
        role: 'Operations Manager',
        bio: 'Process optimization expert',
        avatar: '/api/placeholder/100/100',
        skills: ['Ops', 'Analytics', 'Automation'],
        location: 'Denver, CO',
      },
    ]

    return (
      <div className="w-full max-w-5xl">
        <div className="mb-8 text-center">
          <h2 className="text-heading-2 mb-2 font-bold">Meet Our Team</h2>
          <p className="text-muted-foreground">The people behind our success</p>
        </div>

        <Carousel
          opts={{
            align: 'start',
            loop: true,
          }}
          className="w-full"
        >
          <CarouselContent>
            {teamMembers.map((member, index) => (
              <CarouselItem key={index} className="md:basis-1/2 lg:basis-1/3">
                <div className="p-1">
                  <Card className="text-center">
                    <CardContent className="p-6">
                      <Avatar className="mx-auto mb-4 h-20 w-20">
                        <AvatarImage src={member.avatar} />
                        <AvatarFallback>
                          <User className="h-8 w-8" />
                        </AvatarFallback>
                      </Avatar>
                      <h3 className="mb-1 text-lg font-semibold">
                        {member.name}
                      </h3>
                      <p className="text-primary mb-2 text-sm font-medium">
                        {member.role}
                      </p>
                      <p className="text-muted-foreground mb-4 text-sm">
                        {member.bio}
                      </p>

                      <div className="mb-3 flex items-center justify-center gap-1">
                        <MapPin className="text-muted-foreground h-3 w-3" />
                        <span className="text-muted-foreground text-xs">
                          {member.location}
                        </span>
                      </div>

                      <div className="flex flex-wrap justify-center gap-1">
                        {member.skills.map((skill, skillIndex) => (
                          <Badge
                            key={skillIndex}
                            variant="secondary"
                            className="text-xs"
                          >
                            {skill}
                          </Badge>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </CarouselItem>
            ))}
          </CarouselContent>
          <CarouselPrevious />
          <CarouselNext />
        </Carousel>
      </div>
    )
  },
  parameters: {
    layout: 'padded',
  },
}

export const TestimonialCarousel: Story = {
  args: {},
  render: () => {
    const testimonials = [
      {
        content:
          'CoreLive has transformed how we build our applications. The design system is incredibly thoughtful and the components are rock solid.',
        author: 'Alex Thompson',
        role: 'Lead Developer',
        company: 'TechCorp Inc.',
        rating: 5,
        avatar: '/api/placeholder/60/60',
      },
      {
        content:
          'The attention to detail in CoreLive is outstanding. Our development velocity has increased by 40% since we started using it.',
        author: 'Maria Garcia',
        role: 'Product Manager',
        company: 'StartupXYZ',
        rating: 5,
        avatar: '/api/placeholder/60/60',
      },
      {
        content:
          'Finally, a design system that developers actually want to use. The documentation is excellent and the components are highly customizable.',
        author: 'James Wilson',
        role: 'Frontend Architect',
        company: 'Enterprise Solutions',
        rating: 5,
        avatar: '/api/placeholder/60/60',
      },
      {
        content:
          "CoreLive strikes the perfect balance between flexibility and consistency. It's been a game-changer for our design team.",
        author: 'Sophie Chen',
        role: 'UX Designer',
        company: 'Creative Agency',
        rating: 5,
        avatar: '/api/placeholder/60/60',
      },
    ]

    return (
      <div className="w-full max-w-4xl">
        <div className="mb-8 text-center">
          <h2 className="text-heading-2 mb-2 font-bold">What Our Users Say</h2>
          <p className="text-muted-foreground">
            Real feedback from teams using CoreLive
          </p>
        </div>

        <Carousel
          opts={{
            align: 'start',
            loop: true,
          }}
          className="w-full"
        >
          <CarouselContent>
            {testimonials.map((testimonial, index) => (
              <CarouselItem key={index} className="md:basis-1/2">
                <div className="p-1">
                  <Card>
                    <CardContent className="p-6">
                      <div className="mb-4 flex items-center gap-1">
                        {Array.from({ length: testimonial.rating }, (_, i) => (
                          <Star
                            key={i}
                            className="fill-primary text-primary h-4 w-4"
                          />
                        ))}
                      </div>

                      <blockquote className="mb-4 text-sm leading-relaxed">
                        "{testimonial.content}"
                      </blockquote>

                      <div className="flex items-center gap-3">
                        <Avatar className="h-10 w-10">
                          <AvatarImage src={testimonial.avatar} />
                          <AvatarFallback>
                            <User className="h-4 w-4" />
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="text-sm font-semibold">
                            {testimonial.author}
                          </p>
                          <p className="text-muted-foreground text-xs">
                            {testimonial.role} at {testimonial.company}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </CarouselItem>
            ))}
          </CarouselContent>
          <CarouselPrevious />
          <CarouselNext />
        </Carousel>
      </div>
    )
  },
  parameters: {
    layout: 'padded',
  },
}

export const MediaGallery: Story = {
  args: {},
  render: () => {
    const [isPlaying, setIsPlaying] = useState(false)

    const mediaItems = [
      {
        type: 'image',
        title: 'Beautiful Landscape',
        description: 'Stunning mountain view at sunset',
        duration: null,
        views: '2.3K',
      },
      {
        type: 'video',
        title: 'Product Demo',
        description: 'See our features in action',
        duration: '2:45',
        views: '15.7K',
      },
      {
        type: 'audio',
        title: 'Podcast Episode',
        description: 'Design System Deep Dive',
        duration: '32:15',
        views: '8.9K',
      },
      {
        type: 'document',
        title: 'White Paper',
        description: 'The Future of Design Systems',
        duration: null,
        views: '5.2K',
      },
      {
        type: 'image',
        title: 'Team Photo',
        description: 'Our amazing team at work',
        duration: null,
        views: '1.8K',
      },
    ]

    const getMediaIcon = (type: string) => {
      switch (type) {
        case 'video':
          return Video
        case 'audio':
          return Music
        case 'document':
          return FileText
        default:
          return ImageIcon
      }
    }

    const getMediaColor = (type: string) => {
      switch (type) {
        case 'video':
          return 'bg-primary'
        case 'audio':
          return 'bg-secondary'
        case 'document':
          return 'bg-accent'
        default:
          return 'bg-muted'
      }
    }

    return (
      <div className="w-full max-w-3xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-heading-2 mb-1 font-bold">Media Gallery</h2>
            <p className="text-muted-foreground">
              Browse our content collection
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm">
              <Download className="mr-2 h-4 w-4" />
              Download All
            </Button>
            <Button variant="outline" size="sm">
              <Share className="mr-2 h-4 w-4" />
              Share
            </Button>
          </div>
        </div>

        <Carousel className="w-full">
          <CarouselContent>
            {mediaItems.map((item, index) => {
              const Icon = getMediaIcon(item.type)
              return (
                <CarouselItem key={index}>
                  <Card>
                    <div className="relative">
                      <div
                        className={`aspect-video ${getMediaColor(item.type)} flex items-center justify-center`}
                      >
                        <Icon className="h-16 w-16 text-white/80" />
                        {item.type === 'video' && (
                          <Button
                            size="icon"
                            className="absolute inset-0 m-auto h-12 w-12 rounded-full bg-black/50 hover:bg-black/70"
                            onClick={() => setIsPlaying(!isPlaying)}
                          >
                            {isPlaying ? (
                              <Pause className="h-6 w-6 text-white" />
                            ) : (
                              <Play className="ml-1 h-6 w-6 text-white" />
                            )}
                          </Button>
                        )}
                      </div>

                      {item.duration && (
                        <Badge
                          className="absolute right-2 bottom-2"
                          variant="secondary"
                        >
                          {item.duration}
                        </Badge>
                      )}

                      <div className="absolute top-2 left-2 flex gap-2">
                        <Badge variant="outline" className="bg-background/80">
                          {item.type}
                        </Badge>
                      </div>
                    </div>

                    <CardContent className="p-4">
                      <div className="mb-2 flex items-start justify-between">
                        <div className="flex-1">
                          <h3 className="mb-1 font-semibold">{item.title}</h3>
                          <p className="text-muted-foreground mb-3 text-sm">
                            {item.description}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="text-muted-foreground flex items-center gap-4 text-sm">
                          <div className="flex items-center gap-1">
                            <Eye className="h-4 w-4" />
                            <span>{item.views} views</span>
                          </div>
                        </div>

                        <div className="flex gap-2">
                          <Button variant="ghost" size="sm">
                            <Heart className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm">
                            <Share className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm">
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </CarouselItem>
              )
            })}
          </CarouselContent>
          <CarouselPrevious />
          <CarouselNext />
        </Carousel>
      </div>
    )
  },
  parameters: {
    layout: 'padded',
  },
}

export const FeatureHighlights: Story = {
  args: {},
  render: () => {
    const features = [
      {
        icon: Zap,
        title: 'Lightning Fast',
        description:
          'Optimized for speed and performance with minimal bundle size',
        benefits: [
          '50% faster load times',
          'Tree-shakeable components',
          'Optimized CSS',
        ],
        color: 'primary',
      },
      {
        icon: Shield,
        title: 'Enterprise Security',
        description:
          'Built with security best practices and compliance standards',
        benefits: [
          'GDPR compliant',
          'SOC 2 certified',
          'Regular security audits',
        ],
        color: 'secondary',
      },
      {
        icon: Lightbulb,
        title: 'Developer Experience',
        description:
          'Designed for developers with TypeScript support and great DX',
        benefits: [
          'Full TypeScript support',
          'Excellent documentation',
          'Active community',
        ],
        color: 'accent',
      },
      {
        icon: Globe,
        title: 'Global Scale',
        description:
          'Trusted by companies worldwide with 99.9% uptime guarantee',
        benefits: ['Global CDN', 'Auto-scaling', '24/7 monitoring'],
        color: 'success',
      },
    ]

    return (
      <div className="w-full max-w-5xl">
        <div className="mb-8 text-center">
          <h2 className="text-heading-2 mb-2 font-bold">
            Why Choose CoreLive?
          </h2>
          <p className="text-muted-foreground">
            Everything you need to build modern applications
          </p>
        </div>

        <Carousel
          opts={{
            align: 'start',
            loop: true,
          }}
          className="w-full"
        >
          <CarouselContent>
            {features.map((feature, index) => {
              const Icon = feature.icon
              return (
                <CarouselItem key={index} className="md:basis-1/2 lg:basis-1/3">
                  <div className="h-full p-1">
                    <Card className="h-full">
                      <CardContent className="flex h-full flex-col p-6">
                        <div
                          className={`h-12 w-12 rounded-lg bg-${feature.color}/10 mb-4 flex items-center justify-center`}
                        >
                          <Icon className={`h-6 w-6 text-${feature.color}`} />
                        </div>

                        <h3 className="mb-2 text-lg font-semibold">
                          {feature.title}
                        </h3>
                        <p className="text-muted-foreground mb-4 flex-1 text-sm">
                          {feature.description}
                        </p>

                        <div className="space-y-2">
                          {feature.benefits.map((benefit, benefitIndex) => (
                            <div
                              key={benefitIndex}
                              className="flex items-center gap-2"
                            >
                              <div className="bg-primary h-1.5 w-1.5 rounded-full" />
                              <span className="text-muted-foreground text-xs">
                                {benefit}
                              </span>
                            </div>
                          ))}
                        </div>

                        <Button className="mt-4 w-full" variant="outline">
                          Learn More
                          <ChevronRight className="ml-2 h-4 w-4" />
                        </Button>
                      </CardContent>
                    </Card>
                  </div>
                </CarouselItem>
              )
            })}
          </CarouselContent>
          <CarouselPrevious />
          <CarouselNext />
        </Carousel>
      </div>
    )
  },
  parameters: {
    layout: 'padded',
  },
}

export const CourseCarousel: Story = {
  args: {},
  render: () => {
    const courses = [
      {
        title: 'React Fundamentals',
        instructor: 'Sarah Johnson',
        duration: '4.5 hours',
        level: 'Beginner',
        rating: 4.8,
        students: 12400,
        price: '$49',
        thumbnail: '/api/placeholder/300/200',
        category: 'Frontend',
        icon: GraduationCap,
        progress: 0,
      },
      {
        title: 'Advanced TypeScript',
        instructor: 'Michael Chen',
        duration: '6.2 hours',
        level: 'Advanced',
        rating: 4.9,
        students: 8900,
        price: '$79',
        thumbnail: '/api/placeholder/300/200',
        category: 'Programming',
        icon: Target,
        progress: 65,
      },
      {
        title: 'UI/UX Design Principles',
        instructor: 'Emily Rodriguez',
        duration: '3.8 hours',
        level: 'Intermediate',
        rating: 4.7,
        students: 15600,
        price: '$59',
        thumbnail: '/api/placeholder/300/200',
        category: 'Design',
        icon: Lightbulb,
        progress: 100,
      },
      {
        title: 'Full-Stack Development',
        instructor: 'David Kim',
        duration: '12.5 hours',
        level: 'Advanced',
        rating: 4.9,
        students: 6700,
        price: '$129',
        thumbnail: '/api/placeholder/300/200',
        category: 'Full-Stack',
        icon: Briefcase,
        progress: 25,
      },
    ]

    const getLevelColor = (level: string) => {
      switch (level) {
        case 'Beginner':
          return 'bg-success text-success-foreground'
        case 'Intermediate':
          return 'bg-warning text-warning-foreground'
        case 'Advanced':
          return 'bg-danger text-danger-foreground'
        default:
          return 'bg-muted text-muted-foreground'
      }
    }

    return (
      <div className="w-full max-w-6xl">
        <div className="mb-6">
          <h2 className="text-heading-2 mb-2 font-bold">Featured Courses</h2>
          <p className="text-muted-foreground">
            Expand your skills with our expert-led courses
          </p>
        </div>

        <Carousel
          opts={{
            align: 'start',
          }}
          className="w-full"
        >
          <CarouselContent>
            {courses.map((course, index) => {
              const Icon = course.icon
              return (
                <CarouselItem key={index} className="md:basis-1/2 lg:basis-1/3">
                  <div className="p-1">
                    <Card className="overflow-hidden">
                      <div className="relative">
                        <div className="from-primary/10 to-accent/10 flex aspect-video items-center justify-center bg-gradient-to-br">
                          <Icon className="text-muted-foreground h-12 w-12" />
                        </div>
                        <Badge
                          className="absolute top-2 left-2"
                          variant="secondary"
                        >
                          {course.category}
                        </Badge>
                        <Badge
                          className={`absolute top-2 right-2 ${getLevelColor(course.level)}`}
                        >
                          {course.level}
                        </Badge>
                      </div>

                      <CardContent className="p-4">
                        <h3 className="mb-1 line-clamp-2 font-semibold">
                          {course.title}
                        </h3>
                        <p className="text-muted-foreground mb-2 text-sm">
                          by {course.instructor}
                        </p>

                        <div className="text-muted-foreground mb-3 flex items-center gap-4 text-xs">
                          <div className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            <span>{course.duration}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Users className="h-3 w-3" />
                            <span>{course.students.toLocaleString()}</span>
                          </div>
                        </div>

                        <div className="mb-3 flex items-center gap-2">
                          <div className="flex items-center">
                            {Array.from({ length: 5 }, (_, i) => (
                              <Star
                                key={i}
                                className={`h-3 w-3 ${
                                  i < Math.floor(course.rating)
                                    ? 'fill-primary text-primary'
                                    : 'text-muted-foreground'
                                }`}
                              />
                            ))}
                          </div>
                          <span className="text-xs font-medium">
                            {course.rating}
                          </span>
                        </div>

                        {course.progress > 0 && (
                          <div className="mb-3">
                            <div className="mb-1 flex items-center justify-between">
                              <span className="text-muted-foreground text-xs">
                                Progress
                              </span>
                              <span className="text-xs font-medium">
                                {course.progress}%
                              </span>
                            </div>
                            <Progress value={course.progress} className="h-1" />
                          </div>
                        )}

                        <div className="flex items-center justify-between">
                          <span className="text-lg font-bold">
                            {course.price}
                          </span>
                          <Button size="sm">
                            {course.progress > 0 ? 'Continue' : 'Enroll Now'}
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </CarouselItem>
              )
            })}
          </CarouselContent>
          <CarouselPrevious />
          <CarouselNext />
        </Carousel>
      </div>
    )
  },
  parameters: {
    layout: 'padded',
  },
}

export const CoreLiveThemeShowcase: Story = {
  args: {},
  render: () => (
    <div className="w-full max-w-4xl space-y-8">
      <div>
        <h3 className="text-heading-3 mb-4 font-medium">
          Carousel Orientations
        </h3>
        <div className="space-y-6">
          <div>
            <p className="text-muted-foreground mb-4 text-sm">
              Horizontal (default)
            </p>
            <Carousel className="w-full max-w-xs">
              <CarouselContent>
                {Array.from({ length: 3 }, (_, index) => (
                  <CarouselItem key={index}>
                    <Card>
                      <CardContent className="flex aspect-square items-center justify-center p-6">
                        <span className="text-2xl font-semibold">
                          {index + 1}
                        </span>
                      </CardContent>
                    </Card>
                  </CarouselItem>
                ))}
              </CarouselContent>
              <CarouselPrevious />
              <CarouselNext />
            </Carousel>
          </div>

          <div>
            <p className="text-muted-foreground mb-4 text-sm">Vertical</p>
            <Carousel orientation="vertical" className="w-full max-w-xs">
              <CarouselContent className="-mt-1 h-[300px]">
                {Array.from({ length: 3 }, (_, index) => (
                  <CarouselItem key={index} className="pt-1">
                    <Card>
                      <CardContent className="flex items-center justify-center p-6">
                        <span className="text-2xl font-semibold">
                          {index + 1}
                        </span>
                      </CardContent>
                    </Card>
                  </CarouselItem>
                ))}
              </CarouselContent>
              <CarouselPrevious />
              <CarouselNext />
            </Carousel>
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-heading-3 mb-4 font-medium">Navigation Styles</h3>
        <div className="space-y-6">
          <div>
            <p className="text-muted-foreground mb-4 text-sm">
              Custom Button Styles
            </p>
            <Carousel className="w-full max-w-xs">
              <CarouselContent>
                {Array.from({ length: 3 }, (_, index) => (
                  <CarouselItem key={index}>
                    <Card>
                      <CardContent className="flex aspect-square items-center justify-center p-6">
                        <span className="text-2xl font-semibold">
                          {index + 1}
                        </span>
                      </CardContent>
                    </Card>
                  </CarouselItem>
                ))}
              </CarouselContent>
              <CarouselPrevious
                variant="default"
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              />
              <CarouselNext
                variant="default"
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              />
            </Carousel>
          </div>

          <div>
            <p className="text-muted-foreground mb-4 text-sm">
              Ghost Button Style
            </p>
            <Carousel className="w-full max-w-xs">
              <CarouselContent>
                {Array.from({ length: 3 }, (_, index) => (
                  <CarouselItem key={index}>
                    <Card>
                      <CardContent className="flex aspect-square items-center justify-center p-6">
                        <span className="text-2xl font-semibold">
                          {index + 1}
                        </span>
                      </CardContent>
                    </Card>
                  </CarouselItem>
                ))}
              </CarouselContent>
              <CarouselPrevious variant="ghost" />
              <CarouselNext variant="ghost" />
            </Carousel>
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-heading-3 mb-4 font-medium">
          Multiple Items Layout
        </h3>
        <Carousel className="w-full max-w-2xl">
          <CarouselContent>
            {Array.from({ length: 6 }, (_, index) => (
              <CarouselItem key={index} className="basis-1/3">
                <div className="p-1">
                  <Card>
                    <CardContent className="flex aspect-square items-center justify-center p-6">
                      <span className="text-xl font-semibold">{index + 1}</span>
                    </CardContent>
                  </Card>
                </div>
              </CarouselItem>
            ))}
          </CarouselContent>
          <CarouselPrevious />
          <CarouselNext />
        </Carousel>
      </div>

      <div>
        <h3 className="text-heading-3 mb-4 font-medium">Semantic Usage</h3>
        <div className="space-y-6">
          <div>
            <p className="text-muted-foreground mb-4 text-sm">Success Theme</p>
            <Carousel className="w-full max-w-xs">
              <CarouselContent>
                {Array.from({ length: 3 }, (_, index) => (
                  <CarouselItem key={index}>
                    <Card className="border-success/20">
                      <CardContent className="bg-success/5 flex aspect-square items-center justify-center p-6">
                        <div className="text-center">
                          <Award className="text-success mx-auto mb-2 h-8 w-8" />
                          <span className="text-success text-sm font-medium">
                            Success {index + 1}
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  </CarouselItem>
                ))}
              </CarouselContent>
              <CarouselPrevious className="border-success/20 text-success hover:bg-success/10" />
              <CarouselNext className="border-success/20 text-success hover:bg-success/10" />
            </Carousel>
          </div>

          <div>
            <p className="text-muted-foreground mb-4 text-sm">Warning Theme</p>
            <Carousel className="w-full max-w-xs">
              <CarouselContent>
                {Array.from({ length: 3 }, (_, index) => (
                  <CarouselItem key={index}>
                    <Card className="border-warning/20">
                      <CardContent className="bg-warning/5 flex aspect-square items-center justify-center p-6">
                        <div className="text-center">
                          <TrendingUp className="text-warning mx-auto mb-2 h-8 w-8" />
                          <span className="text-warning text-sm font-medium">
                            Alert {index + 1}
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  </CarouselItem>
                ))}
              </CarouselContent>
              <CarouselPrevious className="border-warning/20 text-warning hover:bg-warning/10" />
              <CarouselNext className="border-warning/20 text-warning hover:bg-warning/10" />
            </Carousel>
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-heading-3 mb-4 font-medium">
          Component Token Usage
        </h3>
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-4">
              <div>
                <p className="mb-4 text-sm font-medium">
                  Custom carousel using component tokens
                </p>
                <div
                  className="relative mx-auto w-full max-w-xs"
                  style={
                    {
                      '--carousel-background':
                        'var(--component-carousel-background)',
                      '--carousel-border': 'var(--component-carousel-border)',
                    } as React.CSSProperties
                  }
                >
                  <Carousel>
                    <CarouselContent>
                      {Array.from({ length: 3 }, (_, index) => (
                        <CarouselItem key={index}>
                          <div
                            className="flex aspect-square items-center justify-center rounded-lg border"
                            style={{
                              backgroundColor: 'var(--carousel-background)',
                              borderColor: 'var(--carousel-border)',
                            }}
                          >
                            <span className="text-2xl font-semibold">
                              {index + 1}
                            </span>
                          </div>
                        </CarouselItem>
                      ))}
                    </CarouselContent>
                    <CarouselPrevious
                      style={{
                        backgroundColor:
                          'var(--component-carousel-navigation-background)',
                        borderColor:
                          'var(--component-carousel-navigation-border)',
                        color: 'var(--component-carousel-navigation-text)',
                      }}
                    />
                    <CarouselNext
                      style={{
                        backgroundColor:
                          'var(--component-carousel-navigation-background)',
                        borderColor:
                          'var(--component-carousel-navigation-border)',
                        color: 'var(--component-carousel-navigation-text)',
                      }}
                    />
                  </Carousel>
                </div>
              </div>

              <div className="bg-muted rounded-md p-3">
                <code className="text-xs">
                  --component-carousel-background
                  <br />
                  --component-carousel-border
                  <br />
                  --component-carousel-navigation-background
                  <br />
                  --component-carousel-navigation-border
                  <br />
                  --component-carousel-navigation-text
                  <br />
                  --component-carousel-navigation-hover-background
                  <br />
                  --component-carousel-navigation-hover-text
                  <br />
                  --component-carousel-indicator-background
                  <br />
                  --component-carousel-indicator-active-background
                </code>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div>
        <h3 className="text-heading-3 mb-4 font-medium">Advanced Features</h3>
        <div className="space-y-6">
          <div>
            <p className="text-muted-foreground mb-4 text-sm">
              Auto-play Carousel
            </p>
            <Carousel
              opts={{
                align: 'start',
                loop: true,
              }}
              className="w-full max-w-sm"
            >
              <CarouselContent>
                {Array.from({ length: 5 }, (_, index) => (
                  <CarouselItem key={index} className="basis-1/2">
                    <Card>
                      <CardContent className="flex aspect-square items-center justify-center p-4">
                        <div className="text-center">
                          <Play className="text-primary mx-auto mb-2 h-6 w-6" />
                          <span className="text-sm font-medium">
                            Auto {index + 1}
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  </CarouselItem>
                ))}
              </CarouselContent>
              <CarouselPrevious />
              <CarouselNext />
            </Carousel>
          </div>
        </div>
      </div>
    </div>
  ),
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        story:
          'Comprehensive showcase of carousel variations using CoreLive Design System tokens for consistent content presentation across different contexts.',
      },
    },
  },
}
