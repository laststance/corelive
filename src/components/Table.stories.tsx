import type { Meta, StoryObj } from '@storybook/react'
import {
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ChevronDown,
  ChevronRight,
  MoreHorizontal,
  Download,
  Filter,
  Search,
  CheckCircle,
  XCircle,
  AlertCircle,
  Clock,
  TrendingUp,
  TrendingDown,
  Users,
  Package,
  DollarSign,
  ShoppingCart,
  Info,
} from 'lucide-react'
import { useState } from 'react'

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
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

const meta: Meta<typeof Table> = {
  title: 'CoreLive Design System/Components/Table',
  component: Table,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'A responsive table component for displaying tabular data. Built with accessibility and styled with CoreLive Design System tokens.',
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
    <Table>
      <TableCaption>A list of your recent invoices.</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[100px]">Invoice</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Method</TableHead>
          <TableHead className="text-right">Amount</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell className="font-medium">INV001</TableCell>
          <TableCell>Paid</TableCell>
          <TableCell>Credit Card</TableCell>
          <TableCell className="text-right">$250.00</TableCell>
        </TableRow>
        <TableRow>
          <TableCell className="font-medium">INV002</TableCell>
          <TableCell>Pending</TableCell>
          <TableCell>PayPal</TableCell>
          <TableCell className="text-right">$150.00</TableCell>
        </TableRow>
        <TableRow>
          <TableCell className="font-medium">INV003</TableCell>
          <TableCell>Unpaid</TableCell>
          <TableCell>Bank Transfer</TableCell>
          <TableCell className="text-right">$350.00</TableCell>
        </TableRow>
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableCell colSpan={3}>Total</TableCell>
          <TableCell className="text-right">$750.00</TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  ),
}

export const WithBadges: Story = {
  args: {},
  render: () => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Task</TableHead>
          <TableHead>Priority</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Assignee</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell className="font-medium">Fix navigation bug</TableCell>
          <TableCell>
            <Badge variant="destructive">High</Badge>
          </TableCell>
          <TableCell>
            <Badge variant="secondary">In Progress</Badge>
          </TableCell>
          <TableCell>John Doe</TableCell>
        </TableRow>
        <TableRow>
          <TableCell className="font-medium">Update documentation</TableCell>
          <TableCell>
            <Badge variant="outline">Low</Badge>
          </TableCell>
          <TableCell>
            <Badge variant="outline">Todo</Badge>
          </TableCell>
          <TableCell>Jane Smith</TableCell>
        </TableRow>
        <TableRow>
          <TableCell className="font-medium">Implement dark mode</TableCell>
          <TableCell>
            <Badge className="bg-warning text-white">Medium</Badge>
          </TableCell>
          <TableCell>
            <Badge className="bg-success text-white">Completed</Badge>
          </TableCell>
          <TableCell>Bob Johnson</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  ),
}

