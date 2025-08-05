import type { Meta, StoryObj } from '@storybook/react'
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ArrowLeft,
  ArrowRight,
  FileText,
  Users,
  Search,
  Grid,
  List,
} from 'lucide-react'
import { useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'

const meta: Meta<typeof Pagination> = {
  title: 'CoreLive Design System/Components/Pagination',
  component: Pagination,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'A pagination component for navigating through pages of content. Built with accessibility and styled with CoreLive Design System tokens.',
      },
    },
  },
  tags: ['autodocs'],
}

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {},
  render: () => (
    <Pagination>
      <PaginationContent>
        <PaginationItem>
          <PaginationPrevious href="#" />
        </PaginationItem>
        <PaginationItem>
          <PaginationLink href="#">1</PaginationLink>
        </PaginationItem>
        <PaginationItem>
          <PaginationLink href="#" isActive>
            2
          </PaginationLink>
        </PaginationItem>
        <PaginationItem>
          <PaginationLink href="#">3</PaginationLink>
        </PaginationItem>
        <PaginationItem>
          <PaginationEllipsis />
        </PaginationItem>
        <PaginationItem>
          <PaginationNext href="#" />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  ),
}

export const Simple: Story = {
  args: {},
  render: () => (
    <Pagination>
      <PaginationContent>
        <PaginationItem>
          <PaginationPrevious href="#" />
        </PaginationItem>
        <PaginationItem>
          <PaginationNext href="#" />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  ),
}

export const WithMorePages: Story = {
  args: {},
  render: () => (
    <Pagination>
      <PaginationContent>
        <PaginationItem>
          <PaginationPrevious href="#" />
        </PaginationItem>
        <PaginationItem>
          <PaginationLink href="#">1</PaginationLink>
        </PaginationItem>
        <PaginationItem>
          <PaginationLink href="#" isActive>
            2
          </PaginationLink>
        </PaginationItem>
        <PaginationItem>
          <PaginationLink href="#">3</PaginationLink>
        </PaginationItem>
        <PaginationItem>
          <PaginationLink href="#">4</PaginationLink>
        </PaginationItem>
        <PaginationItem>
          <PaginationLink href="#">5</PaginationLink>
        </PaginationItem>
        <PaginationItem>
          <PaginationEllipsis />
        </PaginationItem>
        <PaginationItem>
          <PaginationLink href="#">20</PaginationLink>
        </PaginationItem>
        <PaginationItem>
          <PaginationNext href="#" />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  ),
}

export const InteractivePagination: Story = {
  args: {},
  render: () => {
    const [currentPage, setCurrentPage] = useState(1)
    const totalPages = 10

    const generatePageNumbers = () => {
      const pages = []
      const maxVisible = 5

      if (totalPages <= maxVisible + 2) {
        for (let i = 1; i <= totalPages; i++) {
          pages.push(i)
        }
      } else {
        if (currentPage <= 3) {
          for (let i = 1; i <= maxVisible; i++) {
            pages.push(i)
          }
          pages.push('ellipsis')
          pages.push(totalPages)
        } else if (currentPage >= totalPages - 2) {
          pages.push(1)
          pages.push('ellipsis')
          for (let i = totalPages - maxVisible + 1; i <= totalPages; i++) {
            pages.push(i)
          }
        } else {
          pages.push(1)
          pages.push('ellipsis')
          for (let i = currentPage - 1; i <= currentPage + 1; i++) {
            pages.push(i)
          }
          pages.push('ellipsis')
          pages.push(totalPages)
        }
      }

      return pages
    }

    return (
      <div className="space-y-4">
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className="h-9 w-9"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
            </PaginationItem>

            {generatePageNumbers().map((page, index) => (
              <PaginationItem key={index}>
                {page === 'ellipsis' ? (
                  <PaginationEllipsis />
                ) : (
                  <PaginationLink
                    href="#"
                    isActive={page === currentPage}
                    onClick={(e) => {
                      e.preventDefault()
                      setCurrentPage(page as number)
                    }}
                  >
                    {page}
                  </PaginationLink>
                )}
              </PaginationItem>
            ))}

            <PaginationItem>
              <Button
                variant="ghost"
                size="icon"
                onClick={() =>
                  setCurrentPage((prev) => Math.min(totalPages, prev + 1))
                }
                disabled={currentPage === totalPages}
                className="h-9 w-9"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </PaginationItem>
          </PaginationContent>
        </Pagination>

        <p className="text-muted-foreground text-center text-sm">
          Page {currentPage} of {totalPages}
        </p>
      </div>
    )
  },
}

