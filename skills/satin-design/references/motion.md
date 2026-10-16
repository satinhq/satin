# Motion

## The framework already moves

Pushes, back swipes, sheets, menus, tab switches, button presses, swipe actions and list reordering
all animate natively, with motion measured from iOS. That motion is part of what makes the app feel
real. Leave it alone:

- No CSS transitions or keyframes on framework components.
- No custom springs, easing curves or durations to "improve" them.
- No entrance animations on screens or rows; a pushed screen already arrives.

## Animating your own changes

When your own state changes something visible (a checkmark fills, a row moves, a count changes),
animate it with the framework's presets:

```tsx
withAnimation(Animation.smooth, () => setDone(true))
```

`Animation.default`, `smooth`, `snappy` and `bouncy` cover nearly everything. `snappy` suits small
toggles, `smooth` suits layout changes, and `bouncy` suits playful moments in playful apps.
Keyed rows in a `List` animate reorders inside `withAnimation`.

Good motion on iOS:

- answers something the person did, right away;
- eases out (it starts fast and settles), never moves linearly;
- comes from where the thing came from and returns there;
- can be interrupted mid-way.

## Don't

- Loop animations to attract attention.
- Animate on load or on scroll for decoration.
- Add custom loading spinners; use `ProgressView`.
- Delay content so an animation can finish.

## Reduce Motion

Anything you animate yourself must still make sense with no motion: the end state alone has to tell
the story. Check Reduce Motion before adding motion of your own.
