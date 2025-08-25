# Playing audio

_Updated: June 21, 2023 - Added guidance for visionOS._

Audio can enhance the experience of using your app or game by providing feedback, conveying important information, and immersing people in a virtual world.

## Best practices

**Use system-provided audio components when possible.** System-provided audio components automatically respond to device changes and system states, such as silent mode, and they typically use less power than custom audio components.

**Avoid playing audio when people don't expect it.** For example, if your app or game isn't currently in the foreground, it generally shouldn't play audio. If your app needs to play audio while in the background, use the system's audio playback controls so people can manage the experience.

**Respect the mute switch.** People use the mute switch to silence their device for a reason. Your app or game should respect this choice by silencing all audio when the mute switch is enabled, with the exception of audio that's essential to the core functionality of your app.

**Provide a control that mutes or adjusts the volume of your app's audio.** People expect to be able to control the audio volume of an app or game independently of the system volume.

**Consider how your audio interacts with other audio.** Your app's audio should work well with other audio that might be playing, such as music from the Music app. If your app's audio doesn't need to be exclusive, consider using the _mixable_ audio session category, which lets your audio play alongside other audio. For developer guidance, see [AVAudioSession.Category.ambient](https://developer.apple.com/documentation/avfaudio/avaudiosession/category/1616560-ambient).

**Consider providing closed captions or transcripts for important audio content.** Closed captions and transcripts help people who are deaf or hard of hearing enjoy your app or game.

## Spatial Audio

_Spatial Audio_ creates the perception of sound coming from various directions around the listener, helping to create an immersive experience. When you use the system's audio frameworks, you can place sounds in 3D space and the system renders them correctly based on the device and the context in which people are using your app or game.

**Use Spatial Audio to enhance immersion.** Spatial Audio can make your app or game more immersive by placing sounds in 3D space, helping people feel like they're in the environment you've created.

**Place sounds in logical locations.** When you use Spatial Audio, place sounds where people would expect them to be. For example, if your app shows a video of a person speaking, place the audio at the person's mouth.

**Consider how head movement affects audio perception.** When people move their head, the perceived location of sounds should remain consistent with the visual scene. For example, if a sound is coming from an object to the left of the viewer, the sound should continue to come from the left as the viewer turns their head.

## Platform considerations

_No additional considerations for iOS, iPadOS, macOS, or tvOS._

### visionOS

In visionOS, Spatial Audio is particularly important because it helps create a sense of presence in the 3D environment. The system automatically applies acoustic ray tracing to audio sources in your app or game, making the audio sound natural in the wearer's physical space.

**Position audio sources in 3D space to match their visual representation.** When you place an audio source in the same location as its visual representation, you create a more believable and immersive experience.

**Use Spatial Audio to direct attention.** You can use Spatial Audio to direct people's attention to specific areas or objects in your app or game. For example, if you want someone to notice an object to their right, you might play a sound from that direction.

**Consider the distance of audio sources.** The perceived volume and clarity of a sound should change based on its distance from the listener. Sounds that are farther away should be quieter and less distinct than sounds that are closer.

**Use audio occlusion to enhance realism.** When an object blocks the path between an audio source and the listener, the sound should be muffled or attenuated. This helps create a more realistic audio experience.

### watchOS

In watchOS, audio playback is often routed to a paired iPhone or Bluetooth headphones.

**Consider how people will hear your app's audio.** People might listen to your watchOS app's audio through the watch's speaker, through a paired iPhone, or through Bluetooth headphones. Design your audio experience to work well in all these scenarios.

**Be mindful of the watch's small speaker.** The watch's speaker is designed for brief audio feedback and alerts, not for extended audio playback. If your app needs to play audio for an extended period, consider routing the audio to a paired iPhone or Bluetooth headphones.

## Resources

#### Related

[Playing haptics](/design/human-interface-guidelines/playing-haptics)
[Playing video](/design/human-interface-guidelines/playing-video)

#### Developer documentation

[AVFoundation](https://developer.apple.com/documentation/avfoundation) — iOS, iPadOS, macOS, tvOS, watchOS
[AVAudioEngine](https://developer.apple.com/documentation/avfaudio/avaudioengine) — iOS, iPadOS, macOS, tvOS, watchOS
[AVAudioSession](https://developer.apple.com/documentation/avfaudio/avaudiosession) — iOS, iPadOS, tvOS, watchOS

#### Videos

[Explore immersive sound design](https://developer.apple.com/videos/play/wwdc2023/10271)
[Enhance your Spatial Audio experience with dynamic head tracking](https://developer.apple.com/videos/play/wwdc2022/10176)

## Change log

| Date          | Changes                      |
| ------------- | ---------------------------- |
| June 21, 2023 | Added guidance for visionOS. |

---

_Source: [Apple Human Interface Guidelines - Playing audio](https://developer.apple.com/design/human-interface-guidelines/playing-audio)_
