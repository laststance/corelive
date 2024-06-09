export default function classNames(...classes: any[]) {
  const flattenClasses = (items: any[]): string[] => {
    return items.reduce((acc, item) => {
      if (Array.isArray(item)) {
        acc.push(...flattenClasses(item))
      } else {
        acc.push(item)
      }
      return acc
    }, [] as string[])
  }

  return flattenClasses(classes).filter(Boolean).join(' ')
}
