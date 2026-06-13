import { describe, expect, it } from 'vitest'

import { foldLegacyCompletionSoundIntoMoments } from './foldLegacyCompletionSoundIntoMoments'

describe('foldLegacyCompletionSoundIntoMoments', () => {
  it('seeds complete:true from a legacy completion sound when the palette never set moments', () => {
    // Arrange
    const legacyBlob = { completionSound: true }

    // Act
    const folded = foldLegacyCompletionSoundIntoMoments(legacyBlob)

    // Assert
    expect(folded).toEqual({
      'task-create': false,
      complete: true,
      clear: false,
    })
  })

  it('leaves a blob whose legacy completion sound was off untouched (returns undefined)', () => {
    // Arrange
    const legacyOffBlob = { completionSound: false }

    // Act
    const folded = foldLegacyCompletionSoundIntoMoments(legacyOffBlob)

    // Assert
    expect(folded).toBeUndefined()
  })

  it('returns undefined when there is no legacy completion-sound flag to fold', () => {
    // Arrange
    const blobWithoutLegacyFlag = { retainCompletedInList: true }

    // Act
    const folded = foldLegacyCompletionSoundIntoMoments(blobWithoutLegacyFlag)

    // Assert
    expect(folded).toBeUndefined()
  })

  it('keeps an explicit complete:false even though the legacy flag was on (explicit choice wins)', () => {
    // Arrange
    const blobWithExplicitOff = {
      completionSound: true,
      soundMoments: { 'task-create': false, complete: false, clear: false },
    }

    // Act
    const folded = foldLegacyCompletionSoundIntoMoments(blobWithExplicitOff)

    // Assert
    expect(folded).toEqual({
      'task-create': false,
      complete: false,
      clear: false,
    })
  })

  it('preserves already-set moments while folding the legacy complete in', () => {
    // Arrange — task-create explicitly on, complete absent (should seed from legacy)
    const blobWithPartialMoments = {
      completionSound: true,
      soundMoments: { 'task-create': true, clear: false },
    }

    // Act
    const folded = foldLegacyCompletionSoundIntoMoments(blobWithPartialMoments)

    // Assert
    expect(folded).toEqual({
      'task-create': true,
      complete: true,
      clear: false,
    })
  })

  it('returns undefined for malformed non-object persisted values without throwing', () => {
    // Arrange / Act / Assert — null, undefined, string, and number must all be safe
    expect(foldLegacyCompletionSoundIntoMoments(null)).toBeUndefined()
    expect(foldLegacyCompletionSoundIntoMoments(undefined)).toBeUndefined()
    expect(
      foldLegacyCompletionSoundIntoMoments('completionSound'),
    ).toBeUndefined()
    expect(foldLegacyCompletionSoundIntoMoments(42)).toBeUndefined()
  })
})
