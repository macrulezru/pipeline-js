export class ErrorHandler {
  handle(error: any, stageKey: string) {
    // TODO: реализовать классификацию и обработку ошибок
    return { type: 'unknown', error, stageKey };
  }
}
