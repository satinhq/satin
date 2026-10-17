/** Shared with pull-to-refresh. Its historical cycle remains pending a native motion fit. */
export function ActivityIndicatorSegments({ running }: { running: boolean }) {
  return Array.from({ length: 8 }, (_, index) => (
    <rect
      key={index}
      x="9"
      y="1"
      width="2"
      height="5"
      rx="1"
      fill="currentColor"
      transform={`rotate(${index * 45} 10 10)`}
      opacity={(index + 1) / 8}
    >
      {running && (
        <animate
          attributeName="opacity"
          values="1;0.15"
          dur="1.5s"
          begin={`${index * 0.1875}s`}
          repeatCount="indefinite"
        />
      )}
    </rect>
  ))
}