export const SelectableRows: Story = {
  args: {},
  render: () => {
    const [selectedRows, setSelectedRows] = useState<number[]>([])
    const data = [
      { id: 1, name: 'John Doe', email: 'john@example.com', role: 'Admin' },
      { id: 2, name: 'Jane Smith', email: 'jane@example.com', role: 'User' },
      { id: 3, name: 'Bob Johnson', email: 'bob@example.com', role: 'User' },
      {
        id: 4,
        name: 'Alice Brown',
        email: 'alice@example.com',
        role: 'Editor',
      },
    ]

    const toggleRow = (id: number) => {
      setSelectedRows((prev) =>
        prev.includes(id) ? prev.filter((row) => row !== id) : [...prev, id],
      )
    }

    const toggleAll = () => {
      setSelectedRows((prev) =>
        prev.length === data.length ? [] : data.map((item) => item.id),
      )
    }

    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-sm">
            {selectedRows.length} of {data.length} row(s) selected
          </span>
          {selectedRows.length > 0 && (
            <Button size="sm" variant="outline">
              Delete selected
            </Button>
          )}
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[50px]">
                <Checkbox
                  checked={
                    selectedRows.length > 0 && selectedRows.length < data.length
                      ? 'indeterminate'
                      : selectedRows.length === data.length
                  }
                  onCheckedChange={toggleAll}
                />
              </TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((row) => (
              <TableRow
                key={row.id}
                data-state={selectedRows.includes(row.id) && 'selected'}
              >
                <TableCell>
                  <Checkbox
                    checked={selectedRows.includes(row.id)}
                    onCheckedChange={() => toggleRow(row.id)}
                  />
                </TableCell>
                <TableCell className="font-medium">{row.name}</TableCell>
                <TableCell>{row.email}</TableCell>
                <TableCell>{row.role}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    )
  },
}

export const SortableColumns: Story = {
  args: {},
  render: () => {
    const [sortConfig, setSortConfig] = useState<{
      key: string
      direction: 'asc' | 'desc' | null
    }>({ key: '', direction: null })

    const data = [
      { product: 'Laptop', price: 999, stock: 15, sales: 230 },
      { product: 'Phone', price: 699, stock: 42, sales: 180 },
      { product: 'Tablet', price: 399, stock: 28, sales: 95 },
      { product: 'Monitor', price: 299, stock: 8, sales: 150 },
      { product: 'Keyboard', price: 79, stock: 120, sales: 420 },
    ]

    const handleSort = (key: string) => {
      let direction: 'asc' | 'desc' | null = 'asc'
      if (sortConfig.key === key) {
        if (sortConfig.direction === 'asc') direction = 'desc'
        else if (sortConfig.direction === 'desc') direction = null
      }
      setSortConfig({ key, direction })
    }

    const sortedData = [...data].sort((a, b) => {
      if (!sortConfig.direction) return 0
      const aVal = a[sortConfig.key as keyof typeof a]
      const bVal = b[sortConfig.key as keyof typeof b]

      if (typeof aVal === 'string') {
        return sortConfig.direction === 'asc'
          ? aVal.localeCompare(bVal as string)
          : (bVal as string).localeCompare(aVal)
      }

      return sortConfig.direction === 'asc'
        ? (aVal as number) - (bVal as number)
        : (bVal as number) - (aVal as number)
    })

    const getSortIcon = (column: string) => {
      if (sortConfig.key !== column) return <ArrowUpDown className="h-4 w-4" />
      if (sortConfig.direction === 'asc') return <ArrowUp className="h-4 w-4" />
      if (sortConfig.direction === 'desc')
        return <ArrowDown className="h-4 w-4" />
      return <ArrowUpDown className="h-4 w-4" />
    }

    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>
              <Button
                variant="ghost"
                onClick={() => handleSort('product')}
                className="h-auto p-0 font-medium hover:bg-transparent"
              >
                Product
                {getSortIcon('product')}
              </Button>
            </TableHead>
            <TableHead>
              <Button
                variant="ghost"
                onClick={() => handleSort('price')}
                className="h-auto p-0 font-medium hover:bg-transparent"
              >
                Price
                {getSortIcon('price')}
              </Button>
            </TableHead>
            <TableHead>
              <Button
                variant="ghost"
                onClick={() => handleSort('stock')}
                className="h-auto p-0 font-medium hover:bg-transparent"
              >
                Stock
                {getSortIcon('stock')}
              </Button>
            </TableHead>
            <TableHead>
              <Button
                variant="ghost"
                onClick={() => handleSort('sales')}
                className="h-auto p-0 font-medium hover:bg-transparent"
              >
                Sales
                {getSortIcon('sales')}
              </Button>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedData.map((row) => (
            <TableRow key={row.product}>
              <TableCell className="font-medium">{row.product}</TableCell>
              <TableCell>${row.price}</TableCell>
              <TableCell>
                <span className={row.stock < 10 ? 'text-danger' : ''}>
                  {row.stock}
                </span>
              </TableCell>
              <TableCell>{row.sales}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    )
  },
}

export const ExpandableRows: Story = {
  args: {},
  render: () => {
    const [expandedRows, setExpandedRows] = useState<number[]>([])

    const orders = [
      {
        id: 1,
        orderNumber: 'ORD-001',
        customer: 'John Doe',
        total: 450.0,
        status: 'delivered',
        items: [
          { name: 'Product A', qty: 2, price: 150 },
          { name: 'Product B', qty: 1, price: 300 },
        ],
      },
      {
        id: 2,
        orderNumber: 'ORD-002',
        customer: 'Jane Smith',
        total: 220.0,
        status: 'processing',
        items: [
          { name: 'Product C', qty: 1, price: 120 },
          { name: 'Product D', qty: 2, price: 50 },
        ],
      },
      {
        id: 3,
        orderNumber: 'ORD-003',
        customer: 'Bob Johnson',
        total: 780.0,
        status: 'pending',
        items: [
          { name: 'Product E', qty: 3, price: 200 },
          { name: 'Product F', qty: 2, price: 90 },
        ],
      },
    ]

    const toggleRow = (id: number) => {
      setExpandedRows((prev) =>
        prev.includes(id) ? prev.filter((row) => row !== id) : [...prev, id],
      )
    }

    const getStatusBadge = (status: string) => {
      switch (status) {
        case 'delivered':
          return <Badge className="bg-success text-white">Delivered</Badge>
        case 'processing':
          return <Badge className="bg-info text-white">Processing</Badge>
        case 'pending':
          return <Badge variant="secondary">Pending</Badge>
        default:
          return <Badge variant="outline">{status}</Badge>
      }
    }

    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[50px]"></TableHead>
            <TableHead>Order</TableHead>
            <TableHead>Customer</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Total</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {orders.map((order) => (
            <>
              <TableRow key={order.id}>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => toggleRow(order.id)}
                  >
                    {expandedRows.includes(order.id) ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </Button>
                </TableCell>
                <TableCell className="font-medium">
                  {order.orderNumber}
                </TableCell>
                <TableCell>{order.customer}</TableCell>
                <TableCell>{getStatusBadge(order.status)}</TableCell>
                <TableCell className="text-right">
                  ${order.total.toFixed(2)}
                </TableCell>
              </TableRow>
              {expandedRows.includes(order.id) && (
                <TableRow>
                  <TableCell colSpan={5} className="bg-muted/50">
                    <div className="p-4">
                      <h4 className="mb-2 text-sm font-medium">Order Items</h4>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Product</TableHead>
                            <TableHead>Quantity</TableHead>
                            <TableHead>Price</TableHead>
                            <TableHead className="text-right">
                              Subtotal
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {order.items.map((item, index) => (
                            <TableRow key={index}>
                              <TableCell>{item.name}</TableCell>
                              <TableCell>{item.qty}</TableCell>
                              <TableCell>${item.price}</TableCell>
                              <TableCell className="text-right">
                                ${(item.qty * item.price).toFixed(2)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </>
          ))}
        </TableBody>
      </Table>
    )
  },
}

export const UserManagementTable: Story = {
  args: {},
  render: () => {
    const users = [
      {
        id: 1,
        name: 'John Doe',
        email: 'john.doe@example.com',
        role: 'Admin',
        status: 'active',
        lastActive: '2 hours ago',
        avatar: '/placeholder.svg',
      },
      {
        id: 2,
        name: 'Jane Smith',
        email: 'jane.smith@example.com',
        role: 'Editor',
        status: 'active',
        lastActive: '1 day ago',
        avatar: '/placeholder.svg',
      },
      {
        id: 3,
        name: 'Bob Johnson',
        email: 'bob.johnson@example.com',
        role: 'Viewer',
        status: 'inactive',
        lastActive: '1 week ago',
        avatar: '/placeholder.svg',
      },
      {
        id: 4,
        name: 'Alice Brown',
        email: 'alice.brown@example.com',
        role: 'Editor',
        status: 'active',
        lastActive: '5 minutes ago',
        avatar: '/placeholder.svg',
      },
    ]

    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Users</CardTitle>
              <CardDescription>
                Manage your team members and their permissions
              </CardDescription>
            </div>
            <Button>
              <Users className="mr-2 h-4 w-4" />
              Add User
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex items-center gap-4">
            <div className="relative flex-1">
              <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
              <Input placeholder="Search users..." className="pl-10" />
            </div>
            <Button variant="outline" size="icon">
              <Filter className="h-4 w-4" />
            </Button>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last Active</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={user.avatar} />
                        <AvatarFallback>
                          {user.name
                            .split(' ')
                            .map((n) => n[0])
                            .join('')}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium">{user.name}</p>
                        <p className="text-muted-foreground text-sm">
                          {user.email}
                        </p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{user.role}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div
                        className={`h-2 w-2 rounded-full ${
                          user.status === 'active' ? 'bg-success' : 'bg-muted'
                        }`}
                      />
                      <span className="text-sm capitalize">{user.status}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {user.lastActive}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    )
  },
}

export const FinancialTable: Story = {
  args: {},
  render: () => {
    const transactions = [
      {
        id: 'TXN001',
        date: '2024-03-15',
        description: 'Payment from Client A',
        category: 'Income',
        amount: 5000,
        type: 'credit',
        status: 'completed',
      },
      {
        id: 'TXN002',
        date: '2024-03-14',
        description: 'Office Supplies',
        category: 'Expenses',
        amount: -234.5,
        type: 'debit',
        status: 'completed',
      },
      {
        id: 'TXN003',
        date: '2024-03-13',
        description: 'Software Subscription',
        category: 'Expenses',
        amount: -99.99,
        type: 'debit',
        status: 'completed',
      },
      {
        id: 'TXN004',
        date: '2024-03-12',
        description: 'Refund to Customer',
        category: 'Refunds',
        amount: -150,
        type: 'debit',
        status: 'pending',
      },
      {
        id: 'TXN005',
        date: '2024-03-11',
        description: 'Payment from Client B',
        category: 'Income',
        amount: 3500,
        type: 'credit',
        status: 'completed',
      },
    ]

    const formatCurrency = (amount: number) => {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
      }).format(Math.abs(amount))
    }

    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Financial Transactions
          </CardTitle>
          <CardDescription>
            Recent transactions and payment history
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Transaction ID</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transactions.map((transaction) => (
                <TableRow key={transaction.id}>
                  <TableCell className="font-mono text-sm">
                    {transaction.id}
                  </TableCell>
                  <TableCell>{transaction.date}</TableCell>
                  <TableCell>{transaction.description}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{transaction.category}</Badge>
                  </TableCell>
                  <TableCell>
                    {transaction.status === 'completed' ? (
                      <Badge className="bg-success/10 text-success border-success/20">
                        <CheckCircle className="mr-1 h-3 w-3" />
                        Completed
                      </Badge>
                    ) : (
                      <Badge variant="secondary">
                        <Clock className="mr-1 h-3 w-3" />
                        Pending
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell
                    className={`text-right font-medium ${
                      transaction.type === 'credit'
                        ? 'text-success'
                        : 'text-danger'
                    }`}
                  >
                    {transaction.type === 'credit' ? '+' : ''}
                    {formatCurrency(transaction.amount)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={5}>Net Total</TableCell>
                <TableCell className="text-right font-medium">
                  {formatCurrency(
                    transactions.reduce((sum, t) => sum + t.amount, 0),
                  )}
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </CardContent>
      </Card>
    )
  },
}

export const ProductInventoryTable: Story = {
  args: {},
  render: () => (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Product Inventory
            </CardTitle>
            <CardDescription>
              Monitor stock levels and product performance
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm">
              <Download className="mr-2 h-4 w-4" />
              Export
            </Button>
            <Button size="sm">
              <Package className="mr-2 h-4 w-4" />
              Add Product
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Stock</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Sales</TableHead>
              <TableHead className="text-right">Revenue</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell>
                <div className="flex items-center gap-3">
                  <div className="bg-muted h-10 w-10 rounded" />
                  <div>
                    <p className="font-medium">Wireless Headphones</p>
                    <p className="text-muted-foreground text-sm">
                      Premium audio quality
                    </p>
                  </div>
                </div>
              </TableCell>
              <TableCell className="font-mono text-sm">WH-1001</TableCell>
              <TableCell>Electronics</TableCell>
              <TableCell>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Progress value={75} className="h-2 w-20" />
                    <span className="text-sm">150</span>
                  </div>
                  <p className="text-muted-foreground text-xs">75% in stock</p>
                </div>
              </TableCell>
              <TableCell>
                <Badge className="bg-success/10 text-success border-success/20">
                  In Stock
                </Badge>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-1">
                  <TrendingUp className="text-success h-4 w-4" />
                  <span>342</span>
                </div>
              </TableCell>
              <TableCell className="text-right font-medium">$34,200</TableCell>
            </TableRow>
            <TableRow>
              <TableCell>
                <div className="flex items-center gap-3">
                  <div className="bg-muted h-10 w-10 rounded" />
                  <div>
                    <p className="font-medium">Smart Watch</p>
                    <p className="text-muted-foreground text-sm">
                      Fitness tracking
                    </p>
                  </div>
                </div>
              </TableCell>
              <TableCell className="font-mono text-sm">SW-2001</TableCell>
              <TableCell>Wearables</TableCell>
              <TableCell>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Progress value={25} className="h-2 w-20" />
                    <span className="text-sm">25</span>
                  </div>
                  <p className="text-warning text-xs">Low stock</p>
                </div>
              </TableCell>
              <TableCell>
                <Badge className="bg-warning/10 text-warning border-warning/20">
                  Low Stock
                </Badge>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-1">
                  <TrendingUp className="text-success h-4 w-4" />
                  <span>189</span>
                </div>
              </TableCell>
              <TableCell className="text-right font-medium">$47,250</TableCell>
            </TableRow>
            <TableRow>
              <TableCell>
                <div className="flex items-center gap-3">
                  <div className="bg-muted h-10 w-10 rounded" />
                  <div>
                    <p className="font-medium">USB-C Cable</p>
                    <p className="text-muted-foreground text-sm">
                      Fast charging
                    </p>
                  </div>
                </div>
              </TableCell>
              <TableCell className="font-mono text-sm">UC-3001</TableCell>
              <TableCell>Accessories</TableCell>
              <TableCell>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Progress value={0} className="h-2 w-20" />
                    <span className="text-sm">0</span>
                  </div>
                  <p className="text-danger text-xs">Out of stock</p>
                </div>
              </TableCell>
              <TableCell>
                <Badge variant="destructive">Out of Stock</Badge>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-1">
                  <TrendingDown className="text-danger h-4 w-4" />
                  <span>567</span>
                </div>
              </TableCell>
              <TableCell className="text-right font-medium">$11,340</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  ),
}

export const LoadingState: Story = {
  args: {},
  render: () => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Email</TableHead>
          <TableHead>Role</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {[1, 2, 3, 4, 5].map((i) => (
          <TableRow key={i}>
            <TableCell>
              <Skeleton className="h-4 w-32" />
            </TableCell>
            <TableCell>
              <Skeleton className="h-4 w-48" />
            </TableCell>
            <TableCell>
              <Skeleton className="h-5 w-16" />
            </TableCell>
            <TableCell>
              <Skeleton className="h-5 w-20" />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  ),
}

export const EmptyState: Story = {
  args: {},
  render: () => (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead>Price</TableHead>
              <TableHead>Stock</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell colSpan={4} className="h-32 text-center">
                <div className="flex flex-col items-center justify-center gap-2">
                  <Package className="text-muted-foreground h-8 w-8" />
                  <p className="text-muted-foreground">No products found</p>
                  <Button size="sm" className="mt-2">
                    Add your first product
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  ),
}

export const CoreLiveThemeShowcase: Story = {
  args: {},
  render: () => (
    <div className="w-full space-y-6">
      <div>
        <h3 className="text-heading-3 mb-4 font-medium">Table Variations</h3>
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Default Table</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow
                    style={{
                      backgroundColor:
                        'var(--component-table-header-background)',
                    }}
                  >
                    <TableHead
                      style={{ color: 'var(--component-table-header-text)' }}
                    >
                      Column 1
                    </TableHead>
                    <TableHead
                      style={{ color: 'var(--component-table-header-text)' }}
                    >
                      Column 2
                    </TableHead>
                    <TableHead
                      style={{ color: 'var(--component-table-header-text)' }}
                    >
                      Column 3
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow
                    style={{
                      borderColor: 'var(--component-table-row-border)',
                    }}
                  >
                    <TableCell>Row 1, Cell 1</TableCell>
                    <TableCell>Row 1, Cell 2</TableCell>
                    <TableCell>Row 1, Cell 3</TableCell>
                  </TableRow>
                  <TableRow
                    className="hover:bg-muted/50"
                    style={{
                      borderColor: 'var(--component-table-row-border)',
                    }}
                  >
                    <TableCell>Row 2, Cell 1</TableCell>
                    <TableCell>Row 2, Cell 2</TableCell>
                    <TableCell>Row 2, Cell 3</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </div>

      <div>
        <h3 className="text-heading-3 mb-4 font-medium">Semantic States</h3>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Status</TableHead>
              <TableHead>User</TableHead>
              <TableHead>Progress</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow className="bg-success/5 hover:bg-success/10">
              <TableCell>
                <Badge className="bg-success text-white">
                  <CheckCircle className="mr-1 h-3 w-3" />
                  Active
                </Badge>
              </TableCell>
              <TableCell>Success Row</TableCell>
              <TableCell>
                <Progress value={100} className="h-2" />
              </TableCell>
              <TableCell>
                <Button size="sm" variant="ghost">
                  View
                </Button>
              </TableCell>
            </TableRow>
            <TableRow className="bg-warning/5 hover:bg-warning/10">
              <TableCell>
                <Badge className="bg-warning text-white">
                  <AlertCircle className="mr-1 h-3 w-3" />
                  Warning
                </Badge>
              </TableCell>
              <TableCell>Warning Row</TableCell>
              <TableCell>
                <Progress value={60} className="h-2" />
              </TableCell>
              <TableCell>
                <Button size="sm" variant="ghost">
                  View
                </Button>
              </TableCell>
            </TableRow>
            <TableRow className="bg-danger/5 hover:bg-danger/10">
              <TableCell>
                <Badge variant="destructive">
                  <XCircle className="mr-1 h-3 w-3" />
                  Error
                </Badge>
              </TableCell>
              <TableCell>Error Row</TableCell>
              <TableCell>
                <Progress value={0} className="h-2" />
              </TableCell>
              <TableCell>
                <Button size="sm" variant="ghost">
                  View
                </Button>
              </TableCell>
            </TableRow>
            <TableRow className="bg-info/5 hover:bg-info/10">
              <TableCell>
                <Badge className="bg-info text-white">
                  <Info className="mr-1 h-3 w-3" />
                  Info
                </Badge>
              </TableCell>
              <TableCell>Info Row</TableCell>
              <TableCell>
                <Progress value={30} className="h-2" />
              </TableCell>
              <TableCell>
                <Button size="sm" variant="ghost">
                  View
                </Button>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>

      <div>
        <h3 className="text-heading-3 mb-4 font-medium">
          Component Token Usage
        </h3>
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-4">
              <table
                className="w-full"
                style={{
                  borderCollapse: 'collapse',
                  backgroundColor: 'var(--component-table-background)',
                }}
              >
                <thead>
                  <tr
                    style={{
                      backgroundColor:
                        'var(--component-table-header-background)',
                      borderBottom:
                        '1px solid var(--component-table-header-border)',
                    }}
                  >
                    <th
                      className="p-3 text-left"
                      style={{ color: 'var(--component-table-header-text)' }}
                    >
                      Token
                    </th>
                    <th
                      className="p-3 text-left"
                      style={{ color: 'var(--component-table-header-text)' }}
                    >
                      Usage
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    style={{
                      borderBottom:
                        '1px solid var(--component-table-row-border)',
                    }}
                  >
                    <td className="p-3 font-mono text-sm">
                      --component-table-background
                    </td>
                    <td className="p-3">Table background color</td>
                  </tr>
                  <tr
                    className="hover:bg-muted/50"
                    style={{
                      borderBottom:
                        '1px solid var(--component-table-row-border)',
                    }}
                  >
                    <td className="p-3 font-mono text-sm">
                      --component-table-header-background
                    </td>
                    <td className="p-3">Header row background</td>
                  </tr>
                  <tr
                    style={{
                      borderBottom:
                        '1px solid var(--component-table-row-border)',
                    }}
                  >
                    <td className="p-3 font-mono text-sm">
                      --component-table-row-hover
                    </td>
                    <td className="p-3">Row hover state background</td>
                  </tr>
                </tbody>
              </table>

              <div className="bg-muted rounded-md p-3">
                <code className="text-xs">
                  --component-table-background
                  <br />
                  --component-table-header-background
                  <br />
                  --component-table-header-text
                  <br />
                  --component-table-header-border
                  <br />
                  --component-table-row-border
                  <br />
                  --component-table-row-hover
                  <br />
                  --component-table-cell-padding
                </code>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div>
        <h3 className="text-heading-3 mb-4 font-medium">
          Complex Table Features
        </h3>
        <Card>
          <CardHeader>
            <CardTitle>Analytics Dashboard</CardTitle>
            <CardDescription>
              Performance metrics and user engagement
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Metric</TableHead>
                  <TableHead>Current</TableHead>
                  <TableHead>Previous</TableHead>
                  <TableHead>Change</TableHead>
                  <TableHead>Trend</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <Users className="text-muted-foreground h-4 w-4" />
                      Active Users
                    </div>
                  </TableCell>
                  <TableCell className="font-mono">12,543</TableCell>
                  <TableCell className="text-muted-foreground font-mono">
                    10,234
                  </TableCell>
                  <TableCell>
                    <Badge className="bg-success/10 text-success border-success/20">
                      +22.5%
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <TrendingUp className="text-success h-4 w-4" />
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <ShoppingCart className="text-muted-foreground h-4 w-4" />
                      Conversion Rate
                    </div>
                  </TableCell>
                  <TableCell className="font-mono">3.2%</TableCell>
                  <TableCell className="text-muted-foreground font-mono">
                    3.5%
                  </TableCell>
                  <TableCell>
                    <Badge className="bg-danger/10 text-danger border-danger/20">
                      -8.6%
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <TrendingDown className="text-danger h-4 w-4" />
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <DollarSign className="text-muted-foreground h-4 w-4" />
                      Revenue
                    </div>
                  </TableCell>
                  <TableCell className="font-mono">$84,232</TableCell>
                  <TableCell className="text-muted-foreground font-mono">
                    $72,145
                  </TableCell>
                  <TableCell>
                    <Badge className="bg-success/10 text-success border-success/20">
                      +16.7%
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <TrendingUp className="text-success h-4 w-4" />
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Comprehensive showcase of table variations using CoreLive Design System tokens for consistent data display across different contexts.',
      },
    },
  },
}
