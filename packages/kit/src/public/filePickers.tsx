import { NativeFilePicker } from './NativeFilePicker.tsx'

/** The picker's label, the selected file and the kind of media it accepts. */
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

/** A button that opens the system photo chooser and returns one photo or video as a `File`. */
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

/** The importer's label, the selected files and the content types it accepts, as MIME types or
 * extensions. */
export type FileImporterProps = {
  label?: string
  selection: readonly File[]
  onSelectionChange(files: File[]): void
  allowedContentTypes?: readonly string[]
  allowsMultipleSelection?: boolean
  disabled?: boolean
  onError?(error: Error): void
}

/** A button that opens the system file chooser and returns the chosen files. Cancelling keeps the
 * current selection. */
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
