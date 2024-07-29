import type { ReactElement, ReactNode } from 'react'
import { Children, Fragment, cloneElement, isValidElement } from 'react'
import { twMerge } from 'tailwind-merge'

export const toTitleCase = (str: string) => {
  return str
    .toLowerCase()
    .split(' ')
    .map(function (word) {
      return word.charAt(0).toUpperCase() + word.slice(1)
    })
    .join(' ')
}

// Returns true if an element is a react fragment
export const isReactFragment = (node: ReactNode | typeof Fragment) => {
  if (!node) return false

  if ((node as ReactElement)?.type) {
    return (node as ReactElement)?.type === Fragment
  }

  return node === Fragment
}

// If an invalid element or fragment is passed in as the node, wrap it with the wrapper and add props
// If a valid element is passed, add the props
export const wrapWithElementIfInvalid = ({
  node,
  wrapper,
  props = {},
}: {
  node: ReactNode
  wrapper: ReactElement
  props?: any
}) => {
  if (!node) {
    return cloneElement(wrapper, props)
  } else if (!isValidElement(node)) {
    return cloneElement(wrapper, props, node)
  } else if (isReactFragment(node)) {
    return cloneElement(
      wrapper,
      { ...props, className: twMerge(node.props?.className, props?.className) },
      node.props.children,
    )
  } else {
    return cloneElement(node, {
      ...props,
      className: twMerge(node.props?.className, props?.className),
    })
  }
}

// Returns true if there is a single, string child element
export const isSingleStringChild = (children?: ReactNode) => {
  return (
    children &&
    Children.count(children) === 1 &&
    isValidElement(children) &&
    typeof children.props.children === 'string'
  )
}
