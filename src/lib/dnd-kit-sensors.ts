import {
  KeyboardSensor,
  PointerActivationConstraints,
  PointerSensor,
  type Sensors,
} from '@dnd-kit/dom'

const TODO_SORT_DISTANCE = 8
const SKILL_TREE_MOUSE_DISTANCE = 6
const SKILL_TREE_TOUCH_DELAY_MS = 250
const SKILL_TREE_TOUCH_TOLERANCE = 5

/**
 * Creates a fresh pointer-distance activation constraint for each drag start.
 * Reusing one constraint instance would keep internal pointer coordinates
 * between drags, so this helper is called from the sensor callback.
 * @param value - Minimum pointer movement before drag activation.
 * @returns A distance constraint for the latest dnd-kit PointerSensor.
 * @example
 * createDistanceConstraint(8)
 */
function createDistanceConstraint(value: number) {
  return new PointerActivationConstraints.Distance({ value })
}

/**
 * Creates a fresh touch-delay activation constraint for each drag start.
 * The skill-tree drawer uses this to preserve the old touch affordance after
 * migrating from the legacy TouchSensor to the latest PointerSensor.
 * @param value - Milliseconds to hold before activating the drag.
 * @param tolerance - Movement allowed before the delayed activation aborts.
 * @returns A delay constraint for touch pointer interactions.
 * @example
 * createDelayConstraint(250, 5)
 */
function createDelayConstraint(value: number, tolerance: number) {
  return new PointerActivationConstraints.Delay({ value, tolerance })
}

/**
 * Preserves the todo-list sortable drag threshold from the legacy dnd-kit API.
 * @returns The shared sensor list consumed by DragDropProvider.
 * @example
 * <DragDropProvider sensors={todoSortableSensors} />
 */
export const todoSortableSensors: Sensors = [
  PointerSensor.configure({
    activationConstraints: () => [createDistanceConstraint(TODO_SORT_DISTANCE)],
  }),
  KeyboardSensor,
]

/**
 * Builds skill-tree pointer constraints with mouse and touch parity.
 * @param event - The native pointer event that may start a drag.
 * @returns Touch delay constraints or mouse distance constraints.
 * @example
 * createSkillTreeActivationConstraints(new PointerEvent('pointerdown'))
 */
function createSkillTreeActivationConstraints(event: PointerEvent) {
  if (event.pointerType === 'touch') {
    return [
      createDelayConstraint(
        SKILL_TREE_TOUCH_DELAY_MS,
        SKILL_TREE_TOUCH_TOLERANCE,
      ),
    ]
  }

  return [createDistanceConstraint(SKILL_TREE_MOUSE_DISTANCE)]
}

/**
 * Preserves skill-tree mouse and touch activation behavior on the latest API.
 * @returns The shared sensor list consumed by DragDropProvider.
 * @example
 * <DragDropProvider sensors={skillTreeSensors} />
 */
export const skillTreeSensors: Sensors = [
  PointerSensor.configure({
    activationConstraints: createSkillTreeActivationConstraints,
  }),
  KeyboardSensor,
]
