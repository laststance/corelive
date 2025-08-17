import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import * as React from 'react'

import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
  InputOTPSeparator,
} from './input-otp'

const meta: Meta<typeof InputOTP> = {
  title: 'UI/InputOtp',
  component: InputOTP,
  parameters: { layout: 'centered' },
}
export default meta

type Story = StoryObj<typeof InputOTP>

export const SixDigits: Story = {
  render: () => (
    <InputOTP maxLength={6}>
      <InputOTPGroup>
        <InputOTPSlot index={0} />
        <InputOTPSlot index={1} />
        <InputOTPSlot index={2} />
      </InputOTPGroup>
      <InputOTPSeparator />
      <InputOTPGroup>
        <InputOTPSlot index={3} />
        <InputOTPSlot index={4} />
        <InputOTPSlot index={5} />
      </InputOTPGroup>
    </InputOTP>
  ),
}