export const WithFirstLastButtons: Story = {
  args: {},
  render: () => {
    const [currentPage, setCurrentPage] = useState(5)
    const totalPages = 20

    return (
      <Pagination>
        <PaginationContent>
          <PaginationItem>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
              className="h-9 w-9"
            >
              <ChevronsLeft className="h-4 w-4" />
              <span className="sr-only">First page</span>
            </Button>
          </PaginationItem>

          <PaginationItem>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="h-9 w-9"
            >
              <ChevronLeft className="h-4 w-4" />
              <span className="sr-only">Previous page</span>
            </Button>
          </PaginationItem>

          <PaginationItem>
            <PaginationLink href="#" onClick={(e) => e.preventDefault()}>
              {currentPage}
            </PaginationLink>
          </PaginationItem>

          <PaginationItem>
            <span className="text-muted-foreground px-2">of {totalPages}</span>
          </PaginationItem>

          <PaginationItem>
            <Button
              variant="ghost"
              size="icon"
              onClick={() =>
                setCurrentPage((prev) => Math.min(totalPages, prev + 1))
              }
              disabled={currentPage === totalPages}
              className="h-9 w-9"
            >
              <ChevronRight className="h-4 w-4" />
              <span className="sr-only">Next page</span>
            </Button>
          </PaginationItem>

          <PaginationItem>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages}
              className="h-9 w-9"
            >
              <ChevronsRight className="h-4 w-4" />
              <span className="sr-only">Last page</span>
            </Button>
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    )
  },
}

export const WithPageSize: Story = {
  args: {},
  render: () => {
    const [currentPage, setCurrentPage] = useState(1)
    const [pageSize, setPageSize] = useState('10')
    const totalItems = 248
    const totalPages = Math.ceil(totalItems / parseInt(pageSize, 10))

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-muted-foreground text-sm">
            Showing {(currentPage - 1) * parseInt(pageSize, 10) + 1} to{' '}
            {Math.min(currentPage * parseInt(pageSize, 10), totalItems)} of{' '}
            {totalItems} results
          </p>

          <div className="flex items-center gap-2">
            <Label htmlFor="page-size" className="text-sm">
              Items per page:
            </Label>
            <Select value={pageSize} onValueChange={setPageSize}>
              <SelectTrigger id="page-size" className="w-20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10</SelectItem>
                <SelectItem value="20">20</SelectItem>
                <SelectItem value="50">50</SelectItem>
                <SelectItem value="100">100</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                href="#"
                onClick={(e) => {
                  e.preventDefault()
                  setCurrentPage((prev) => Math.max(1, prev - 1))
                }}
                className={
                  currentPage === 1 ? 'pointer-events-none opacity-50' : ''
                }
              />
            </PaginationItem>

            {[...Array(Math.min(5, totalPages))].map((_, i) => (
              <PaginationItem key={i}>
                <PaginationLink
                  href="#"
                  isActive={i + 1 === currentPage}
                  onClick={(e) => {
                    e.preventDefault()
                    setCurrentPage(i + 1)
                  }}
                >
                  {i + 1}
                </PaginationLink>
              </PaginationItem>
            ))}

            {totalPages > 5 && (
              <>
                <PaginationItem>
                  <PaginationEllipsis />
                </PaginationItem>
                <PaginationItem>
                  <PaginationLink
                    href="#"
                    onClick={(e) => {
                      e.preventDefault()
                      setCurrentPage(totalPages)
                    }}
                  >
                    {totalPages}
                  </PaginationLink>
                </PaginationItem>
              </>
            )}

            <PaginationItem>
              <PaginationNext
                href="#"
                onClick={(e) => {
                  e.preventDefault()
                  setCurrentPage((prev) => Math.min(totalPages, prev + 1))
                }}
                className={
                  currentPage === totalPages
                    ? 'pointer-events-none opacity-50'
                    : ''
                }
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      </div>
    )
  },
}

