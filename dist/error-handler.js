export class ErrorHandler {
    handle(error, stageKey) {
        // TODO: реализовать классификацию и обработку ошибок
        return { type: 'unknown', error, stageKey };
    }
}
