# Glass: known limitations

Satin draws glass by reading the pixels behind it. Browsers refuse to share some pixels with a page, so glass can't show them. This page lists those cases and what to do instead.

## Content glass can't show

| Behind the glass | Why | What to do |
| --- | --- | --- |
| An `<iframe>` from another site, such as a YouTube player or a map embed | The browser never lets a page read another site's pixels. | Keep glass off the frame: put toolbars above or below it. For maps, use a library that draws into your own canvas. |
| An image from another site that isn't served with CORS | Reading it would "taint" the canvas, so the browser blocks it. | Have the server send `Access-Control-Allow-Origin` and set `crossOrigin="anonymous"` on `Image`. Or host the image yourself. |
| Video protected with DRM (FairPlay) | Protected frames are never readable by page code. | Don't overlap the video with glass. Put controls beside it, or hide them while it plays. Video without DRM is not affected. |

Readable pixels also need a supported layout. Glass samples app images and other
readable content inside its scroll surface, but it can miss a fixed background
behind a separate scroller: cards scrolling over a stationary sky image may not
show the sky through the glass. This is a rendering limitation, not a CORS or tint
setting. Moving the image into the scroller changes how it moves, so it isn't a fix.

## Without WebGPU

Satin draws glass with WebGPU, which Safari on iOS 27 provides. If WebGPU is unavailable or fails in a way it can't recover from, a released app switches to a lighter material that blurs and tints the content behind it but doesn't refract. Shapes, motion and controls stay the same.

Development builds don't switch. They report the failure through `onGlassError` and `useGlassErrors`, so you see it while you work.

The live previews in these docs have one more fallback: in a browser without WebGPU they play a recording of the same interaction.

## See also

- [Sheet](../components/sheet.md), which uses glass at its smaller heights.
- [Known issues](../known-issues.md), for glass motion and performance work in progress.