export const TableWithPagination: Story = {
  args: {},
  render: () => {
    const [currentPage, setCurrentPage] = useState(1)
    const itemsPerPage = 5

    const data = Array.from({ length: 23 }, (_, i) => ({
      id: i + 1,
      name: `User ${i + 1}`,
      email: `user${i + 1}@example.com`,
      status: i % 3 === 0 ? 'active' : i % 3 === 1 ? 'inactive' : 'pending',
    }))

    const totalPages = Math.ceil(data.length / itemsPerPage)
    const startIndex = (currentPage - 1) * itemsPerPage
    const endIndex = startIndex + itemsPerPage
    const currentData = data.slice(startIndex, endIndex)

    return (
      <Card className="w-full max-w-3xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            User Management
          </CardTitle>
          <CardDescription>A list of all users with pagination</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="rounded-md border">
              <table className="w-full">
                <thead>
                  <tr className="bg-muted/50 border-b">
                    <th className="p-2 text-left">ID</th>
                    <th className="p-2 text-left">Name</th>
                    <th className="p-2 text-left">Email</th>
                    <th className="p-2 text-left">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {currentData.map((user) => (
                    <tr key={user.id} className="border-b">
                      <td className="p-2">{user.id}</td>
                      <td className="p-2 font-medium">{user.name}</td>
                      <td className="p-2">{user.email}</td>
                      <td className="p-2">
                        <Badge
                          variant={
                            user.status === 'active'
                              ? 'default'
                              : user.status === 'inactive'
                                ? 'secondary'
                                : 'outline'
                          }
                        >
                          {user.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between">
              <p className="text-muted-foreground text-sm">
                Showing {startIndex + 1} to {Math.min(endIndex, data.length)} of{' '}
                {data.length} users
              </p>

              <Pagination>
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      href="#"
                      onClick={(e) => {
                        e.preventDefault()
                        setCurrentPage((prev) => Math.max(1, prev - 1))
                      }}
                      className={
                        currentPage === 1
                          ? 'pointer-events-none opacity-50'
                          : ''
                      }
                    />
                  </PaginationItem>

                  {[...Array(totalPages)].map((_, i) => (
                    <PaginationItem key={i}>
                      <PaginationLink
                        href="#"
                        isActive={i + 1 === currentPage}
                        onClick={(e) => {
                          e.preventDefault()
                          setCurrentPage(i + 1)
                        }}
                      >
                        {i + 1}
                      </PaginationLink>
                    </PaginationItem>
                  ))}

                  <PaginationItem>
                    <PaginationNext
                      href="#"
                      onClick={(e) => {
                        e.preventDefault()
                        setCurrentPage((prev) => Math.min(totalPages, prev + 1))
                      }}
                      className={
                        currentPage === totalPages
                          ? 'pointer-events-none opacity-50'
                          : ''
                      }
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  },
}

export const ProductGrid: Story = {
  args: {},
  render: () => {
    const [currentPage, setCurrentPage] = useState(1)
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
    const itemsPerPage = 6

    const products = Array.from({ length: 24 }, (_, i) => ({
      id: i + 1,
      name: `Product ${i + 1}`,
      price: Math.floor(Math.random() * 100) + 20,
      category: ['Electronics', 'Clothing', 'Books', 'Home'][
        Math.floor(Math.random() * 4)
      ],
    }))

    const totalPages = Math.ceil(products.length / itemsPerPage)
    const startIndex = (currentPage - 1) * itemsPerPage
    const endIndex = startIndex + itemsPerPage
    const currentProducts = products.slice(startIndex, endIndex)

    return (
      <div className="w-full max-w-4xl space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold">Products</h3>
            <p className="text-muted-foreground text-sm">
              Browse our collection of {products.length} products
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant={viewMode === 'grid' ? 'default' : 'outline'}
              size="icon"
              onClick={() => setViewMode('grid')}
            >
              <Grid className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === 'list' ? 'default' : 'outline'}
              size="icon"
              onClick={() => setViewMode('list')}
            >
              <List className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div
          className={
            viewMode === 'grid'
              ? 'grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3'
              : 'space-y-2'
          }
        >
          {currentProducts.map((product) => (
            <Card key={product.id} className={viewMode === 'list' ? 'p-4' : ''}>
              {viewMode === 'grid' ? (
                <CardContent className="p-4">
                  <div className="bg-muted mb-2 aspect-square rounded" />
                  <h4 className="font-medium">{product.name}</h4>
                  <p className="text-muted-foreground text-sm">
                    {product.category}
                  </p>
                  <p className="mt-2 font-semibold">${product.price}</p>
                </CardContent>
              ) : (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="bg-muted h-12 w-12 rounded" />
                    <div>
                      <h4 className="font-medium">{product.name}</h4>
                      <p className="text-muted-foreground text-sm">
                        {product.category}
                      </p>
                    </div>
                  </div>
                  <p className="font-semibold">${product.price}</p>
                </div>
              )}
            </Card>
          ))}
        </div>

        <div className="flex justify-center pt-4">
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  href="#"
                  onClick={(e) => {
                    e.preventDefault()
                    setCurrentPage((prev) => Math.max(1, prev - 1))
                  }}
                  className={
                    currentPage === 1 ? 'pointer-events-none opacity-50' : ''
                  }
                />
              </PaginationItem>

              {[...Array(Math.min(5, totalPages))].map((_, i) => {
                let pageNum
                if (totalPages <= 5) {
                  pageNum = i + 1
                } else if (currentPage <= 3) {
                  pageNum = i + 1
                } else if (currentPage >= totalPages - 2) {
                  pageNum = totalPages - 4 + i
                } else {
                  pageNum = currentPage - 2 + i
                }

                return (
                  <PaginationItem key={i}>
                    <PaginationLink
                      href="#"
                      isActive={pageNum === currentPage}
                      onClick={(e) => {
                        e.preventDefault()
                        setCurrentPage(pageNum)
                      }}
                    >
                      {pageNum}
                    </PaginationLink>
                  </PaginationItem>
                )
              })}

              <PaginationItem>
                <PaginationNext
                  href="#"
                  onClick={(e) => {
                    e.preventDefault()
                    setCurrentPage((prev) => Math.min(totalPages, prev + 1))
                  }}
                  className={
                    currentPage === totalPages
                      ? 'pointer-events-none opacity-50'
                      : ''
                  }
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      </div>
    )
  },
}

export const MinimalPagination: Story = {
  args: {},
  render: () => {
    const [currentPage, setCurrentPage] = useState(3)
    const totalPages = 10

    return (
      <div className="flex items-center gap-4">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
          disabled={currentPage === 1}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Previous
        </Button>

        <span className="text-muted-foreground text-sm">
          Page {currentPage} of {totalPages}
        </span>

        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            setCurrentPage((prev) => Math.min(totalPages, prev + 1))
          }
          disabled={currentPage === totalPages}
        >
          Next
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    )
  },
}

export const LoadMorePattern: Story = {
  args: {},
  render: () => {
    const [loadedItems, setLoadedItems] = useState(10)
    const totalItems = 50
    const itemsPerLoad = 10

    return (
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Articles
          </CardTitle>
          <CardDescription>
            Showing {loadedItems} of {totalItems} articles
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[...Array(loadedItems)].map((_, i) => (
              <div key={i} className="rounded-lg border p-3">
                <h4 className="font-medium">Article {i + 1}</h4>
                <p className="text-muted-foreground text-sm">
                  Published on {new Date().toLocaleDateString()}
                </p>
              </div>
            ))}
          </div>

          {loadedItems < totalItems && (
            <div className="mt-4 text-center">
              <Button
                variant="outline"
                onClick={() =>
                  setLoadedItems((prev) =>
                    Math.min(prev + itemsPerLoad, totalItems),
                  )
                }
              >
                Load More ({totalItems - loadedItems} remaining)
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    )
  },
}

export const CoreLiveThemeShowcase: Story = {
  args: {},
  render: () => (
    <div className="w-full max-w-4xl space-y-6">
      <div>
        <h3 className="text-heading-3 mb-4 font-medium">Pagination States</h3>
        <div className="space-y-4">
          <div>
            <p className="text-muted-foreground mb-2 text-sm">Default state</p>
            <Pagination>
              <PaginationContent>
                <PaginationItem>
                  <PaginationLink
                    href="#"
                    style={{
                      backgroundColor: 'var(--component-pagination-background)',
                      borderColor: 'var(--component-pagination-border)',
                      color: 'var(--component-pagination-text)',
                    }}
                  >
                    1
                  </PaginationLink>
                </PaginationItem>
                <PaginationItem>
                  <PaginationLink href="#">2</PaginationLink>
                </PaginationItem>
                <PaginationItem>
                  <PaginationLink href="#">3</PaginationLink>
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          </div>

          <div>
            <p className="text-muted-foreground mb-2 text-sm">Active state</p>
            <Pagination>
              <PaginationContent>
                <PaginationItem>
                  <PaginationLink href="#">1</PaginationLink>
                </PaginationItem>
                <PaginationItem>
                  <PaginationLink
                    href="#"
                    isActive
                    style={{
                      backgroundColor:
                        'var(--component-pagination-active-background)',
                      borderColor: 'var(--component-pagination-active-border)',
                      color: 'var(--component-pagination-active-text)',
                    }}
                  >
                    2
                  </PaginationLink>
                </PaginationItem>
                <PaginationItem>
                  <PaginationLink href="#">3</PaginationLink>
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          </div>

          <div>
            <p className="text-muted-foreground mb-2 text-sm">Disabled state</p>
            <Pagination>
              <PaginationContent>
                <PaginationItem>
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled
                    className="h-9 w-9"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                </PaginationItem>
                <PaginationItem>
                  <span className="text-muted-foreground px-3 py-2">1</span>
                </PaginationItem>
                <PaginationItem>
                  <Button variant="ghost" size="icon" className="h-9 w-9">
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-heading-3 mb-4 font-medium">Pagination Variants</h3>
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Numbered Pagination</CardTitle>
            </CardHeader>
            <CardContent>
              <Pagination>
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious href="#" />
                  </PaginationItem>
                  {[1, 2, 3, 4, 5].map((page) => (
                    <PaginationItem key={page}>
                      <PaginationLink href="#" isActive={page === 3}>
                        {page}
                      </PaginationLink>
                    </PaginationItem>
                  ))}
                  <PaginationItem>
                    <PaginationNext href="#" />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Compact Pagination</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <p className="text-muted-foreground text-sm">Page 3 of 10</p>
                <div className="flex gap-1">
                  <Button variant="outline" size="icon" className="h-8 w-8">
                    <ChevronsLeft className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="icon" className="h-8 w-8">
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="icon" className="h-8 w-8">
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="icon" className="h-8 w-8">
                    <ChevronsRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Text-based Pagination</CardTitle>
            </CardHeader>
            <CardContent className="flex justify-center">
              <div className="flex items-center gap-6">
                <Button variant="link" className="text-primary">
                  ← Previous
                </Button>
                <Separator orientation="vertical" className="h-6" />
                <Button variant="link" className="text-primary">
                  Next →
                </Button>
              </div>
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
              <nav className="flex items-center gap-2">
                <button
                  className="rounded-md px-3 py-2 text-sm font-medium transition-colors"
                  style={{
                    backgroundColor: 'var(--component-pagination-background)',
                    borderWidth: '1px',
                    borderStyle: 'solid',
                    borderColor: 'var(--component-pagination-border)',
                    color: 'var(--component-pagination-text)',
                  }}
                >
                  Previous
                </button>

                <button
                  className="rounded-md px-3 py-2 text-sm font-medium transition-colors"
                  style={{
                    backgroundColor:
                      'var(--component-pagination-active-background)',
                    borderWidth: '1px',
                    borderStyle: 'solid',
                    borderColor: 'var(--component-pagination-active-border)',
                    color: 'var(--component-pagination-active-text)',
                  }}
                >
                  1
                </button>

                <button
                  className="rounded-md px-3 py-2 text-sm font-medium transition-colors"
                  style={{
                    backgroundColor: 'var(--component-pagination-background)',
                    borderWidth: '1px',
                    borderStyle: 'solid',
                    borderColor: 'var(--component-pagination-border)',
                    color: 'var(--component-pagination-text)',
                  }}
                >
                  2
                </button>

                <span className="px-2">...</span>

                <button
                  className="rounded-md px-3 py-2 text-sm font-medium transition-colors"
                  style={{
                    backgroundColor: 'var(--component-pagination-background)',
                    borderWidth: '1px',
                    borderStyle: 'solid',
                    borderColor: 'var(--component-pagination-border)',
                    color: 'var(--component-pagination-text)',
                  }}
                >
                  Next
                </button>
              </nav>

              <div className="bg-muted rounded-md p-3">
                <code className="text-xs">
                  --component-pagination-background
                  <br />
                  --component-pagination-border
                  <br />
                  --component-pagination-text
                  <br />
                  --component-pagination-active-background
                  <br />
                  --component-pagination-active-border
                  <br />
                  --component-pagination-active-text
                  <br />
                  --component-pagination-hover-background
                </code>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div>
        <h3 className="text-heading-3 mb-4 font-medium">Real-world Examples</h3>
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Search Results</CardTitle>
              <CardDescription>
                Found 248 results for "design system"
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center gap-2 border-b p-2">
                  <Search className="text-muted-foreground h-4 w-4" />
                  <span className="text-sm">Showing results 21-30</span>
                </div>

                {[1, 2, 3].map((i) => (
                  <div key={i} className="rounded-lg border p-3">
                    <h4 className="text-primary font-medium">
                      Design System Result {i}
                    </h4>
                    <p className="text-muted-foreground mt-1 text-sm">
                      Lorem ipsum dolor sit amet, consectetur adipiscing elit...
                    </p>
                  </div>
                ))}

                <Separator />

                <div className="flex items-center justify-center">
                  <Pagination>
                    <PaginationContent>
                      <PaginationItem>
                        <PaginationPrevious href="#" />
                      </PaginationItem>
                      <PaginationItem>
                        <PaginationLink href="#">1</PaginationLink>
                      </PaginationItem>
                      <PaginationItem>
                        <PaginationLink href="#">2</PaginationLink>
                      </PaginationItem>
                      <PaginationItem>
                        <PaginationLink href="#" isActive>
                          3
                        </PaginationLink>
                      </PaginationItem>
                      <PaginationItem>
                        <PaginationLink href="#">4</PaginationLink>
                      </PaginationItem>
                      <PaginationItem>
                        <PaginationEllipsis />
                      </PaginationItem>
                      <PaginationItem>
                        <PaginationLink href="#">25</PaginationLink>
                      </PaginationItem>
                      <PaginationItem>
                        <PaginationNext href="#" />
                      </PaginationItem>
                    </PaginationContent>
                  </Pagination>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Comprehensive showcase of pagination variations using CoreLive Design System tokens for consistent navigation across different contexts.',
      },
    },
  },
}
