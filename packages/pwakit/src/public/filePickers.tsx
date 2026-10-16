import { NativeFilePicker } from './NativeFilePicker.tsx'

/** Select one photo or video as file bytes through the system chooser. */
export type PhotosPickerProps = {
  label?: string
  selection: File | null
  onSelectionChange(file: File): void
  matching?: 'images' | 'videos' | 'imagesAndVideos'
  /** A camera preference, interpreted by the browser rather than guaranteed. */
  capture?: 'user' | 'environment'
  disabled?: boolean
  onError?(error: Error): void
}

/** Photos-library identifiers and persistent access are not exposed by WebKit. */
export function PhotosPicker({
  label = 'Choose Photo',
  selection,
  onSelectionChange,
  matching = 'images',
  ...props
}: PhotosPickerProps) {
  const accept =
    matching === 'images' ? 'image/*' : matching === 'videos' ? 'video/*' : 'image/*,video/*'
  return (
    <NativeFilePicker
      {...props}
      label={label}
      value={selection}
      accept={accept}
      onChange={files => onSelectionChange(files[0]!)}
    />
  )
}

/** Import files from the system chooser. Content types are MIME types or extensions. */
export type FileImporterProps = {
  label?: string
  selection: readonly File[]
  onSelectionChange(files: File[]): void
  allowedContentTypes?: readonly string[]
  allowsMultipleSelection?: boolean
  disabled?: boolean
  onError?(error: Error): void
}

/** Open the system file chooser from a user gesture. Cancel preserves selection. */
export function FileImporter({
  label = 'Import File',
  selection,
  onSelectionChange,
  allowedContentTypes,
  allowsMultipleSelection = false,
  ...props
}: FileImporterProps) {
  return (
    <NativeFilePicker
      {...props}
      label={label}
      value={selection}
      onChange={onSelectionChange}
      accept={allowedContentTypes?.join(',')}
      multiple={allowsMultipleSelection}
    />
  )
}
