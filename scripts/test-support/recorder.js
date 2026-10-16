// Swipe trace recorder (diagnostic only). scripts/swipe-trace/instrument.mjs copies a built app and
// loads this classic script before the app bundle; normal builds never contain it.
//
// Every touch sequence opens a session: each touch/pointer event WebKit delivers (with coalesced
// pointer samples), the native scrub source's scroll events, and every rAF with the live state of
// each navigation track the framework hands over (motionProbe.ts traceNavigationTracks) plus the
// framework's motion records (release decision, handoff, arbitration). A session closes 2.5 s after
// the last contact lifts; sessions that moved a navigation layer are uploaded to /__trace/upload.
// No UI. `globalThis.__SATIN_SWIPE_TRACE__.status()` reports uploads and errors for harnesses.
;(function () {
  'use strict'
  var script = document.currentScript
  var uploadPath = (script && script.dataset.upload) || '/__trace/upload'
  // full: sample every navigation track each frame and keep glass stage marks.
  // frames: only events, rAF timestamps and framework records (the overhead control).
  var recorderRaf = requestAnimationFrame.bind(globalThis)
  var mode = (script && script.dataset.mode) || 'full'
  var CLOSE_AFTER_LIFT_MS = 2500
  var RECENT_RECORD_MS = 1500
  if (mode === 'full') globalThis.__SATIN_LAG_TRACE__ = true

  var sourceIds = new WeakMap()
  var nextSourceId = 0
  function sourceIdentity(source) {
    var profileCost = globalThis.__SATIN_PROFILE__?.begin('recorder:sourceIdentity')
    try {
      if (!sourceIds.has(source)) sourceIds.set(source, ++nextSourceId)
      return {
        id: sourceIds.get(source),
        role: source.hasAttribute('data-satin-row-scrub') ? 'row' : 'navigation',
        x: source.scrollLeft,
        width: source.clientWidth,
        range: source.scrollWidth - source.clientWidth,
        retired: source.hasAttribute('data-satin-scrub-retired'),
      }
    } finally {
      globalThis.__SATIN_PROFILE__?.end(profileCost)
    }
  }
  var activeRow = null
  var contactSources = []
  var rowOrigin = 0
  var session = null
  var closeTimer = 0
  var frameRequest = 0
  var contacts = 0
  var trackSequence = 0
  var liveTracks = []
  var recentRecords = []
  var status = {
    enabled: true,
    mode: mode,
    sessions: 0,
    uploaded: 0,
    dropped: 0,
    lastUploadError: null,
    last: null,
  }

  function now() {
    return performance.now()
  }

  function compactKeyframes(animation) {
    try {
      var effect = animation.effect
      if (!effect || typeof effect.getKeyframes !== 'function') return null
      return effect.getKeyframes().map(function (frame) {
        var compact = { offset: frame.computedOffset }
        if (frame.transform !== undefined) compact.transform = frame.transform
        if (frame.opacity !== undefined) compact.opacity = frame.opacity
        if (frame.clipPath !== undefined) compact.clipPath = frame.clipPath
        return compact
      })
    } catch (error) {
      return null
    }
  }

  function timelineKind(animation) {
    var timeline = animation.timeline
    if (!timeline) return 'none'
    if (timeline === document.timeline) return 'document'
    return timeline.constructor && timeline.constructor.name ? timeline.constructor.name : 'other'
  }

  function timeValue(value) {
    if (value === null || value === undefined) return null
    if (typeof value === 'number') return value
    // ScrollTimeline times are CSSNumericValue percentages.
    return value.value !== undefined ? value.value : Number(String(value))
  }

  // Layer widths come from a ResizeObserver (no forced layout): translate3d percentages resolve
  // against the moving element's own width, which can differ from the framework's binding width.
  var observedTracks = new Map()
  var sizeObserver =
    typeof ResizeObserver === 'function'
      ? new ResizeObserver(function (entries) {
          entries.forEach(function (entry) {
            var box = entry.borderBoxSize && entry.borderBoxSize[0]
            var width = box ? box.inlineSize : entry.contentRect.width
            ;(observedTracks.get(entry.target) || []).forEach(function (track) {
              track.layerWidth = width
            })
          })
        })
      : null

  function observeLayer(track, animation) {
    var target = animation.effect && animation.effect.target
    if (!sizeObserver || !target) return
    var tracks = observedTracks.get(target)
    if (!tracks) {
      tracks = []
      observedTracks.set(target, tracks)
      sizeObserver.observe(target)
    }
    tracks.push(track)
  }

  var sink = {
    record: function (value) {
      if (!status.enabled) return
      var entry = { r: now(), value: value }
      if (session) session.records.push(entry)
      else {
        recentRecords.push(entry)
        while (recentRecords.length && recentRecords[0].r < entry.r - RECENT_RECORD_MS)
          recentRecords.shift()
      }
    },
    tracks: function (phase, list) {
      if (!status.enabled) return
      var at = now()
      if (!session) openSession(at)
      // Keyframes are read once, here for the scrub (its effects are detached at release) and at
      // session close for everything else, so the release handoff frame does no extra work.
      var readNow = mode === 'full' && phase.indexOf('scrub') >= 0
      for (var index = 0; index < list.length; index++) {
        var item = list[index]
        trackSequence += 1
        var track = {
          id: trackSequence,
          phase: phase,
          role: item.role,
          width: item.width,
          at: at,
          timeline: timelineKind(item.animation),
          keyframes: readNow ? compactKeyframes(item.animation) : null,
          animation: item.animation,
        }
        session.tracks.push(track)
        liveTracks.push(track)
        if (mode === 'full') observeLayer(track, item.animation)
      }
      session.navigation = true
      if (contacts === 0) {
        // A navigation without a contact (or after the lift): keep sampling until it settles.
        clearTimeout(closeTimer)
        closeTimer = setTimeout(closeSession, CLOSE_AFTER_LIFT_MS)
      }
      requestFrame()
    },
    completed: [],
    setEnabled: function (enabled) {
      if (status.enabled === enabled) return
      closeSession()
      contacts = 0
      recentRecords = []
      status.enabled = enabled
      if (mode === 'full') globalThis.__SATIN_LAG_TRACE__ = enabled
    },
    status: function () {
      return status
    },
  }
  globalThis.__SATIN_SWIPE_TRACE__ = sink

  function openSession(at) {
    if (mode === 'profile') globalThis.__SATIN_PROFILE__?.start()
    status.sessions += 1
    session = {
      format: 'satin-swipe-trace/1',
      kind: 'touch',
      mode: mode,
      build: buildName(),
      href: location.href,
      userAgent: navigator.userAgent,
      standalone: navigator.standalone === true,
      viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
      screen: { width: screen.width, height: screen.height },
      timeOrigin: performance.timeOrigin,
      start: at,
      end: null,
      touches: [],
      pointers: [],
      clicks: [],
      scrolls: [],
      frames: [],
      tracks: [],
      records: recentRecords.slice(),
      glass: null,
      navigation: false,
      row: false,
      menu: false,
      longTasks: [],
      longTasksSupported:
        typeof PerformanceObserver === 'function' &&
        PerformanceObserver.supportedEntryTypes.includes('longtask'),
    }
    recentRecords = []
    requestFrame()
  }

  function buildName() {
    var module = document.querySelector('script[type="module"][src]')
    return module ? module.getAttribute('src') : null
  }

  function requestFrame() {
    if (!frameRequest) frameRequest = recorderRaf(onFrame)
  }

  function onFrame(timestamp) {
    frameRequest = 0
    if (!session) return
    var started = now()
    var samples = null
    if (mode === 'full' && liveTracks.length) {
      samples = []
      var kept = []
      for (var index = 0; index < liveTracks.length; index++) {
        var track = liveTracks[index]
        var animation = track.animation
        var state = animation.playState
        if (state === 'idle' || !animation.effect) continue
        kept.push(track)
        var timing = animation.effect.getComputedTiming()
        samples.push([track.id, timeValue(animation.currentTime), timing.progress, state])
      }
      liveTracks = kept
    }
    var row = null
    if (mode === 'full' && activeRow) {
      var content = activeRow.querySelector('[data-satin-row-action-content]')
      var source = activeRow.querySelector('[data-satin-row-scrub]')
      if (content) {
        var matrix = new DOMMatrixReadOnly(getComputedStyle(content).transform)
        row = { x: matrix.m41, scrollX: source ? source.scrollLeft : null, origin: rowOrigin }
      }
    }
    var scrubs =
      mode === 'full'
        ? contactSources.map(function (source) {
            return {
              id: sourceIds.get(source),
              x: source.scrollLeft,
              width: source.clientWidth,
              connected: source.isConnected,
              retired: source.hasAttribute('data-satin-scrub-retired'),
            }
          })
        : null
    var finished = now()
    session.frames.push({
      t: timestamp,
      r: started,
      cost: finished - started,
      tracks: samples,
      scrubs: scrubs,
      row: row,
    })
    requestFrame()
  }

  function onTouch(event) {
    if (!status.enabled) return
    var at = now()
    // One upload per gesture: a new first contact ends the previous gesture's session (its release
    // tail up to now is kept) instead of extending it.
    if (event.type === 'touchstart' && session && contacts === 0 && session.touches.length)
      closeSession()
    if (event.type === 'touchstart' && !session) {
      openSession(at)
      session.contactSources = []
      contactSources = []
      for (var node = event.target; node instanceof HTMLElement; node = node.parentElement) {
        if (node.matches('[data-satin-native-scrub], [data-satin-row-scrub]')) {
          contactSources.push(node)
          session.contactSources.push(sourceIdentity(node))
        }
      }
      activeRow =
        event.target instanceof Element ? event.target.closest('[data-satin-row-actions]') : null
      var screenOwner =
        event.target instanceof Element ? event.target.closest('[data-satin-screen-key]') : null
      session.contactTarget = {
        tag: event.target?.tagName,
        screen: screenOwner?.dataset?.satinScreen,
        screenKey: screenOwner?.dataset?.satinScreenKey,
        rowText: activeRow?.textContent?.trim().slice(0, 160),
        horizontalDrag: activeRow?.dataset?.satinHorizontalDrag,
        path: event
          .composedPath?.()
          .filter(function (node) {
            return node instanceof HTMLElement
          })
          .slice(0, 12)
          .map(function (node) {
            return { tag: node.tagName, roles: Object.keys(node.dataset) }
          }),
      }
      if (activeRow) {
        session.row = true
        session.rowPolicy = []
        for (
          var ancestor = event.target;
          ancestor instanceof HTMLElement;
          ancestor = ancestor.parentElement
        ) {
          var policy = getComputedStyle(ancestor)
          session.rowPolicy.push({
            tag: ancestor.tagName,
            role: Object.keys(ancestor.dataset).join(','),
            touchAction: policy.touchAction,
            pointerEvents: policy.pointerEvents,
            overflowX: policy.overflowX,
            width: ancestor.clientWidth,
            scrollWidth: ancestor.scrollWidth,
          })
        }
        var source = activeRow.querySelector('[data-satin-row-scrub]')
        rowOrigin = source ? source.scrollLeft : 0
      }
    }
    if (!session) return
    if (
      event.target instanceof Element &&
      event.target.closest(
        '[aria-haspopup="menu"], [role="menu"], [data-satin-menu-panel], [data-satin-context-lift="true"]',
      )
    ) {
      session.menu = true
    }
    if (event.type === 'touchstart') {
      clearTimeout(closeTimer)
      closeTimer = 0
    }
    var changed = event.changedTouches
    for (var index = 0; index < changed.length; index++) {
      var touch = changed[index]
      session.touches.push({
        type: event.type,
        t: event.timeStamp,
        r: at,
        id: touch.identifier,
        x: touch.clientX,
        y: touch.clientY,
        hit:
          event.type === 'touchstart'
            ? document.elementFromPoint(touch.clientX, touch.clientY)?.tagName
            : undefined,
        force: touch.force,
        radiusX: touch.radiusX,
        radiusY: touch.radiusY,
        touchType: touch.touchType,
        count: event.touches.length,
        cancelable: event.cancelable,
      })
    }
    contacts = event.touches.length
    if ((event.type === 'touchend' || event.type === 'touchcancel') && contacts === 0) {
      clearTimeout(closeTimer)
      closeTimer = setTimeout(closeSession, CLOSE_AFTER_LIFT_MS)
    }
  }

  function onPointer(event) {
    if (!session || event.pointerType !== 'touch') return
    var entry = {
      type: event.type,
      t: event.timeStamp,
      r: now(),
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      pressure: event.pressure,
      width: event.width,
      height: event.height,
    }
    if (event.type === 'pointermove' && typeof event.getCoalescedEvents === 'function') {
      var coalesced = event.getCoalescedEvents()
      if (coalesced.length > 1)
        entry.coalesced = coalesced.map(function (sample) {
          return [sample.timeStamp, sample.clientX, sample.clientY]
        })
    }
    session.pointers.push(entry)
  }

  function onScroll(event) {
    var profileCost = globalThis.__SATIN_PROFILE__?.begin('recorder:onScroll')
    try {
      var target = event.target
      if (!session || !(target instanceof HTMLElement)) return
      if (
        !target.hasAttribute('data-satin-native-scrub') &&
        !target.hasAttribute('data-satin-row-scrub')
      )
        return
      session.scrolls.push({
        t: event.timeStamp,
        r: now(),
        x: target.scrollLeft,
        type: event.type,
        source: sourceIdentity(target),
        contacts: contacts,
      })
    } finally {
      globalThis.__SATIN_PROFILE__?.end(profileCost)
    }
  }

  function onClick(event) {
    if (!session) return
    var target = event.target
    var entry = {
      t: event.timeStamp,
      r: now(),
      pointerId: event.pointerId,
      detail: event.detail,
      target: target instanceof HTMLElement ? Object.keys(target.dataset).join(',') : null,
      prevented: event.defaultPrevented,
    }
    session.clicks.push(entry)
    setTimeout(function () {
      entry.prevented = event.defaultPrevented
    }, 0)
  }

  function glassMarks(start, end) {
    var glass = globalThis.__SATIN_WEBGPU__
    if (mode !== 'full' || !glass || typeof glass.lagTrace !== 'function')
      return Promise.resolve(null)
    var from = performance.timeOrigin + start - 200
    var to = performance.timeOrigin + end
    var inWindow = function (marks) {
      return (marks || []).filter(function (mark) {
        return mark.at >= from && mark.at <= to
      })
    }
    var page = glass.lagTrace()
    var result = { page: inWindow(page), worker: null }
    // The page list is the module's own array: empty it so a long session never hits its cap.
    if (Array.isArray(page)) page.length = 0
    if (typeof glass.report !== 'function') return Promise.resolve(result)
    var deadline = new Promise(function (resolve) {
      setTimeout(resolve, 1000)
    })
    return Promise.race([glass.report(), deadline])
      .then(function (report) {
        if (report && report.lagTrace) result.worker = inWindow(report.lagTrace)
        return result
      })
      .catch(function () {
        return result
      })
  }

  function closeSession() {
    clearTimeout(closeTimer)
    closeTimer = 0
    var closing = session
    if (!closing) return
    session = null
    contactSources = []
    liveTracks = []
    if (sizeObserver) sizeObserver.disconnect()
    observedTracks = new Map()
    if (frameRequest) cancelAnimationFrame(frameRequest)
    frameRequest = 0
    closing.end = now()
    if (mode === 'profile') closing.profile = globalThis.__SATIN_PROFILE__?.stop()
    // Edge contacts the navigation gate saw but that never navigated (a dropped back swipe) are
    // uploaded too, as kind `gesture`.
    var gated = closing.records.some(function (entry) {
      return (
        entry.value &&
        typeof entry.value.kind === 'string' &&
        entry.value.kind.indexOf('navigation-') === 0
      )
    })
    if (!closing.navigation && !gated && !closing.row && !closing.menu) {
      status.dropped += 1
      return
    }
    var scrubbed = closing.tracks.some(function (track) {
      return track.phase.indexOf('scrub') >= 0
    })
    closing.kind = closing.menu
      ? 'menu'
      : closing.row
        ? 'row-swipe'
        : scrubbed
          ? 'swipe'
          : closing.navigation
            ? 'navigation'
            : 'gesture'
    for (var index = 0; index < closing.tracks.length; index++) {
      var track = closing.tracks[index]
      if (!track.keyframes) track.keyframes = compactKeyframes(track.animation)
      delete track.animation
    }
    var costs = closing.frames.map(function (frame) {
      return frame.cost
    })
    closing.recorder = {
      frames: costs.length,
      costMeanMs: costs.length ? costs.reduce(add, 0) / costs.length : 0,
      costMaxMs: costs.length ? Math.max.apply(null, costs) : 0,
    }
    glassMarks(closing.start, closing.end).then(function (glass) {
      closing.glass = glass
      sink.completed.push(closing)
      if (sink.completed.length > 30) sink.completed.shift()
      upload(closing)
    })
  }

  function add(sum, value) {
    return sum + value
  }

  // A proxy hiccup must not lose a swipe.
  var UPLOAD_ATTEMPTS = 3
  var UPLOAD_RETRY_MS = 1000

  function post(payload, headers, attempts) {
    return fetch(uploadPath, { method: 'POST', headers: headers, body: payload })
      .then(function (response) {
        if (!response.ok) throw new Error('HTTP ' + response.status)
      })
      .catch(function (error) {
        if (attempts <= 1) throw error
        status.retries = (status.retries || 0) + 1
        return new Promise(function (resolve) {
          setTimeout(resolve, UPLOAD_RETRY_MS)
        }).then(function () {
          return post(payload, headers, attempts - 1)
        })
      })
  }

  function upload(trace) {
    var started = now()
    var text = JSON.stringify(trace)
    var headers = { 'content-type': 'application/json' }
    var body = Promise.resolve(text)
    if (typeof CompressionStream === 'function') {
      headers['x-trace-encoding'] = 'gzip'
      var stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))
      body = new Response(stream).arrayBuffer()
    }
    body
      .then(function (payload) {
        return post(payload, headers, UPLOAD_ATTEMPTS)
      })
      .then(function () {
        status.uploaded += 1
        status.lastUploadError = null
      })
      .catch(function (error) {
        status.lastUploadError = String(error && error.message ? error.message : error)
      })
      .then(function () {
        status.last = {
          kind: trace.kind,
          start: trace.start,
          touches: trace.touches.length,
          frames: trace.frames.length,
          tracks: trace.tracks.length,
          recorder: trace.recorder,
          uploadMs: now() - started,
        }
      })
  }

  if (
    typeof PerformanceObserver === 'function' &&
    PerformanceObserver.supportedEntryTypes.includes('longtask')
  ) {
    new PerformanceObserver(function (list) {
      if (session)
        list.getEntries().forEach(function (entry) {
          session.longTasks.push({ t: entry.startTime, duration: entry.duration })
        })
    }).observe({ type: 'longtask', buffered: false })
  }
  var options = { capture: true, passive: true }
  ;['touchstart', 'touchmove', 'touchend', 'touchcancel'].forEach(function (type) {
    addEventListener(type, onTouch, options)
  })
  ;['pointerdown', 'pointermove', 'pointerup', 'pointercancel'].forEach(function (type) {
    addEventListener(type, onPointer, options)
  })
  addEventListener('click', onClick, options)
  document.addEventListener('scroll', onScroll, options)
  document.addEventListener('scrollend', onScroll, options)
})()
