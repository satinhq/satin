import type {
  TransitionController,
  TransitionControllerContext,
  TransitionControllerFactory,
} from '../src/navigation/types.ts'

export function interactiveControllerFactory() {
  const contexts: TransitionControllerContext[] = []
  const controllers: TransitionController[] = []
  const factory: TransitionControllerFactory = (completion, context) => {
    contexts.push(context)
    let completed = false
    let progress = 0
    const transitionController: TransitionController = {
      get progress() {
        return progress
      },
      start() {
        if (!context.interactive) transitionController.finish()
      },
      setProgress(nextProgress) {
        progress = nextProgress
      },
      completeInteractive() {
        transitionController.finish()
      },
      cancelInteractive() {
        transitionController.cancel()
      },
      finish() {
        if (completed) return
        completed = true
        progress = 1
        completion.finish()
      },
      cancel() {
        if (completed) return
        completed = true
        progress = 0
        completion.cancel()
      },
    }
    controllers.push(transitionController)
    return transitionController
  }

  return { contexts, controllers, factory }
}
