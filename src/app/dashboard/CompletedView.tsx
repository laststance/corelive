'use client'

import React from 'react'

import type { TODO } from '@/types/utility'

interface Props {
  completedTasks: TODO
}

export const CompletedView: React.FC<Props> = ({ completedTasks }) => {
  return (
    <>
      <h2 className="mb-6 text-primary-content">Completed</h2>
      <ul className="flex flex-col gap-0 text-primary-content">
        {completedTasks.map((item, i) => (
          <li key={i} className="my-0 flex items-center gap-2">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-5 w-5"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
                clipRule="evenodd"
              />
            </svg>
            <div className="text-balance">
              {item.title} - {item.category.name}
            </div>
          </li>
        ))}
      </ul>
    </>
  )
}
